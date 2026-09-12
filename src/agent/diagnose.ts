import type { RunDiagnosis, RunResult, FailurePhase, AutoSubmitFeasibility } from "../types.js";

export interface DiagnoseInput {
  result: RunResult;
  guardReasonDetail?: string;
  submitClicked?: boolean;
}

function isGreenhouseUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.includes("greenhouse.io");
  } catch {
    return false;
  }
}

function evidenceMentionsCaptcha(evidence: string[] | undefined): boolean {
  if (!evidence?.length) return false;
  const hay = evidence.join(" ").toLowerCase();
  return (
    hay.includes("captcha") ||
    hay.includes("recaptcha") ||
    hay.includes("verify you are human")
  );
}

export function buildDiagnosis(input: DiagnoseInput): RunDiagnosis {
  const { result, guardReasonDetail, submitClicked } = input;
  const hints: string[] = [];
  let failurePhase: FailurePhase | undefined;
  let autoSubmitFeasibility: AutoSubmitFeasibility = "partial";
  let summary: string;

  if (result.error?.includes("timed out")) {
    failurePhase = "timeout";
    autoSubmitFeasibility = "unlikely";
    summary = "Agent timed out before finishing";
    hints.push(result.error);
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  if (result.status === "blocked") {
    failurePhase = "guard";
    autoSubmitFeasibility = "unlikely";
    summary = "Bot protection visible; did not submit";
    hints.push(result.message || result.error || "Blocked by guard");
    if (guardReasonDetail) hints.push(`Detail: ${guardReasonDetail}`);
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  if (result.status === "requires_login") {
    failurePhase = "guard";
    autoSubmitFeasibility = "unlikely";
    summary = "Login required; cannot auto-apply";
    hints.push(result.message || "Login page detected");
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  if (result.botWarning) {
    hints.push(`Bot signal: ${result.botWarning.reasonDetail ?? result.botWarning.message}`);
    hints.push("Continued to fill because application form was visible");
  }

  if (result.success) {
    autoSubmitFeasibility = result.botWarning ? "partial" : "likely";
    summary = result.botWarning
      ? "Submitted despite bot signals on page (verify manually)"
      : "Application likely submitted successfully";
    if (result.botWarning) {
      hints.push("reCAPTCHA or bot scripts were present; confirm submission in email or portal");
    } else {
      hints.push("Submission verification passed with sufficient confidence");
    }
    if (result.submission?.evidence?.length) {
      hints.push(...result.submission.evidence.slice(0, 5));
    }
    return { summary, autoSubmitFeasibility, hints };
  }

  if (result.botWarning && (result.fieldsFilled ?? 0) > 0) {
    autoSubmitFeasibility = "partial";
  }

  const detected = result.fieldsDetected ?? 0;
  const filled = result.fieldsFilled ?? 0;

  if (detected === 0) {
    failurePhase = "inspect";
    autoSubmitFeasibility = "unlikely";
    summary = "Application form not found on page";
    hints.push("No input fields detected after navigation (and prep if Greenhouse)");
    if (isGreenhouseUrl(result.url)) {
      hints.push("Greenhouse: ensure Apply was clicked and form finished loading");
    }
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  if (filled === 0) {
    failurePhase = "fill";
    autoSubmitFeasibility = "unlikely";
    summary = "Form found but no fields could be filled";
    hints.push(`${detected} field(s) detected; none matched the test profile`);
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  if (result.error?.includes("Could not find submit button") || submitClicked === false) {
    failurePhase = "submit";
    autoSubmitFeasibility = "partial";
    summary = "Filled some fields but no safe submit button found";
    hints.push(`Filled ${filled} of ${detected} detected fields`);
    hints.push(result.error || "Submit button not identified");
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  if (evidenceMentionsCaptcha(result.submission?.evidence)) {
    failurePhase = "verify";
    autoSubmitFeasibility = "unlikely";
    summary = "Submit may be blocked by reCAPTCHA or bot scoring";
    hints.push("Post-submit page suggests CAPTCHA or bot protection");
    hints.push(...(result.submission?.evidence || []).filter((e) => /captcha|recaptcha|human/i.test(e)));
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  const validationHints = result.submission?.evidence?.filter((e) =>
    e.startsWith("Validation:")
  );
  if (validationHints?.length) {
    failurePhase = "verify";
    autoSubmitFeasibility = "partial";
    summary = "Submit attempted but required or custom fields may be missing";
    hints.push(`Filled ${filled} field(s); validation issues remain`);
    hints.push(...validationHints.slice(0, 5));
    return { summary, failurePhase, autoSubmitFeasibility, hints };
  }

  failurePhase = "verify";
  autoSubmitFeasibility =
    result.botWarning || isGreenhouseUrl(result.url) ? "partial" : "unlikely";
  summary = result.botWarning
    ? "Bot signals detected; continued to fill but could not confirm submission"
    : "Could not confirm submission";
  hints.push(`Filled ${filled} of ${detected} field(s)`);
  if (result.submission?.message) hints.push(result.submission.message);
  if (result.error) hints.push(result.error);
  if (isGreenhouseUrl(result.url)) {
    hints.push("Greenhouse often uses custom questions and reCAPTCHA Enterprise on submit");
  }
  return { summary, failurePhase, autoSubmitFeasibility, hints };
}

export function withDiagnosis(
  result: RunResult,
  extra?: Omit<DiagnoseInput, "result">
): RunResult {
  const diagnosis = buildDiagnosis({ result, ...extra });
  return { ...result, diagnosis };
}
