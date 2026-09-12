import type { Frame, Page } from "playwright";
import type { RunLogger } from "./runLogger.js";

export function isGreenhouseUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("greenhouse.io");
  } catch {
    return false;
  }
}

export type FormRoot = Page | Frame;

async function scrollToApplication(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const targets = ["#app", "#application", "[id*='application']", "form"];
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ block: "center" });
        return;
      }
    }
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = Math.max(window.innerHeight, 400);
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  });
  await page.waitForTimeout(800);
}

async function clickApplyIfPresent(page: Page, log: (msg: string) => void): Promise<boolean> {
  const roleApply = page.getByRole("link", { name: /apply/i }).first();
  if (await roleApply.isVisible().catch(() => false)) {
    log("Greenhouse: clicking Apply link (role)");
    await roleApply.click();
    return true;
  }

  const roleBtn = page.getByRole("button", { name: /apply/i }).first();
  if (await roleBtn.isVisible().catch(() => false)) {
    log("Greenhouse: clicking Apply button (role)");
    await roleBtn.click();
    return true;
  }

  const applyLink = page.locator('a[href*="#app"]').first();
  if (await applyLink.isVisible().catch(() => false)) {
    log("Greenhouse: clicking Apply link (#app)");
    await applyLink.click();
    return true;
  }

  const patterns = [/apply for this job/i, /apply now/i, /^apply$/i];
  const candidates = page.locator("a, button");
  const count = await candidates.count();
  for (let i = 0; i < Math.min(count, 40); i++) {
    const el = candidates.nth(i);
    const text = ((await el.innerText().catch(() => "")) || "").trim();
    if (!text) continue;
    if (!patterns.some((p) => p.test(text))) continue;
    if (!(await el.isVisible().catch(() => false))) continue;
    log(`Greenhouse: clicking "${text}"`);
    await el.click();
    return true;
  }
  log("Greenhouse: no Apply control found (form may already be visible)");
  return false;
}

async function findFormFrame(page: Page): Promise<Frame | null> {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const count = await frame.locator("input, textarea, select").count();
      if (count >= 2) return frame;
    } catch {
      /* try next frame */
    }
  }
  return null;
}

export async function prepareGreenhouseApplication(
  page: Page,
  url: string,
  logger?: RunLogger
): Promise<FormRoot> {
  const log = (msg: string) => (logger ? logger.info(msg) : console.log(`[Agent] ${msg}`));

  if (!isGreenhouseUrl(url)) {
    return page;
  }

  log("Greenhouse: preparing application form");
  await scrollToApplication(page);
  await clickApplyIfPresent(page, log);
  await scrollToApplication(page);

  try {
    await page.waitForSelector("input, textarea, select", { timeout: 20000 });
    log("Greenhouse: form inputs visible on main page");
  } catch {
    log("Greenhouse: waiting for form on main page timed out, checking iframes");
  }

  await page.waitForTimeout(2000);

  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    /* optional */
  }

  const frame = await findFormFrame(page);
  if (frame) {
    log("Greenhouse: using application iframe");
    return frame;
  }

  log("Greenhouse: using main page as form root");
  return page;
}
