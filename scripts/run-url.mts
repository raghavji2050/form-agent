import "dotenv/config";
import { runAgentWithTimeout } from "../src/agent/run.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/run-url.mts <url>");
  process.exit(1);
}

const r = await runAgentWithTimeout(url);
console.log(JSON.stringify(r, null, 2));
