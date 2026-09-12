import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runAgentWithTimeout } from "./agent/run.js";
import { validateHttpUrl } from "./validateUrl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const app = express();
app.use(express.json());

app.use(express.static(path.join(ROOT, "public")));
app.use("/runs", express.static(path.join(ROOT, "runs")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/run", async (req, res) => {
  const validation = validateHttpUrl(req.body?.url);
  if (!validation.ok) {
    res.status(400).json({
      success: false,
      submitted: false,
      error: validation.error,
    });
    return;
  }

  try {
    const result = await runAgentWithTimeout(validation.url);
    const statusCode = result.success ? 200 : result.status ? 200 : 200;
    res.status(statusCode).json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Server error";
    res.status(500).json({
      success: false,
      submitted: false,
      error,
    });
  }
});

const port = parseInt(process.env.PORT || "3000", 10);

app.listen(port, () => {
  console.log(`Form Agent listening on http://localhost:${port}`);
});
