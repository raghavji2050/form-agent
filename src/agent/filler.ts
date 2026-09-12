import path from "path";
import type { Frame, Locator, Page } from "playwright";
import type {
  CandidateKey,
  CandidateProfile,
  FieldMapping,
  FillRecord,
  FormField,
} from "../types.js";
import { normalizeFieldKey } from "./mapper.js";
import type { RunLogger } from "./runLogger.js";
import type { FormRoot } from "./greenhouse.js";
import { setReactInputValue } from "./inBrowser/setReactInputValue.js";
import { resolveResumePath } from "./resolveResumePath.js";
import {
  checkGreenhouseConsent,
  fillGreenhouseCombobox,
  fillGreenhouseLocation,
  playwrightPage as ghPage,
} from "./greenhouseCombobox.js";

function fieldDisplayName(field: FormField): string {
  return field.label || field.placeholder || field.name || field.id || field.selector;
}

function cleanLabel(label: string): string {
  return label.replace(/\*+$/, "").trim();
}

function isDemographicConsent(field: FormField): boolean {
  const hay = normalizeFieldKey(
    [field.label, field.name, field.id, field.ariaLabel].join(" ")
  );
  return hay.includes("demographic") || hay.includes("responses to the demographic");
}

function isPrivacyConsent(field: FormField): boolean {
  if (field.type !== "checkbox" && field.type !== "radio") return false;
  const hay = normalizeFieldKey(
    [field.label, field.name, field.id, field.ariaLabel].join(" ")
  );
  if (isDemographicConsent(field)) return false;
  return (
    hay.includes("privacy") ||
    (hay.includes("agree") && hay.includes("candidate")) ||
    (hay.includes("i agree") && hay.includes("policy"))
  );
}

function fillEeoDummyEnabled(): boolean {
  return process.env.FILL_EEO_DUMMY !== "false";
}

function isLegalOrTerms(field: FormField): boolean {
  if (isDemographicConsent(field) && fillEeoDummyEnabled()) {
    return false;
  }
  if (isPrivacyConsent(field) && process.env.ALLOW_REQUIRED_CONSENT === "true") {
    return false;
  }
  const hay = normalizeFieldKey(
    [field.label, field.name, field.id, field.ariaLabel].join(" ")
  );
  return (
    hay.includes("terms") ||
    hay.includes("privacy") ||
    hay.includes("agree") ||
    hay.includes("consent") ||
    hay.includes("declaration")
  );
}

function isTextLike(field: FormField): boolean {
  if (field.tag === "textarea") return true;
  const t = field.type;
  return (
    t === "text" ||
    t === "email" ||
    t === "tel" ||
    t === "url" ||
    t === "search" ||
    t === ""
  );
}

function playwrightPage(root: FormRoot): Page {
  return ghPage(root);
}

function isGenericSelector(selector: string): boolean {
  return selector === 'input[type="text"]' || selector === "input" || selector === "textarea";
}

function resolveLocator(root: FormRoot, field: FormField): Locator {
  if (field.id && !isGenericSelector(field.selector)) {
    return root.locator(field.selector).first();
  }
  if (field.ariaLabel.length > 2) {
    return root.getByLabel(field.ariaLabel, { exact: false }).first();
  }
  const label = cleanLabel(field.label);
  if (label.length > 2 && label.toLowerCase() !== "search" && label.toLowerCase() !== "attach") {
    return root.getByLabel(label, { exact: false }).first();
  }
  return root.locator(field.selector).first();
}

export interface FillOutcome {
  records: FillRecord[];
  fieldsFilled: number;
  fieldsSkipped: number;
}

async function fillTextLike(
  root: FormRoot,
  field: FormField,
  locator: Locator,
  value: string
): Promise<"playwright" | "react_setter"> {
  await locator.fill(value);
  const afterFill = await locator.inputValue().catch(() => "");
  if (afterFill === value || afterFill.includes(value)) {
    return "playwright";
  }

  const reactResult = await root.evaluate(setReactInputValue, {
    selector: field.selector,
    value,
  });
  if (reactResult?.ok) {
    return "react_setter";
  }

  await locator.fill(value);
  return "playwright";
}

async function fillCombobox(
  root: FormRoot,
  locator: Locator,
  value: string,
  candidateKey?: CandidateKey
): Promise<boolean> {
  return fillGreenhouseCombobox(root, locator, value, candidateKey);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMBOBOX_CANDIDATE_KEYS = new Set<CandidateKey>([
  "howDidYouHear",
  "authorizedToWorkUS",
  "requiresSponsorship",
  "privacyAgreement",
  "genderIdentity",
  "transgenderExperience",
  "sexualOrientation",
  "disabilityStatus",
  "veteranStatus",
  "ethnicity",
  "country",
]);

function isLikelyCombobox(
  field: FormField,
  value: string,
  candidateKey?: CandidateKey
): boolean {
  if (field.tag === "select") return false;
  if (candidateKey && COMBOBOX_CANDIDATE_KEYS.has(candidateKey)) return true;
  const v = value.toLowerCase();
  if (v === "yes" || v === "no" || v.includes("agree") || v.includes("prefer not")) {
    return true;
  }
  if (field.label.includes("?") && field.type === "text") return true;
  if (field.label.toLowerCase().includes("how did you hear")) return true;
  return false;
}

async function fillRadioChoice(
  root: FormRoot,
  field: FormField,
  value: string
): Promise<boolean> {
  const label = cleanLabel(field.label);
  const pattern = new RegExp(escapeRegExp(value), "i");
  if (label.length > 2) {
    const group = root.getByLabel(label, { exact: false });
    const byRole = group.getByRole("radio", { name: pattern }).first();
    if (await byRole.isVisible().catch(() => false)) {
      await byRole.check({ force: true });
      return true;
    }
  }
  const pageRadio = root.getByRole("radio", { name: pattern }).first();
  if (await pageRadio.isVisible().catch(() => false)) {
    await pageRadio.check({ force: true });
    return true;
  }
  return false;
}

export async function fillForm(
  root: FormRoot,
  fields: FormField[],
  mappings: FieldMapping[],
  candidate: CandidateProfile,
  logger?: RunLogger
): Promise<FillOutcome> {
  const log = (msg: string) => (logger ? logger.info(msg) : console.log(`[Agent] ${msg}`));
  const records: FillRecord[] = [];
  let fieldsFilled = 0;
  let fieldsSkipped = 0;

  const mappingByIndex = new Map(mappings.map((m) => [m.fieldIndex, m]));
  const fillableFields = fields.filter(
    (f) => f.tag === "input" || f.tag === "textarea" || f.tag === "select"
  );

  const resumePath = resolveResumePath(candidate.resume);
  let deferredDemographicConsent: FormField | null = null;

  for (const field of fillableFields) {
    const display = fieldDisplayName(field);

    if (field.type === "file") {
      if (!resumePath) {
        log("Resume upload detected");
        records.push({
          field: display,
          status: "skipped",
          reason: "Resume upload detected; skipped because no file configured",
        });
        fieldsSkipped++;
        continue;
      }
      try {
        const locator = resolveLocator(root, field);
        await locator.setInputFiles(resumePath);
        log(`Uploaded resume: ${path.basename(resumePath)}`);
        records.push({ field: display, status: "filled", filledVia: "file" });
        fieldsFilled++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : "File upload failed";
        records.push({ field: display, status: "failed", reason });
        fieldsSkipped++;
      }
      continue;
    }

    if (field.type === "checkbox" || field.type === "radio") {
      const earlyMapping = mappingByIndex.get(field.index);
      if (earlyMapping && field.type === "radio") {
        try {
          const ok = await fillRadioChoice(root, field, earlyMapping.value);
          if (ok) {
            log(`Selected radio: ${earlyMapping.candidateKey}`);
            records.push({ field: display, status: "filled" });
            fieldsFilled++;
          } else {
            records.push({
              field: display,
              status: "failed",
              reason: `No radio option matching "${earlyMapping.value}"`,
            });
            fieldsSkipped++;
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Radio fill failed";
          records.push({ field: display, status: "failed", reason });
          fieldsSkipped++;
        }
        continue;
      }

      if (isDemographicConsent(field) && fillEeoDummyEnabled()) {
        deferredDemographicConsent = field;
        continue;
      }

      if (isPrivacyConsent(field) && process.env.ALLOW_REQUIRED_CONSENT === "true") {
        try {
          const locator = resolveLocator(root, field);
          if (!(await locator.isChecked().catch(() => false))) {
            await locator.check({ force: true });
          }
          log(`Checked privacy consent: ${display.slice(0, 80)}`);
          records.push({ field: display, status: "filled" });
          fieldsFilled++;
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Consent check failed";
          records.push({ field: display, status: "failed", reason });
          fieldsSkipped++;
        }
        continue;
      }
      if (isLegalOrTerms(field)) {
        log(`Skipping legal/terms control: ${display.slice(0, 80)}`);
        records.push({
          field: display,
          status: "skipped",
          reason: "Legal/terms control not auto-filled",
        });
        fieldsSkipped++;
      } else {
        log(`Inspecting ${field.type}: ${display} (no automatic interaction)`);
        records.push({
          field: display,
          status: "skipped",
          reason: "Checkbox/radio skipped unless meaning is obvious",
        });
        fieldsSkipped++;
      }
      continue;
    }

    if (field.type === "hidden" || field.type === "submit" || field.type === "button") {
      continue;
    }

    const mapping = mappingByIndex.get(field.index);
    if (!mapping) {
      if (
        field.name === "g-recaptcha-response" ||
        normalizeFieldKey(field.name).includes("recaptcha")
      ) {
        fieldsSkipped++;
        continue;
      }
      if (display.toLowerCase() === "search" || field.selector === 'input[type="text"]') {
        fieldsSkipped++;
        continue;
      }
      log(`Skipping unknown field: ${display}`);
      records.push({
        field: display,
        status: "skipped",
        reason: "No candidate data available or could not map field",
      });
      fieldsSkipped++;
      continue;
    }

    log(`Filling ${mapping.candidateKey} (${display})`);

    try {
      const locator = resolveLocator(root, field);
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) {
        records.push({
          field: display,
          status: "skipped",
          reason: "Field not visible",
        });
        fieldsSkipped++;
        continue;
      }

      let filledVia: FillRecord["filledVia"] = "playwright";

      if (field.tag === "select") {
        const normVal = normalizeFieldKey(mapping.value);
        const options = field.options || [];
        let matched: string | null = null;
        for (const opt of options) {
          const t = normalizeFieldKey(opt.text);
          const v = normalizeFieldKey(opt.value);
          if (t === normVal || v === normVal || t.includes(normVal) || normVal.includes(t)) {
            matched = opt.value || opt.text;
            break;
          }
        }
        if (!matched) {
          records.push({
            field: display,
            status: "skipped",
            reason: `No matching select option for ${mapping.value}`,
          });
          fieldsSkipped++;
          continue;
        }
        try {
          await locator.selectOption({ value: matched });
        } catch {
          await locator.selectOption({ label: matched });
        }
      } else if (mapping.candidateKey === "city") {
        const ok = await fillGreenhouseLocation(
          root,
          locator,
          candidate.city,
          candidate.state,
          candidate.country
        );
        filledVia = "combobox";
        if (!ok) {
          records.push({
            field: display,
            status: "failed",
            reason: "Location autocomplete did not validate",
          });
          fieldsSkipped++;
          continue;
        }
      } else if (isLikelyCombobox(field, mapping.value, mapping.candidateKey)) {
        const ok = await fillCombobox(root, locator, mapping.value, mapping.candidateKey);
        filledVia = "combobox";
        if (!ok) {
          records.push({
            field: display,
            status: "failed",
            reason: `Combobox value did not validate: ${mapping.value}`,
          });
          fieldsSkipped++;
          continue;
        }
      } else if (isTextLike(field)) {
        filledVia = await fillTextLike(root, field, locator, mapping.value);
        if (filledVia === "react_setter") {
          log(`Filled via React setter: ${display}`);
        }
      } else {
        await locator.fill(mapping.value);
      }

      records.push({ field: display, status: "filled", filledVia });
      fieldsFilled++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Fill failed";
      records.push({ field: display, status: "failed", reason });
      fieldsSkipped++;
    }
  }

  if (deferredDemographicConsent && fillEeoDummyEnabled()) {
    const field = deferredDemographicConsent;
    const display = fieldDisplayName(field);
    try {
      const locator = resolveLocator(root, field);
      const ok = await checkGreenhouseConsent(root, locator, field.id);
      if (ok) {
        log(`Checked demographic survey consent: ${display.slice(0, 80)}`);
        records.push({ field: display, status: "filled" });
        fieldsFilled++;
      } else {
        records.push({
          field: display,
          status: "failed",
          reason: "Demographic consent could not be checked (survey fields may still be invalid)",
        });
        fieldsSkipped++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Consent check failed";
      records.push({ field: display, status: "failed", reason });
      fieldsSkipped++;
    }
  }

  return { records, fieldsFilled, fieldsSkipped };
}
