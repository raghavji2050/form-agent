const urlInput = document.getElementById("url-input");
const runBtn = document.getElementById("run-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const recordingWrap = document.getElementById("recording-wrap");
const runRecording = document.getElementById("run-recording");
const screenshotWrap = document.getElementById("screenshot-wrap");
const screenshotGrid = document.getElementById("screenshot-grid");
const logLinkWrap = document.getElementById("log-link-wrap");
const logLink = document.getElementById("log-link");

function setStatus(text, className = "") {
  statusEl.textContent = text;
  statusEl.className = "status " + className;
}

function pct(confidence) {
  if (confidence == null) return "—";
  return Math.round(confidence * 100) + "%";
}

function feasibilityLabel(value) {
  if (!value) return "—";
  if (value === "likely") return "Likely yes";
  if (value === "partial") return "Partial / maybe";
  return "Unlikely";
}

function renderDiagnosisBlock(data) {
  const d = data?.diagnosis;
  if (!d) return "";
  let html = `<dt>Diagnosis</dt><dd>${escapeHtml(d.summary)}</dd>`;
  if (d.failurePhase) {
    html += `<dt>Failure phase</dt><dd>${escapeHtml(d.failurePhase)}</dd>`;
  }
  html += `<dt>Auto-submit feasible?</dt><dd>${escapeHtml(feasibilityLabel(d.autoSubmitFeasibility))}</dd>`;
  if (d.hints?.length) {
    html += `<dt>Why</dt><dd><ul class="evidence">`;
    for (const h of d.hints) {
      html += `<li>${escapeHtml(h)}</li>`;
    }
    html += `</ul></dd>`;
  }
  return html;
}

function renderResult(data) {
  resultEl.classList.remove("empty");
  hideArtifacts();

  const submitted = data?.submitted ? "YES" : "NO";
  const submittedClass = data?.submitted ? "yes" : "no";

  let html = "<p><strong>Agent Result</strong></p><dl>";
  if (data?.runId) html += `<dt>Run ID</dt><dd>${escapeHtml(data.runId)}</dd>`;
  html += renderDiagnosisBlock(data);

  if (data?.url) html += `<dt>URL</dt><dd>${escapeHtml(data.url)}</dd>`;
  if (data?.title) html += `<dt>Page</dt><dd>${escapeHtml(data.title)}</dd>`;
  if (data?.fieldsDetected != null)
    html += `<dt>Fields detected</dt><dd>${data.fieldsDetected}</dd>`;
  if (data?.fieldsFilled != null)
    html += `<dt>Fields filled</dt><dd>${data.fieldsFilled}</dd>`;
  if (data?.fieldsSkipped != null)
    html += `<dt>Fields skipped</dt><dd>${data.fieldsSkipped}</dd>`;
  if (data?.submitted != null) {
    html += `<dt>Submitted</dt><dd><span class="${submittedClass}">${submitted}</span></dd>`;
  }

  if (data?.status === "blocked") {
    html += `<dt>Status</dt><dd>blocked — ${escapeHtml(data.message || data.error || "")}</dd>`;
  }
  if (data?.status === "requires_login") {
    html += `<dt>Status</dt><dd>requires_login</dd>`;
  }
  if (data?.guardReasonDetail) {
    html += `<dt>Guard detail</dt><dd>${escapeHtml(data.guardReasonDetail)}</dd>`;
  }
  if (data?.botWarning) {
    html += `<dt>Bot warning</dt><dd>${escapeHtml(data.botWarning.reasonDetail || data.botWarning.message)} (continued to fill)</dd>`;
  }

  if (data?.submission?.confidence != null) {
    html += `<dt>Confidence</dt><dd>${pct(data.submission.confidence)}</dd>`;
  }

  if (data?.submission?.evidence?.length) {
    html += `<dt>Evidence</dt><dd><ul class="evidence">`;
    for (const e of data.submission.evidence) {
      html += `<li class="ok">${escapeHtml(e)}</li>`;
    }
    html += `</ul></dd>`;
  }

  if (data?.error && !data?.diagnosis) {
    html += `<dt>Reason</dt><dd>${escapeHtml(data.error)}</dd>`;
  }

  html += "</dl>";
  resultEl.innerHTML = html;
  showLogLink(data?.logUrl);
  showRecording(data);
  showScreenshots(data);
}

function hideArtifacts() {
  recordingWrap.classList.add("hidden");
  runRecording.removeAttribute("src");
  runRecording.load();
  screenshotWrap.classList.add("hidden");
  screenshotGrid.innerHTML = "";
  logLinkWrap.classList.add("hidden");
}

function showRecording(data) {
  const src = data?.recordingUrl;
  if (!src) return;
  const cacheBust = Date.now();
  runRecording.src = `${src}?t=${cacheBust}`;
  recordingWrap.classList.remove("hidden");
}

function showLogLink(logUrl) {
  if (!logUrl) return;
  logLink.href = logUrl;
  logLinkWrap.classList.remove("hidden");
}

function showScreenshots(data) {
  const shots = data?.screenshots || {};
  const items = [
    { label: "Before", src: shots.before },
    { label: "After fill", src: shots.afterFill },
    { label: "Success", src: shots.afterSuccess },
    { label: "Fail", src: shots.afterFail },
  ].filter((x) => x.src);

  if (!items.length && data?.screenshot) {
    items.push({ label: "Outcome", src: data.screenshot });
  }

  if (!items.length) return;

  const cacheBust = Date.now();
  screenshotGrid.innerHTML = items
    .map(
      (item) =>
        `<figure class="shot-figure"><figcaption>${escapeHtml(item.label)}</figcaption>` +
        `<img src="${escapeHtml(item.src)}?t=${cacheBust}" alt="${escapeHtml(item.label)}" /></figure>`
    )
    .join("");
  screenshotWrap.classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

runBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Please enter a URL", "error");
    return;
  }

  runBtn.disabled = true;
  setStatus("Running agent…", "running");
  resultEl.classList.add("empty");
  resultEl.textContent = "—";
  hideArtifacts();

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    const summary = data.diagnosis?.summary;
    if (summary) {
      setStatus(summary, data.success ? "done" : "error");
    } else {
      setStatus(data.success ? "Complete" : "Finished with issues", data.success ? "done" : "error");
    }
    renderResult(data);
  } catch (err) {
    setStatus("Request failed", "error");
    renderResult({ error: err.message || "Network error" });
  } finally {
    runBtn.disabled = false;
  }
});

urlInput.value = window.location.origin + "/test-form.html";
