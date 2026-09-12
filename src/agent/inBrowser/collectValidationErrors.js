export function collectValidationErrors() {
  const errors = [];
  const seen = new Set();

  const push = (text) => {
    const t = (text || "").replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 300) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    errors.push(t);
  };

  document.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
    const errId =
      el.getAttribute("aria-errormessage") ||
      (el.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .find((id) => id.includes("error"));
    if (errId) {
      const node = document.getElementById(errId);
      if (node?.textContent) push(node.textContent);
    }
    const field = el.closest(".field, .form-group, [class*='field']");
    if (field) {
      field.querySelectorAll('[class*="error"], [role="alert"]').forEach((n) => {
        push(n.textContent);
      });
    }
  });

  document
    .querySelectorAll(
      '[role="alert"], .error:not(input):not(select), .field-error, [class*="error-message"], [id$="-error"]'
    )
    .forEach((el) => {
      if (el.offsetParent === null && el.getClientRects().length === 0) return;
      push(el.textContent);
    });

  return errors;
}
