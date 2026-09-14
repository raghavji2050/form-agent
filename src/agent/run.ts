import "dotenv/config";
import type { Browser, BrowserContext, Page } from "playwright";
import type { FieldMapper, RunResult } from "../types.js";
import { CANDIDATE } from "../types.js";
import { DeterministicFieldMapper } from "./mapper.js";
import {
  closeBrowser,
  createBrowserSession,
  getAgentTimeout,
  getRecordAfterSubmitMs,
  gotoPage,
  launchBrowser,
  saveScreenshot,
} from "./browser.js";
import {
  finalizeRunRecording,
  getLogUrl,
  writeRunJson,
  type RunJsonPayload,
} from "./artifacts.js";
import { createRunId, RunLogger } from "./runLogger.js";
import { inspectPage } from "./inspector.js";
import { fillForm } from "./filler.js";
import { findValidationErrors, submitForm } from "./submitter.js";
import { prepareGreenhouseApplication } from "./greenhouse.js";
import { withDiagnosis } from "./diagnose.js";
import { playRecordingFocusTour } from "./recordingFocus.js";
import { getBrowserChannel, isStealthEnabled } from "./stealth.js";

export interface RunAgentOptions {
  runId?: string;
  logger?: RunLogger;
  mapper?: FieldMapper;
  timedOutRef?: { timedOut: boolean };
}

function attachRunMeta(result: RunResult, runId: string): RunResult {
  return {
    ...result,
    runId,
    logUrl: getLogUrl(runId),
  };
}

function isSubmissionSuccess(
  submission: { submitted: boolean; confidence: number } | undefined
): boolean {
  return Boolean(submission?.submitted && submission.confidence >= 0.5);
}

function finalize(
  result: RunResult,
  extra: { guardReasonDetail?: string; submitClicked?: boolean }
): RunResult {
  const withMeta = result.diagnosis
    ? result
    : withDiagnosis(
        { ...result, guardReasonDetail: extra.guardReasonDetail ?? result.guardReasonDetail },
        extra
      );
  if (withMeta.diagnosis) {
    return withMeta;
  }
  return withDiagnosis(withMeta, extra);
}

export async function runAgent(
  url: string,
  options: RunAgentOptions = {}
): Promise<RunResult> {
  const runId = options.runId ?? createRunId();
  const logger = options.logger ?? new RunLogger();
  const mapper = options.mapper ?? new DeterministicFieldMapper();

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const screenshots: NonNullable<RunResult["screenshots"]> = {};
  let result: RunResult = {
    success: false,
    submitted: false,
  };
  let guardReasonDetail: string | undefined;
  let submitClicked: boolean | undefined;

  logger.info("Starting");
  if (isStealthEnabled()) {
    const channel = getBrowserChannel();
    logger.info(
      `Stealth mode on${channel ? ` (browser channel: ${channel})` : ""}; set HEADLESS=false to reduce bot challenges`
    );
  }
  logger.info(`Opening URL: ${url}`);

  try {
    browser = await launchBrowser();
    ({ page, context } = await createBrowserSession(browser, runId));

    await gotoPage(page, url);
    logger.info("Page loaded");

    screenshots.before = await saveScreenshot(page, runId, "before");

    const formRoot = await prepareGreenhouseApplication(page, url, logger);
    const inspection = await inspectPage(page, logger, formRoot);

    if (inspection.guard) {
      guardReasonDetail = inspection.guard.reasonDetail;
      screenshots.afterFail = await saveScreenshot(page, runId, "after-fail");
      result = finalize(
        attachRunMeta(
          {
            success: false,
            url,
            title: inspection.title,
            submitted: false,
            status: inspection.guard.status,
            error: inspection.guard.message,
            message: inspection.guard.message,
            guardReasonDetail,
            screenshot: screenshots.afterFail,
            screenshots,
          },
          runId
        ),
        { guardReasonDetail, submitClicked }
      );
      return result;
    }

    if (inspection.botWarning) {
      logger.warn(
        `Bot warning: ${inspection.botWarning.reasonDetail ?? inspection.botWarning.message}`
      );
    }

    const fields = inspection.fields.filter(
      (f) => f.tag !== "button" || f.type === "submit"
    );
    const inputFields = fields.filter(
      (f) => f.tag === "input" || f.tag === "textarea" || f.tag === "select"
    );

    const mappings = await mapper.mapFields(inputFields);
    const fillOutcome = await fillForm(formRoot, fields, mappings, CANDIDATE, logger);

    screenshots.afterFill = await saveScreenshot(page, runId, "after-fill");

    const invalidAfterFill = await findValidationErrors(formRoot);
    if (invalidAfterFill.length > 0) {
      logger.warn(
        `After fill: ${invalidAfterFill.length} validation issue(s): ${invalidAfterFill.slice(0, 4).join("; ")}`
      );
    }

    const recaptchaWaitMs = Number(process.env.WAIT_FOR_RECAPTCHA_MS || 0);
    if (recaptchaWaitMs > 0 && inspection.botWarning) {
      logger.info(
        `Waiting ${recaptchaWaitMs}ms for manual reCAPTCHA (set HEADLESS=false to see the browser)`
      );
      await page.waitForTimeout(recaptchaWaitMs);
    }

    const { submission, clicked, error: submitError } = await submitForm(formRoot, logger);
    submitClicked = clicked;

    const recordTailMs = getRecordAfterSubmitMs();
    if (recordTailMs > 0 && page) {
      logger.info(
        `Continuing screen recording for ${recordTailMs}ms after submit (errors, captcha, or thank-you page)`
      );
      try {
        await playRecordingFocusTour(
          page,
          formRoot,
          recordTailMs,
          { submitButtonText: submission.submitButtonText },
          (msg) => logger.info(msg)
        );
      } catch (recFocusErr) {
        const msg =
          recFocusErr instanceof Error ? recFocusErr.message : "Recording focus tour failed";
        logger.warn(msg);
        await page.waitForTimeout(recordTailMs).catch(() => {});
      }
    }

    const success = isSubmissionSuccess(submission);

    if (success) {
      screenshots.afterSuccess = await saveScreenshot(page, runId, "after-success");
    } else {
      screenshots.afterFail = await saveScreenshot(page, runId, "after-fail");
    }

    const finalScreenshot = success ? screenshots.afterSuccess : screenshots.afterFail;

    result = finalize(
      attachRunMeta(
        {
          success,
          url,
          title: inspection.title,
          fieldsDetected: inputFields.length,
          fieldsFilled: fillOutcome.fieldsFilled,
          fieldsSkipped: fillOutcome.fieldsSkipped,
          fillDetails: fillOutcome.records,
          submitted: submission.submitted,
          submission,
          botWarning: inspection.botWarning,
          message:
            submission.message ||
            (success ? "Application submitted successfully" : undefined),
          error:
            submitError ||
            (!submission.submitted ? submission.message : undefined) ||
            (!clicked ? "Could not find submit button" : undefined),
          screenshot: finalScreenshot,
          screenshots,
        },
        runId
      ),
      { guardReasonDetail, submitClicked }
    );

    if (result.diagnosis) {
      logger.info(`Diagnosis: ${result.diagnosis.summary}`);
      for (const hint of result.diagnosis.hints.slice(0, 5)) {
        logger.info(`  - ${hint}`);
      }
    }

    if (!clicked) {
      logger.warn("Could not identify a safe submit button");
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    logger.error(message);
    let screenshot: string | undefined;
    try {
      if (browser) {
        const pages = browser.contexts().flatMap((c) => c.pages());
        if (pages[0]) {
          screenshot = await saveScreenshot(pages[0], runId, "after-fail");
          screenshots.afterFail = screenshot;
        }
      }
    } catch {
      /* ignore */
    }
    result = finalize(
      attachRunMeta(
        {
          success: false,
          url,
          submitted: false,
          error: message,
          screenshot,
          screenshots: Object.keys(screenshots).length ? screenshots : undefined,
        },
        runId
      ),
      { guardReasonDetail, submitClicked }
    );
    return result;
  } finally {
    if (page && context) {
      try {
        const recordingUrl = await finalizeRunRecording(page, context, runId);
        context = null;
        if (recordingUrl) {
          result.recordingUrl = recordingUrl;
          logger.info(`Recording saved: ${recordingUrl}`);
        }
      } catch (recErr) {
        const msg =
          recErr instanceof Error ? recErr.message : "Failed to save run recording";
        logger.error(msg);
      }
    } else if (context) {
      await context.close().catch(() => {});
      context = null;
    }

    if (browser) {
      await closeBrowser(browser);
    }

    if (!result.diagnosis) {
      result = finalize(result, { guardReasonDetail, submitClicked });
    }

    const finishedAt = new Date().toISOString();
    const payload: RunJsonPayload = {
      ...result,
      runId,
      logUrl: getLogUrl(runId),
      startedAt,
      finishedAt,
      durationMs: Date.now() - startMs,
      logs: logger.getLogs(),
    };
    if (!options.timedOutRef?.timedOut) {
      try {
        writeRunJson(runId, payload);
      } catch (writeErr) {
        const msg = writeErr instanceof Error ? writeErr.message : "Failed to write run.json";
        logger.error(msg);
      }
    }
  }
}

export function runAgentWithTimeout(
  url: string,
  options: RunAgentOptions = {}
): Promise<RunResult> {
  const runId = options.runId ?? createRunId();
  const logger = options.logger ?? new RunLogger();
  const timeout = getAgentTimeout();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  let agentFinished = false;
  const timedOutRef = { timedOut: false };

  const agentPromise = runAgent(url, {
    ...options,
    runId,
    logger,
    timedOutRef,
  }).then((result) => {
    agentFinished = true;
    return result;
  });

  return Promise.race([
    agentPromise,
    new Promise<RunResult>((resolve) =>
      setTimeout(() => {
        if (agentFinished) return;
        timedOutRef.timedOut = true;
        const error = `Agent timed out after ${timeout}ms`;
        logger.error(error);
        const finishedAt = new Date().toISOString();
        const base: RunResult = {
          success: false,
          submitted: false,
          error,
          url,
          runId,
          logUrl: getLogUrl(runId),
        };
        const result = withDiagnosis(base, { submitClicked: false });
        logger.info(`Diagnosis: ${result.diagnosis?.summary}`);
        try {
          writeRunJson(runId, {
            ...result,
            runId,
            logUrl: getLogUrl(runId),
            startedAt,
            finishedAt,
            durationMs: Date.now() - startMs,
            logs: logger.getLogs(),
          });
        } catch {
          /* ignore */
        }
        resolve(result);
      }, timeout)
    ),
  ]);
}
