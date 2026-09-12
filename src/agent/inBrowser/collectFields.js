export function collectFields() {
  const labelFor = (el) => {
    const id = el.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel?.textContent) {
      return parentLabel.textContent.trim().slice(0, 200);
    }
    return "";
  };

  const buildSelector = (tag, type, name, id) => {
    if (id) return `#${CSS.escape(id)}`;
    if (name) return `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
    if (type) return `${tag}[type="${type}"]`;
    return tag;
  };

  const results = [];
  const elements = document.querySelectorAll("input, textarea, select");

  elements.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const input = el;
    const type =
      tag === "input"
        ? input.type || "text"
        : tag === "select"
          ? "select"
          : "textarea";
    const name = input.getAttribute("name") || "";
    const id = input.getAttribute("id") || "";
    const placeholder = input.getAttribute("placeholder") || "";
    const ariaLabel = input.getAttribute("aria-label") || "";
    const required = input.hasAttribute("required");

    let options;
    if (tag === "select") {
      options = Array.from(input.options).map((o) => ({
        value: o.value,
        text: (o.textContent || "").trim(),
      }));
    }

    const selector = buildSelector(tag, type, name, id);

    results.push({
      tag,
      type,
      name,
      id,
      placeholder,
      label: labelFor(el),
      ariaLabel,
      required,
      selector,
      options,
    });
  });

  const buttons = document.querySelectorAll("button, input[type=submit]");
  buttons.forEach((el, idx) => {
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") || (tag === "button" ? "button" : "submit");
    const name = el.getAttribute("name") || "";
    const id = el.getAttribute("id") || "";
    const text = (el.textContent || el.value || "").trim();
    let selector;
    if (id) selector = `#${CSS.escape(id)}`;
    else if (name) selector = `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
    else selector = `button:nth-of-type(${idx + 1})`;

    results.push({
      tag,
      type,
      name,
      id,
      placeholder: "",
      label: text,
      ariaLabel: el.getAttribute("aria-label") || "",
      required: false,
      selector,
    });
  });

  return results;
}
