import type { Page, Locator } from "playwright";
import type { FormRoot } from "./greenhouse.js";
import { slowScrollPage } from "./inBrowser/slowScrollPage.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function scrollLocatorIntoCenter(locator: Locator): Promise<boolean> {
  try {
    const target = locator.first();
    if ((await target.count()) === 0) return false;
    await target.scrollIntoViewIfNeeded({ timeout: 3000 });
    await target.evaluate((el) => {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return true;
  } catch {
    return false;
  }
}

async function scrollToValidationIssues(root: FormRoot): Promise<boolean> {
  const invalid = root.locator(
    '[aria-invalid="true"], :invalid, [role="alert"], .error, .field-error, [class*="error-message"]'
  );
  if ((await invalid.count()) === 0) return false;
  return scrollLocatorIntoCenter(invalid.first());
}

async function scrollToSubmitButton(root: FormRoot, text: string): Promise<boolean> {
  const pattern = new RegExp(escapeRegExp(text.trim()), "i");
  const locator = root
    .locator('button, input[type="submit"], [role="button"], a')
    .filter({ hasText: pattern });
  if ((await locator.count()) === 0) return false;
  return scrollLocatorIntoCenter(locator.last());
}

/** Pan the viewport during the post-submit tail so video captures errors and submit controls. */
export async function playRecordingFocusTour(
  page: Page,
  root: FormRoot,
  totalMs: number,
  options: { submitButtonText?: string },
  log?: (msg: string) => void
): Promise<void> {
  const logMsg = log ?? (() => {});
  if (totalMs <= 0) return;

  const pauseMs = Math.max(1200, Math.min(4000, Math.floor(totalMs / 4)));
  const scrollMs = Math.max(500, totalMs - pauseMs * 3);

  logMsg("Recording: panning viewport to show failure areas");

  if (await scrollToValidationIssues(root)) {
    logMsg("Recording: focused on validation / error messages");
    await page.waitForTimeout(pauseMs);
  }

  if (options.submitButtonText && (await scrollToSubmitButton(root, options.submitButtonText))) {
    logMsg(`Recording: focused on submit control "${options.submitButtonText}"`);
    await page.waitForTimeout(pauseMs);
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(Math.floor(pauseMs / 2));
  logMsg("Recording: scrolling full page for context");
  await page.evaluate(slowScrollPage, { ms: Math.max(500, scrollMs) });
}
