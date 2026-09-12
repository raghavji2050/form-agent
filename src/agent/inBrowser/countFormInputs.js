export function countFormInputs() {
  let count = 0;
  const elements = document.querySelectorAll("input, textarea, select");
  elements.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const type =
      tag === "input" ? el.type || "text" : tag === "select" ? "select" : "textarea";
    if (type === "hidden" || type === "submit" || type === "button" || type === "file") {
      return;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    count++;
  });
  return count;
}
