# Browser Form Agent (MVP)

Proof-of-concept: paste a URL, run a Playwright agent to inspect forms, fill fields from a hardcoded test profile, submit, and show results.

## Setup

1. `npm install`
2. `npx playwright install chromium`
3. `npm run dev`
4. Open http://localhost:3000
5. Paste: `http://localhost:3000/test-form.html`
6. Click **Run Agent**
7. Review the result and screenshot

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with tsx |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm test` | Run Vitest unit tests |

## Run artifacts

Each `/api/run` creates a folder under `runs/{runId}/`:

| File | Description |
|------|-------------|
| `run.json` | Full result, timestamps, and structured `logs[]` |
| `before.png` | Page after load |
| `after-fill.png` | Page after filling fields |
| `after-success.png` | Outcome when submission is verified |
| `after-fail.png` | Outcome on failure, blocked, or unverified submit |
| `recording.webm` | Full Playwright screen recording of the run (when enabled) |

The API returns `runId`, `logUrl` (e.g. `/runs/{runId}/run.json`), `recordingUrl`, `screenshots`, and **`diagnosis`** (summary, failure phase, auto-submit feasibility, hints). Legacy flat files in `screenshots/` are no longer written for new runs.

### Screen recording

Recording is **on by default**. Each run saves `runs/{runId}/recording.webm` and returns `recordingUrl` for playback in the UI. Set `RECORD_VIDEO=false` in `.env` to disable. If the agent hits the global timeout, the recording may be missing because the browser can still be running in the background.

### Greenhouse job URLs

URLs like `https://job-boards.greenhouse.io/.../jobs/...` are supported with a prep step (scroll, click **Apply**, wait for the form). **Auto-submit is not guaranteed**: custom questions, React comboboxes, and **reCAPTCHA Enterprise** often block full submission. Use the UI **diagnosis**, screenshots, and `run.json` to see whether automation is feasible for that posting.

### Application answers and resume

Edit [`src/types.ts`](src/types.ts) `CANDIDATE` for job-specific answers (`howDidYouHear`, `currentCompany`, `authorizedToWorkUS`, `requiresSponsorship`). Set `RESUME_PATH` in `.env` (default `fixtures/sample-resume.pdf`). Greenhouse combobox fields use label-based fill.

### Privacy consent checkbox

Set `ALLOW_REQUIRED_CONSENT=true` in `.env` to check **Candidate Privacy Policy** “I agree” only (not demographic/EEO consent).

Set `FILL_EEO_DUMMY=true` (default) to fill voluntary demographic survey comboboxes from `CANDIDATE` placeholders and check the demographic consent box. Set `FILL_EEO_DUMMY=false` to skip EEO again. Replace these values later via LLM integration.

Greenhouse comboboxes use `src/agent/greenhouseCombobox.ts` (option click + validation). For reCAPTCHA on submit, run headed with `HEADLESS=false` and optional `WAIT_FOR_RECAPTCHA_MS=90000` to pause before clicking Submit so you can solve the challenge manually.

### Soft guard (default)

If the page loads **reCAPTCHA or bot-related scripts/widgets** but the **application form is still visible** (at least 2 fillable inputs), the agent records a **`botWarning`**, **continues filling**, and attempts submit. Only true blockers (e.g. Cloudflare interstitial, login wall, or bot signals with **no** form) set hard `status: blocked`.

## Environment

Copy `.env` or set:

- `PORT` — default `3000`
- `HEADLESS` — `true` (default) or `false` to watch the browser while debugging
- `NAVIGATION_TIMEOUT_MS`, `ACTION_TIMEOUT_MS`, `SUBMISSION_TIMEOUT_MS`, `AGENT_TIMEOUT_MS`

## Known limitations

- Deterministic field mapping only (no LLM yet)
- No resume/file upload (`resume` is null in test profile)
- CAPTCHA and login pages stop the run (`blocked` / `requires_login`)
- Single-page forms; multi-step wizards may fail
- Submit detection is heuristic-based

## Next step

Add an `AIFieldMapper` implementing the same `FieldMapper` interface for ambiguous fields.
