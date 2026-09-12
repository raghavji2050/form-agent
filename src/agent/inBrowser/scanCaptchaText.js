export function scanCaptchaText() {
  const text = (document.body?.innerText || "").toLowerCase();
  const found = [];
  const patterns = ["captcha", "recaptcha", "verify you are human", "robot"];
  for (const p of patterns) {
    if (text.includes(p)) found.push(p);
  }
  return found;
}
