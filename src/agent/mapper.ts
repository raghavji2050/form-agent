import type {
  CandidateKey,
  FieldMapper,
  FieldMapping,
  FormField,
} from "../types.js";
import { CANDIDATE } from "../types.js";

export function normalizeFieldKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function fieldSignals(field: FormField): string {
  return [
    field.name,
    field.id,
    field.placeholder,
    field.label,
    field.ariaLabel,
  ]
    .filter(Boolean)
    .join(" ");
}

type Rule = {
  keys: CandidateKey;
  patterns: string[];
};

const RULES: Rule[] = [
  {
    keys: "firstName",
    patterns: [
      "firstname",
      "fname",
      "first_name",
      "givenname",
      "given_name",
      "preferredfirstname",
    ],
  },
  {
    keys: "lastName",
    patterns: ["lastname", "lname", "last_name", "surname", "familyname", "family_name"],
  },
  {
    keys: "fullName",
    patterns: ["fullname", "full_name", "applicantname", "yourname"],
  },
  {
    keys: "email",
    patterns: ["email", "emailaddress", "email_address", "workemail", "work_email"],
  },
  {
    keys: "phone",
    patterns: [
      "phone",
      "mobile",
      "mobilenumber",
      "phonenumber",
      "telephone",
      "tel",
      "cell",
    ],
  },
  {
    keys: "address",
    patterns: ["address", "street", "streetaddress", "mailingaddress"],
  },
  { keys: "city", patterns: ["city", "town", "locationcity"] },
  { keys: "state", patterns: ["state", "province", "region"] },
  { keys: "country", patterns: ["country", "nation"] },
  { keys: "linkedin", patterns: ["linkedin", "linked_in", "linkedinprofile"] },
  { keys: "github", patterns: ["github", "git_hub"] },
  {
    keys: "howDidYouHear",
    patterns: ["howdidyouhear", "howdidyouhearabout", "source", "referral"],
  },
  {
    keys: "currentCompany",
    patterns: [
      "currentcompany",
      "mostrecentcompany",
      "recentcompany",
      "employer",
      "companyname",
    ],
  },
  {
    keys: "authorizedToWorkUS",
    patterns: [
      "authorizedtowork",
      "workauthorization",
      "legallyauthorized",
      "authorizedtoworkintheus",
      "authorizedtoworkus",
    ],
  },
  {
    keys: "requiresSponsorship",
    patterns: [
      "requiresponsorship",
      "immigrationsponsorship",
      "sponsorship",
      "requireimmigration",
    ],
  },
  {
    keys: "privacyAgreement",
    patterns: [
      "candidateprivacypolicy",
      "privacypolicy",
      "iagreeunderstand",
      "processedinaccordance",
    ],
  },
  {
    keys: "genderIdentity",
    patterns: ["genderidentity", "whatgenderidentity"],
  },
  {
    keys: "transgenderExperience",
    patterns: ["transgenderexperience", "personoftransgender"],
  },
  {
    keys: "sexualOrientation",
    patterns: ["sexualorientation", "whatsexualorientation"],
  },
  {
    keys: "disabilityStatus",
    patterns: ["disability", "livewithadisability", "outlinedbytheada"],
  },
  {
    keys: "veteranStatus",
    patterns: ["veteran", "servedinthemilitary", "militaryservice"],
  },
  {
    keys: "ethnicity",
    patterns: ["ethnicity", "ethnicities", "mostcloselyidentifywith"],
  },
];

function matchesPattern(normalizedHaystack: string, pattern: string): boolean {
  const p = normalizeFieldKey(pattern);
  if (!p) return false;
  if (normalizedHaystack === p) return true;
  if (normalizedHaystack.includes(p) && p.length >= 4) return true;
  return false;
}

function resolveCandidateKey(field: FormField): {
  key: CandidateKey | null;
  confidence: number;
} {
  const hay = normalizeFieldKey(fieldSignals(field));
  if (!hay) return { key: null, confidence: 0 };

  if (field.name === "g-recaptcha-response" || hay.includes("recaptcha")) {
    return { key: null, confidence: 0 };
  }

  if (field.type === "email") {
    return { key: "email", confidence: 0.95 };
  }
  if (field.type === "tel") {
    return { key: "phone", confidence: 0.9 };
  }

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (matchesPattern(hay, pattern)) {
        if (rule.keys === "firstName" && hay.includes("preferred") && !pattern.includes("preferred")) {
          if (pattern === "firstname" && hay.includes("preferredfirstname")) continue;
        }
        if (rule.keys === "fullName" && hay.includes("first")) continue;
        if (rule.keys === "fullName" && hay.includes("last")) continue;
        if (rule.keys === "firstName" && hay.includes("lastname")) continue;
        if (rule.keys === "lastName" && hay.includes("firstname")) continue;
        return { key: rule.keys, confidence: 0.85 };
      }
    }
  }

  if (hay.includes("howdidyouhear")) {
    return { key: "howDidYouHear", confidence: 0.9 };
  }
  if (hay.includes("mostrecent") && hay.includes("company")) {
    return { key: "currentCompany", confidence: 0.9 };
  }
  if (hay.includes("authorized") && hay.includes("work")) {
    return { key: "authorizedToWorkUS", confidence: 0.9 };
  }
  if (hay.includes("sponsorship") || (hay.includes("immigration") && hay.includes("require"))) {
    return { key: "requiresSponsorship", confidence: 0.9 };
  }
  if (hay.includes("privacypolicy") || (hay.includes("iagree") && hay.includes("candidate"))) {
    return { key: "privacyAgreement", confidence: 0.9 };
  }
  if (hay.includes("gender") && hay.includes("identity")) {
    return { key: "genderIdentity", confidence: 0.9 };
  }
  if (hay.includes("transgender")) {
    return { key: "transgenderExperience", confidence: 0.9 };
  }
  if (hay.includes("sexual") && hay.includes("orientation")) {
    return { key: "sexualOrientation", confidence: 0.9 };
  }
  if (hay.includes("disability") || hay.includes("ada")) {
    return { key: "disabilityStatus", confidence: 0.9 };
  }
  if (hay.includes("veteran") || (hay.includes("military") && hay.includes("serve"))) {
    return { key: "veteranStatus", confidence: 0.9 };
  }
  if (hay.includes("ethnicit")) {
    return { key: "ethnicity", confidence: 0.9 };
  }

  if (
    field.tag === "textarea" &&
    (hay.includes("message") || hay.includes("coverletter") || hay.includes("cover"))
  ) {
    return { key: null, confidence: 0 };
  }

  return { key: null, confidence: 0 };
}

export class DeterministicFieldMapper implements FieldMapper {
  async mapFields(fields: FormField[]): Promise<FieldMapping[]> {
    const mappings: FieldMapping[] = [];
    const usedKeys = new Set<CandidateKey>();

    for (const field of fields) {
      if (field.type === "file") continue;
      if (field.type === "hidden") continue;
      if (field.type === "submit" || field.type === "button") continue;

      const labelNorm = normalizeFieldKey(field.label);
      if (labelNorm === "search") continue;

      const { key, confidence } = resolveCandidateKey(field);
      if (!key) continue;

      const value = CANDIDATE[key];
      if (value == null || value === "") continue;

      if (key === "fullName" && usedKeys.has("firstName") && usedKeys.has("lastName")) {
        continue;
      }
      if ((key === "firstName" || key === "lastName") && usedKeys.has("fullName")) {
        continue;
      }

      if (field.tag === "select" && field.options) {
        const normVal = normalizeFieldKey(String(value));
        const match = field.options.some(
          (o) =>
            normalizeFieldKey(o.text) === normVal ||
            normalizeFieldKey(o.value) === normVal ||
            normalizeFieldKey(o.text).includes(normVal) ||
            normVal.includes(normalizeFieldKey(o.text))
        );
        if (!match) continue;
      }

      mappings.push({
        fieldIndex: field.index,
        candidateKey: key,
        value: String(value),
        confidence,
      });
      usedKeys.add(key);
    }

    return mappings;
  }
}
