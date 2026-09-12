export function setReactInputValue({ selector, value }) {
  const el = document.querySelector(selector);
  if (!el) {
    return { ok: false, reason: "element not found" };
  }

  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea") {
    return { ok: false, reason: "not an input or textarea" };
  }

  const proto =
    tag === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = descriptor?.set;

  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  const current = el.value;
  return { ok: current === value || current.includes(value), current };
}
