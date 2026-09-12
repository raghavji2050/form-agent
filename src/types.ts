export interface CandidateProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  linkedin: string;
  github: string;
  resume: string | null;
  howDidYouHear: string;
  currentCompany: string;
  authorizedToWorkUS: string;
  requiresSponsorship: string;
  /** Greenhouse-style privacy acknowledgement (often combobox "I agree") */
  privacyAgreement: string;
  /** Voluntary EEO / demographic survey placeholders (replace with LLM later) */
  genderIdentity: string;
  transgenderExperience: string;
  sexualOrientation: string;
  disabilityStatus: string;
  veteranStatus: string;
  ethnicity: string;
}

export const CANDIDATE: CandidateProfile = {
  firstName: "Raghav",
  lastName: "Test",
  fullName: "Raghav Test",
  email: "raghav.test@example.com",
  phone: "+919999999999",
  address: "India",
  city: "Ludhiana",
  state: "Punjab",
  country: "India",
  linkedin: "https://linkedin.com/in/example",
  github: "https://github.com/example",
  resume: "fixtures/sample-resume.pdf",
  howDidYouHear: "LinkedIn",
  currentCompany: "Example Corp",
  authorizedToWorkUS: "Yes",
  requiresSponsorship: "No",
  privacyAgreement: "I agree",
  genderIdentity: "I don't wish to answer",
  transgenderExperience: "I don't wish to answer",
  sexualOrientation: "I don't wish to answer",
  disabilityStatus: "I don't wish to answer",
  veteranStatus: "No military service",
  ethnicity: "I don't wish to answer",
};

export type CandidateKey = keyof CandidateProfile;

export interface SelectOption {
  value: string;
  text: string;
}

export interface FormField {
  index: number;
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  ariaLabel: string;
  required: boolean;
  selector: string;
  options?: SelectOption[];
}

export interface FieldMapping {
  fieldIndex: number;
  candidateKey: CandidateKey;
  value: string;
  confidence: number;
}

export interface FieldMapper {
  mapFields(fields: FormField[]): Promise<FieldMapping[]>;
}

export type FillStatus = "filled" | "skipped" | "failed";

export interface FillRecord {
  field: string;
  status: FillStatus;
  reason?: string;
  filledVia?: "playwright" | "react_setter" | "combobox" | "file";
}

export type FailurePhase =
  | "navigation"
  | "guard"
  | "inspect"
  | "fill"
  | "submit"
  | "verify"
  | "timeout";

export type AutoSubmitFeasibility = "likely" | "partial" | "unlikely";

export interface RunDiagnosis {
  summary: string;
  failurePhase?: FailurePhase;
  autoSubmitFeasibility: AutoSubmitFeasibility;
  hints: string[];
}

export interface SubmissionResult {
  submitted: boolean;
  confidence: number;
  evidence: string[];
  message?: string;
  submitButtonText?: string;
}

export type AgentStatus = "blocked" | "requires_login";

export interface BotWarning {
  message: string;
  reasonDetail?: string;
}

export interface RunResult {
  success: boolean;
  runId?: string;
  logUrl?: string;
  url?: string;
  title?: string;
  fieldsDetected?: number;
  fieldsFilled?: number;
  fieldsSkipped?: number;
  fillDetails?: FillRecord[];
  submitted?: boolean;
  submission?: SubmissionResult;
  message?: string;
  error?: string;
  status?: AgentStatus;
  screenshot?: string;
  recordingUrl?: string;
  screenshots?: {
    before?: string;
    afterFill?: string;
    afterSuccess?: string;
    afterFail?: string;
  };
  diagnosis?: RunDiagnosis;
  guardReasonDetail?: string;
  botWarning?: BotWarning;
}
