import type { Page } from "playwright";
import type { FormField, AgentStatus, BotWarning } from "../types.js";
import { detectGuard } from "./inBrowser/detectGuard.js";
import { collectFields } from "./inBrowser/collectFields.js";
import type { RunLogger } from "./runLogger.js";
import type { FormRoot } from "./greenhouse.js";

export interface InspectionResult {
  fields: FormField[];
  title: string;
  guard?: { status: AgentStatus; message: string; reasonDetail?: string };
  botWarning?: BotWarning;
}

type RawField = Omit<FormField, "index">;

type GuardEvalResult = {
  severity: "hard" | "soft";
  status: string;
  message: string;
  reasonDetail?: string;
};

function countFillable(raw: RawField[]): number {
  return raw.filter(
    (f) =>
      (f.tag === "input" || f.tag === "textarea" || f.tag === "select") &&
      f.type !== "hidden" &&
      f.type !== "submit" &&
      f.type !== "button" &&
      f.type !== "file"
  ).length;
}

async function collectFromRoot(root: FormRoot): Promise<RawField[]> {
  return (await root.evaluate(collectFields)) as RawField[];
}

export async function inspectPage(
  page: Page,
  logger?: RunLogger,
  formRoot?: FormRoot
): Promise<InspectionResult> {
  const log = (msg: string) => (logger ? logger.info(msg) : console.log(`[Agent] ${msg}`));
  const title = await page.title();
  const root = formRoot ?? page;

  const guardResult = (await page.evaluate(detectGuard)) as GuardEvalResult | null;

  if (guardResult?.severity === "hard") {
    log(`Guard triggered (hard): ${guardResult.message}`);
    return {
      fields: [],
      title,
      guard: {
        status: guardResult.status as AgentStatus,
        message: guardResult.message,
        reasonDetail: guardResult.reasonDetail,
      },
    };
  }

  let botWarning: BotWarning | undefined;
  if (guardResult?.severity === "soft") {
    botWarning = {
      message: guardResult.message,
      reasonDetail: guardResult.reasonDetail,
    };
    log(
      `Bot warning (soft): ${guardResult.reasonDetail ?? guardResult.message}; will inspect form anyway`
    );
  }

  log("Inspecting form");
  let rawFields = await collectFromRoot(root);

  if (countFillable(rawFields) < 2 && root !== page) {
    log("Few fields in iframe; also scanning main page");
    const mainFields = await collectFromRoot(page);
    if (countFillable(mainFields) > countFillable(rawFields)) {
      rawFields = mainFields;
    }
  }

  const fillable = countFillable(rawFields);

  if (guardResult?.severity === "soft" && fillable < 2) {
    log(
      `Bot signals present but only ${fillable} fillable field(s) found after prep — not treating as hard block`
    );
    if (fillable === 0) {
      return { fields: [], title, botWarning };
    }
  }

  const fields: FormField[] = rawFields.map((f, index) => ({ ...f, index }));

  if (botWarning && fillable >= 2) {
    log(`Continuing with ${fillable} fillable field(s) despite bot signals`);
  }

  log(`Detected ${fields.length} fields (${fillable} fillable)`);
  console.log(
    JSON.stringify(
      fields.filter((f) => f.tag !== "button" || f.type === "submit"),
      null,
      2
    )
  );

  return { fields, title, botWarning };
}
