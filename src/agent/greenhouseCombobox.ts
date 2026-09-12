import type { Frame, Locator, Page } from "playwright";
import type { CandidateKey } from "../types.js";
import type { FormRoot } from "./greenhouse.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function playwrightPage(root: FormRoot): Page {
  const maybe = root as Page;
  if (typeof maybe.goto === "function") return maybe;
  return (root as Frame).page();
}

const VALUE_FALLBACKS: Record<string, string[]> = {
  "i don't wish to answer": ["prefer not to answer", "prefer not to say", "decline to self-identify"],
  "prefer not to say": ["prefer not to answer", "decline to self-identify", "i don't wish to answer"],
  "prefer not to answer": ["prefer not to say", "decline to answer", "i don't wish to answer"],
  "i agree": ["agree", "i agree"],
  yes: ["yes"],
  no: ["no", "no military service", "i am not"],
};

export function comboboxSearchTerms(value: string, candidateKey?: CandidateKey): string[] {
  const terms = [value];
  const lower = value.toLowerCase();
  const fb = VALUE_FALLBACKS[lower];
  if (fb) terms.push(...fb);

  if (candidateKey === "veteranStatus") {
    terms.push("No", "I am not a protected veteran", "Non-veteran");
  }
  if (candidateKey === "ethnicity") {
    terms.push("Prefer not to say", "Two or More Races", "Asian");
  }
  if (candidateKey === "privacyAgreement") {
    terms.push("I agree", "Agree");
  }

  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

export function locationSearchTerms(city: string, state: string, country: string): string[] {
  return [
    `${city}, ${state}, ${country}`,
    `${city}, ${country}`,
    city,
    `${city}, ${state}`,
  ].filter(Boolean);
}

async function isLocatorValid(locator: Locator): Promise<boolean> {
  const invalid = await locator.getAttribute("aria-invalid");
  if (invalid === "true") return false;

  const describedBy = await locator.getAttribute("aria-describedby");
  if (describedBy) {
    const errId = describedBy.split(/\s+/).find((id) => id.includes("error"));
    if (errId) {
      const page = locator.page();
      const errLoc = page.locator(`[id="${errId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
      const errVisible = await errLoc.isVisible().catch(() => false);
      if (errVisible) {
        const text = await errLoc.innerText().catch(() => "");
        if (text.toLowerCase().includes("required") || text.toLowerCase().includes("enter")) {
          return false;
        }
      }
    }
  }
  return true;
}

async function clickMatchingOption(page: Page, pattern: RegExp): Promise<boolean> {
  const scopes = [
    page.locator('[role="listbox"] [role="option"]'),
    page.locator('[role="option"]'),
    page.locator(".select__menu [role=\"option\"]"),
    page.locator(".select-menu [role=\"option\"]"),
  ];

  for (const options of scopes) {
    const match = options.filter({ hasText: pattern }).first();
    if (await match.isVisible().catch(() => false)) {
      await match.click();
      return true;
    }
  }
  return false;
}

async function openCombobox(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 8000 });
  await locator.focus().catch(() => {});
}

async function clearMultiSelectValues(locator: Locator): Promise<void> {
  const page = locator.page();
  const container = locator.locator("xpath=ancestor::div[contains(@class,'select')]").first();
  const removeButtons = container.locator(
    ".select__multi-value__remove, [aria-label='Remove'], button[title='Remove']"
  );
  for (let i = 0; i < 8; i++) {
    const btn = removeButtons.first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await locator.fill("").catch(() => {});
}

/**
 * Greenhouse React-Select style combobox: must pick a list option, not only type + Enter.
 */
export async function fillGreenhouseCombobox(
  root: FormRoot,
  locator: Locator,
  value: string,
  candidateKey?: CandidateKey
): Promise<boolean> {
  const page = playwrightPage(root);
  const terms = comboboxSearchTerms(value, candidateKey);

  await clearMultiSelectValues(locator);

  for (let attempt = 0; attempt < 2; attempt++) {
    await clearMultiSelectValues(locator);
    await openCombobox(locator);

    for (const term of terms) {
      await locator.fill("");
      await locator.fill(term.slice(0, 80));
      await page.waitForTimeout(550);

      const exact = new RegExp(`^\\s*${escapeRegExp(term)}\\s*$`, "i");
      if (await clickMatchingOption(page, exact)) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(400);
        if (await isLocatorValid(locator)) return true;
      }

      const partial = new RegExp(escapeRegExp(term), "i");
      if (await clickMatchingOption(page, partial)) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(400);
        if (await isLocatorValid(locator)) return true;
      }
    }
  }

  return isLocatorValid(locator);
}

export async function fillGreenhouseLocation(
  root: FormRoot,
  locator: Locator,
  city: string,
  state: string,
  country: string
): Promise<boolean> {
  const page = playwrightPage(root);
  const terms = locationSearchTerms(city, state, country);

  for (const term of terms) {
    await openCombobox(locator);
    await locator.fill("");
    await locator.fill(term);
    await page.waitForTimeout(700);

    const cityPattern = new RegExp(escapeRegExp(city), "i");
    if (await clickMatchingOption(page, cityPattern)) {
      await page.waitForTimeout(400);
      if (await isLocatorValid(locator)) return true;
    }
  }

  return isLocatorValid(locator);
}

export async function checkGreenhouseConsent(
  root: FormRoot,
  locator: Locator,
  fieldId: string
): Promise<boolean> {
  const page = locator.page();
  await locator.scrollIntoViewIfNeeded().catch(() => {});

  if (await locator.isChecked().catch(() => false)) return true;

  if (fieldId) {
    const label = root.locator(`label[for="${fieldId.replace(/"/g, '\\"')}"]`).first();
    if (await label.isVisible().catch(() => false)) {
      await label.click();
      await page.waitForTimeout(300);
      if (await locator.isChecked().catch(() => false)) return true;
    }
  }

  try {
    await locator.check({ timeout: 5000 });
  } catch {
    await locator.click({ force: true });
  }
  await page.waitForTimeout(300);
  if (await locator.isChecked().catch(() => false)) return true;

  await root.evaluate((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el || el.type !== "checkbox") return;
    el.checked = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("click", { bubbles: true }));
  }, fieldId);
  await page.waitForTimeout(200);

  return locator.isChecked().catch(() => false);
}
