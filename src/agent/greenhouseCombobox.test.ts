import { describe, expect, it } from "vitest";
import { comboboxSearchTerms, locationSearchTerms } from "./greenhouseCombobox.js";

describe("greenhouseCombobox helpers", () => {
  it("expands prefer-not fallbacks", () => {
    const terms = comboboxSearchTerms("Prefer not to say", "genderIdentity");
    expect(terms.some((t) => /prefer not/i.test(t))).toBe(true);
  });

  it("builds location search strings", () => {
    const terms = locationSearchTerms("Ludhiana", "Punjab", "India");
    expect(terms[0]).toContain("Ludhiana");
    expect(terms[0]).toContain("India");
  });
});
