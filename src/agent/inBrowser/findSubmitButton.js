export function findSubmitButton({ submitPatterns, negative }) {
  const scoreText = (text) => {
    const lower = text.toLowerCase().trim();
    if (!lower) return 0;
    if (negative.some((n) => lower.includes(n))) return -10;
    for (let i = 0; i < submitPatterns.length; i++) {
      if (lower.includes(submitPatterns[i])) {
        return 100 - i;
      }
    }
    return 0;
  };

  const candidates = [];
  const nodes = document.querySelectorAll(
    'button, input[type="submit"], [role="button"]'
  );

  nodes.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const inputVal = tag === "input" ? el.value : "";
    const text = (el.textContent || inputVal || "").trim();
    const score = scoreText(text);
    if (score <= 0) return;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const visible =
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      parseFloat(style.opacity || "1") > 0 &&
      rect.width > 0 &&
      rect.height > 0;
    if (!visible) return;

    const form = el.closest("form");
    let bonus = 0;
    if (form && form.querySelector("input, textarea, select")) bonus += 5;
    if (form) bonus += 3;

    const id = el.id;
    const name = el.getAttribute("name");
    let selector = null;
    if (id) selector = `#${CSS.escape(id)}`;
    else if (name) selector = `${tag}[name="${name.replace(/"/g, '\\"')}"]`;

    candidates.push({
      selector: selector || "",
      text,
      score: score + bonus,
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}
