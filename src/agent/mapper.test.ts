import { describe, it, expect } from "vitest";
import { DeterministicFieldMapper, normalizeFieldKey } from "./mapper.js";
import type { FormField } from "../types.js";

function field(partial: Partial<FormField> & { index: number }): FormField {
  return {
    tag: "input",
    type: "text",
    name: "",
    id: "",
    placeholder: "",
    label: "",
    ariaLabel: "",
    required: false,
    selector: "#x",
    ...partial,
  };
}

describe("normalizeFieldKey", () => {
  it("normalizes spaces and underscores", () => {
    expect(normalizeFieldKey("first_name")).toBe("firstname");
    expect(normalizeFieldKey("Given Name")).toBe("givenname");
  });
});

describe("DeterministicFieldMapper", () => {
  const mapper = new DeterministicFieldMapper();

  it("maps fname and email_address", async () => {
    const fields: FormField[] = [
      field({ index: 0, name: "fname", id: "fname" }),
      field({ index: 1, name: "email_address", type: "email" }),
      field({ index: 2, name: "phoneNumber", type: "tel" }),
      field({ index: 3, name: "expected_salary", label: "Expected salary" }),
    ];

    const mappings = await mapper.mapFields(fields);
    const keys = mappings.map((m) => m.candidateKey);

    expect(keys).toContain("firstName");
    expect(keys).toContain("email");
    expect(keys).toContain("phone");
    expect(keys).not.toContain("expected_salary" as never);
    expect(mappings.find((m) => m.fieldIndex === 3)).toBeUndefined();
  });

  it("maps EEO and privacy survey labels", async () => {
    const fields: FormField[] = [
      field({
        index: 0,
        label:
          'By selecting "I agree," I understand that the information I have provided as part of this job application will be processed in accordance with Reddit\'s Candidate Privacy Policy. *',
        type: "text",
      }),
      field({
        index: 1,
        label: "What gender identity do you most closely identify with? *",
        type: "text",
      }),
      field({
        index: 2,
        label: "Please select up to 2 ethnicities that you most closely identify with.*",
        type: "text",
      }),
    ];
    const mappings = await mapper.mapFields(fields);
    expect(mappings.some((m) => m.candidateKey === "privacyAgreement")).toBe(true);
    expect(mappings.some((m) => m.candidateKey === "genderIdentity")).toBe(true);
    expect(mappings.some((m) => m.candidateKey === "ethnicity")).toBe(true);
  });

  it("maps application question labels", async () => {
    const fields: FormField[] = [
      field({
        index: 0,
        label: "How did you hear about this job?",
        type: "text",
        name: "",
        id: "",
      }),
      field({
        index: 1,
        label: "Are you currently authorized to work in the U.S.?",
        type: "text",
      }),
    ];
    const mappings = await mapper.mapFields(fields);
    expect(mappings.some((m) => m.candidateKey === "howDidYouHear")).toBe(true);
    expect(mappings.some((m) => m.candidateKey === "authorizedToWorkUS")).toBe(true);
  });

  it("maps country select when India option exists", async () => {
    const fields: FormField[] = [
      field({
        index: 0,
        tag: "select",
        type: "select",
        name: "country",
        options: [
          { value: "US", text: "United States" },
          { value: "IN", text: "India" },
        ],
      }),
    ];
    const mappings = await mapper.mapFields(fields);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].candidateKey).toBe("country");
  });
});
