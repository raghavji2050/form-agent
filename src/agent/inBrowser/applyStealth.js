/** Patches common automation signals before page scripts run. */
export function applyStealth() {
  try {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
      configurable: true,
    });
  } catch {
    /* ignore */
  }

  if (!window.chrome) {
    window.chrome = {
      runtime: {},
      loadTimes: function loadTimes() {},
      csi: function csi() {},
    };
  }

  try {
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
      configurable: true,
    });
  } catch {
    /* ignore */
  }

  try {
    const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : originalQuery(parameters);
  } catch {
    /* ignore */
  }
}
