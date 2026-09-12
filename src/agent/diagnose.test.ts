import { describe, it, expect } from "vitest";
import { buildDiagnosis } from "./diagnose.js";

describe("buildDiagnosis", () => {
  it("marks success as likely", () => {
    const d = buildDiagnosis({
      result: {
        success: true,
        url: "http://localhost/test-form.html",
        fieldsDetected: 8,
        fieldsFilled: 6,
        submission: { submitted: true, confidence: 0.9, evidence: ["Found text: thank you"] },
      },
    });
    expect(d.autoSubmitFeasibility).toBe("likely");
    expect(d.summary).toContain("submitted");
  });

  it("detects guard blocked", () => {
    const d = buildDiagnosis({
      result: {
        success: false,
        status: "blocked",
        message: "CAPTCHA or bot protection detected",
      },
      guardReasonDetail: "visible_recaptcha_iframe",
    });
    expect(d.failurePhase).toBe("guard");
    expect(d.autoSubmitFeasibility).toBe("unlikely");
  });

  it("detects no fields", () => {
    const d = buildDiagnosis({
      result: {
        success: false,
        url: "https://job-boards.greenhouse.io/reddit/jobs/1",
        fieldsDetected: 0,
      },
    });
    expect(d.failurePhase).toBe("inspect");
    expect(d.hints.some((h) => h.includes("Greenhouse"))).toBe(true);
  });

  it("handles botWarning with partial feasibility", () => {
    const d = buildDiagnosis({
      result: {
        success: false,
        botWarning: { message: "CAPTCHA detected", reasonDetail: "visible_recaptcha_iframe" },
        fieldsDetected: 10,
        fieldsFilled: 4,
        submitted: false,
      },
      submitClicked: true,
    });
    expect(d.autoSubmitFeasibility).toBe("partial");
    expect(d.hints.some((h) => h.includes("Continued to fill"))).toBe(true);
    expect(d.failurePhase).not.toBe("guard");
  });

  it("detects missing submit button", () => {
    const d = buildDiagnosis({
      result: {
        success: false,
        fieldsDetected: 5,
        fieldsFilled: 3,
        error: "Could not find submit button",
      },
      submitClicked: false,
    });
    expect(d.failurePhase).toBe("submit");
    expect(d.autoSubmitFeasibility).toBe("partial");
  });
});
