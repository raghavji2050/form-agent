export function collectValidationErrors() {
  const errors = [];
  document
    .querySelectorAll("[aria-invalid=true], .error, .invalid, .field-error")
    .forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t) errors.push(t.slice(0, 200));
    });
  return errors;
}
