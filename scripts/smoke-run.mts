import path from "path";
import { pathToFileURL } from "url";
import { runAgentWithTimeout } from "../src/agent/run.js";

const testForm = pathToFileURL(
  path.join(process.cwd(), "public", "test-form.html")
).href;

const r = await runAgentWithTimeout(testForm);
console.log(
  JSON.stringify(
    {
      success: r.success,
      runId: r.runId,
      recordingUrl: r.recordingUrl,
      fieldsDetected: r.fieldsDetected,
      fieldsFilled: r.fieldsFilled,
      diagnosis: r.diagnosis,
    },
    null,
    2
  )
);
