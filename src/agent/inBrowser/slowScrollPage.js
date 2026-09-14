export function slowScrollPage({ ms }) {
  const maxScroll =
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
    window.innerHeight;
  if (maxScroll <= 0) return;

  const start = window.scrollY;
  const started = performance.now();

  return new Promise((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - started;
      const t = Math.min(1, elapsed / ms);
      window.scrollTo({ top: start + maxScroll * t, behavior: "auto" });
      if (t >= 1) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
