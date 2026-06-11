const $ = (id) => document.getElementById(id);

async function send(type, payload = {}) {
  return await chrome.runtime.sendMessage({ type, ...payload });
}

async function refresh() {
  const state = await send("GET_STATE");
  $("status").textContent = state.isCapturing
    ? "Capture is running. Browse pages normally."
    : "Capture is paused/stopped.";
  $("sessionId").textContent = state.sessionId || "-";
  $("count").textContent = state.count || 0;
  $("mode").textContent = state.isCapturing ? "running" : "paused";

  $("startBtn").disabled = state.isCapturing;
  $("pauseBtn").disabled = !state.isCapturing;
}

$("startBtn").addEventListener("click", async () => {
  await send("START_CAPTURE");
  await refresh();
});

$("pauseBtn").addEventListener("click", async () => {
  await send("PAUSE_CAPTURE");
  await refresh();
});

$("captureBtn").addEventListener("click", async () => {
  $("status").textContent = "Capturing current page...";
  const res = await send("CAPTURE_CURRENT_PAGE");
  $("status").textContent = res?.ok ? "Current page captured." : `Capture failed: ${res?.error || "unknown error"}`;
  await refresh();
});

$("exportBtn").addEventListener("click", async () => {
  $("status").textContent = "Preparing ZIP export...";
  const res = await send("EXPORT_ZIP");
  $("status").textContent = res?.ok ? "ZIP export started." : `Export failed: ${res?.error || "unknown error"}`;
  await refresh();
});

$("exportJsonBtn").addEventListener("click", async () => {
  $("status").textContent = "Preparing JSON export...";
  const res = await send("EXPORT_JSON");
  $("status").textContent = res?.ok ? "JSON export started. Use with scraper-extraction/extract.py" : `Export failed: ${res?.error || "unknown error"}`;
  await refresh();
});

$("clearBtn").addEventListener("click", async () => {
  const confirmed = confirm("Clear all captured artifacts from this browser?");
  if (!confirmed) return;
  await send("CLEAR_DATA");
  await refresh();
});

refresh();
