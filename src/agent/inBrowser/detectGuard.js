export function detectGuard() {
  const isVisible = (el, minSize = 0) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= minSize || rect.height <= minSize) return false;
    return true;
  };

  const visibleCaptchaIframe = (minSize) => {
    const selectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[title*="reCAPTCHA"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (isVisible(el, minSize)) return sel;
    }
    return null;
  };

  const bodyText = (document.body?.innerText || "").toLowerCase();

  if (bodyText.includes("cloudflare") && bodyText.includes("ray id")) {
    return {
      severity: "hard",
      status: "blocked",
      message: "CAPTCHA or bot protection detected",
      reasonDetail: "cloudflare_interstitial",
    };
  }

  const hasPassword = !!document.querySelector('input[type="password"]');
  const loginSignals = ["sign in", "log in", "login", "sign up to continue"];
  if (hasPassword && loginSignals.some((s) => bodyText.includes(s))) {
    return {
      severity: "hard",
      status: "requires_login",
      message: "Login page detected",
      reasonDetail: "password_and_login_copy",
    };
  }

  const softChallengePhrases = [
    "verify you are human",
    "checking your browser before accessing",
    "attention required",
    "bot protection",
  ];
  for (const phrase of softChallengePhrases) {
    if (bodyText.includes(phrase)) {
      return {
        severity: "soft",
        status: "blocked",
        message: "CAPTCHA or bot protection detected",
        reasonDetail: `visible_text:${phrase}`,
      };
    }
  }

  const captchaIframe = visibleCaptchaIframe(0);
  if (captchaIframe) {
    return {
      severity: "soft",
      status: "blocked",
      message: "CAPTCHA or bot protection detected",
      reasonDetail: `visible_recaptcha_iframe:${captchaIframe}`,
    };
  }

  if (isVisible(document.querySelector(".g-recaptcha"), 0)) {
    return {
      severity: "soft",
      status: "blocked",
      message: "CAPTCHA or bot protection detected",
      reasonDetail: "visible_g_recaptcha_widget",
    };
  }

  if (isVisible(document.querySelector("#cf-turnstile"), 0)) {
    return {
      severity: "soft",
      status: "blocked",
      message: "CAPTCHA or bot protection detected",
      reasonDetail: "visible_turnstile",
    };
  }

  return null;
}
