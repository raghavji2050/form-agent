import type { Frame, Page, Locator } from "playwright";
import type { SubmissionResult } from "../types.js";
import { getPostSubmitWaitMs, getSubmissionTimeout } from "./browser.js";
import { collectValidationErrors } from "./inBrowser/collectValidationErrors.js";
import { findSubmitButton as findSubmitButtonInPage } from "./inBrowser/findSubmitButton.js";
import { scanCaptchaText } from "./inBrowser/scanCaptchaText.js";
import type { RunLogger } from "./runLogger.js";
import type { FormRoot } from "./greenhouse.js";

const SUBMIT_TEXT_PATTERNS = [
  "submit application",
  "send application",
  "apply now",
  "submit",
  "send",
  "apply",
  "continue",
  "finish",
];

const NEGATIVE_BUTTON = ["cancel", "search", "reset", "back", "delete", "remove"];

const SUCCESS_URL = [
  "thank-you",
  "thankyou",
  "success",
  "confirmation",
  "submitted",
  "application-complete",
  "complete",
];

const SUCCESS_TEXT = [
  "thank you",
  "application submitted",
  "successfully submitted",
  "your application has been received",
  "application received",
  "thanks for applying",
];

const FAILURE_TEXT = [
  "something went wrong",
  "error",
  "invalid",
  "required field",
  "please correct",
  "failed",
];

function playwrightPage(root: FormRoot): Page {
  const maybePage = root as Page;
  if (typeof maybePage.goto === "function") {
    return maybePage;
  }
  return (root as Frame).page();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function firstMatchingLocator(candidates: Locator[]): Promise<Locator | null> {
  for (const candidate of candidates) {
    const target = candidate.first();
    if ((await target.count().catch(() => 0)) > 0) {
      return target;
    }
  }
  return null;
}

async function resolveSubmitLocator(
  root: FormRoot,
  button: { selector: string; text: string }
): Promise<Locator> {
  const text = button.text.trim();
  const pattern = new RegExp(escapeRegExp(text), "i");
  const escapedValue = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const candidates: Locator[] = [];

  if (button.selector) {
    candidates.push(root.locator(button.selector).first());
  }

  candidates.push(
    root.getByRole("button", { name: pattern }).first(),
    root.getByRole("link", { name: pattern }).first(),
    root.locator('button, [role="button"]').filter({ hasText: pattern }).first(),
    root.locator('input[type="submit"]').filter({ hasText: pattern }).first(),
    root.locator(`input[type="submit"][value="${escapedValue}"]`).first(),
    root.locator('button, input[type="submit"], [role="button"], a').filter({ hasText: pattern }).last()
  );

  const found = await firstMatchingLocator(candidates);
  if (found) return found;

  throw new Error(`Could not resolve submit control for "${text}"`);
}

export async function findValidationErrors(root: FormRoot): Promise<string[]> {
  return root.evaluate(collectValidationErrors);
}

export async function findSubmitButton(root: FormRoot): Promise<{
  selector: string;
  text: string;
  score: number;
} | null> {
  return root.evaluate(findSubmitButtonInPage, {
    submitPatterns: SUBMIT_TEXT_PATTERNS,
    negative: NEGATIVE_BUTTON,
  });
}

async function waitForPostSubmitOutcome(
  page: Page,
  root: FormRoot,
  urlBefore: string,
  log: (msg: string) => void
): Promise<void> {
  const waitMs = getPostSubmitWaitMs();
  log(`Waiting up to ${waitMs}ms for post-submit response`);
  const started = Date.now();

  const successSnippet = () =>
    page
      .evaluate(() => (document.body?.innerText || "").toLowerCase())
      .then((t) =>
        ["thank you", "application submitted", "successfully submitted"].some((p) =>
          t.includes(p)
        )
      );

  while (Date.now() - started < waitMs) {
    const urlNow = page.url();
    if (urlNow !== urlBefore) {
      log("Post-submit: URL changed");
      break;
    }
    if (await successSnippet()) {
      log("Post-submit: success text detected");
      break;
    }
    const errors = await findValidationErrors(root);
    if (errors.length > 0) {
      log(`Post-submit: ${errors.length} validation message(s) visible`);
      break;
    }
    await page.waitForTimeout(750);
  }

  await page.waitForTimeout(800);
}

export async function verifySubmission(
  page: Page,
  root: FormRoot,
  urlBefore: string
): Promise<SubmissionResult> {
  const urlAfter = page.url();
  const bodyText = (
    await page.evaluate(() => (document.body?.innerText || "").toLowerCase())
  ).slice(0, 50000);

  const evidence: string[] = [];
  let confidence = 0.3;
  let submitted = false;

  for (const pat of SUCCESS_URL) {
    if (urlAfter.toLowerCase().includes(pat)) {
      evidence.push(`URL changed to path containing "${pat}"`);
      confidence += 0.35;
      submitted = true;
    }
  }

  if (urlAfter !== urlBefore) {
    evidence.push("URL changed after submit");
    confidence += 0.15;
  }

  for (const phrase of SUCCESS_TEXT) {
    if (bodyText.includes(phrase)) {
      evidence.push(`Found text: ${phrase}`);
      confidence += 0.25;
      submitted = true;
    }
  }

  for (const phrase of FAILURE_TEXT) {
    if (bodyText.includes(phrase)) {
      evidence.push(`Possible failure text: ${phrase}`);
      confidence -= 0.2;
      submitted = false;
    }
  }

  const validationAfter = await findValidationErrors(root);
  for (const err of validationAfter.slice(0, 8)) {
    evidence.push(`Validation: ${err}`);
  }

  if (!submitted) {
    const captchaHits = await root.evaluate(scanCaptchaText);
    for (const hit of captchaHits) {
      evidence.push(`Post-submit captcha signal: ${hit}`);
    }
  }

  confidence = Math.max(0, Math.min(1, confidence));

  if (!submitted && confidence >= 0.6) {
    submitted = true;
  }

  if (!submitted) {
    return {
      submitted: false,
      confidence,
      evidence,
      message: "Unable to confirm submission",
    };
  }

  return {
    submitted: true,
    confidence,
    evidence,
    message: "Submission likely successful",
  };
}

export async function submitForm(root: FormRoot, logger?: RunLogger): Promise<{
  submission: SubmissionResult;
  clicked: boolean;
  error?: string;
}> {
  const page = playwrightPage(root);
  const log = (msg: string) => (logger ? logger.info(msg) : console.log(`[Agent] ${msg}`));
  log("Looking for submit button");
  const validationErrors = await findValidationErrors(root);
  if (validationErrors.length > 0) {
    log(`Validation hints on page: ${validationErrors.slice(0, 3).join("; ")}`);
  }

  const button = await findSubmitButton(root);
  if (!button) {
    return {
      submission: {
        submitted: false,
        confidence: 0,
        evidence: validationErrors.map((e) => `Validation: ${e}`),
        message: "Could not identify a safe submit button",
      },
      clicked: false,
      error: "Could not find submit button",
    };
  }

  log(`Submit button found: "${button.text}"`);
  log("Clicking submit");

  const urlBefore = page.url();
  const locator = await resolveSubmitLocator(root, button);

  try {
    await Promise.race([
      (async () => {
        await locator.scrollIntoViewIfNeeded({ timeout: 10000 });
        await locator.click({ timeout: 20000 });
        try {
          await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
        } catch {
          /* optional */
        }
        await waitForPostSubmitOutcome(page, root, urlBefore, log);
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Submission timeout")), getSubmissionTimeout())
      ),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Submit click failed";
    log(`Submit error: ${msg}`);
    const submission = await verifySubmission(page, root, urlBefore);
    return {
      submission: {
        ...submission,
        submitted: false,
        message: msg,
        submitButtonText: button.text,
      },
      clicked: true,
      error: msg,
    };
  }

  log("Verifying result");
  const submission = await verifySubmission(page, root, urlBefore);
  submission.submitButtonText = button.text;

  if (submission.submitted) {
    log("Submission confirmed");
  } else {
    log("Unable to confirm submission");
  }

  return { submission, clicked: true };
}
