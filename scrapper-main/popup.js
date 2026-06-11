const $ = (id) => document.getElementById(id);

async function send(type, payload = {}) {
  return await chrome.runtime.sendMessage({ type, ...payload });
}

async function refresh() {
  const state = await send("GET_STATE");
  $("status").textContent = state.isCapturing
    ? "Capturing. Scroll the group feed — posts are collected as you go."
    : "Paused. Start to begin collecting.";
  $("postCount").textContent = state.postCount || 0;
  $("mode").textContent = state.isCapturing ? "capturing" : "paused";

  $("startBtn").disabled = state.isCapturing;
  $("pauseBtn").disabled = !state.isCapturing;
}

$("startBtn").addEventListener("click", async () => {
  await send("START_CAPTURE");
  await refresh();
});

$("pauseBtn").addEventListener("click", async () => {
  $("status").textContent = "Pausing + exporting CSV...";
  const res = await send("PAUSE_CAPTURE");
  if (res?.exported?.ok) {
    $("status").textContent = `Done. ${res.exported.listings} listings → Downloads/${res.exported.filename}`;
  } else {
    $("status").textContent = `Paused. Export: ${res?.exported?.error || "no data"}`;
  }
  await refresh();
});

$("exportCsvBtn").addEventListener("click", async () => {
  $("status").textContent = "Exporting CSV...";
  const res = await send("EXPORT_CSV");
  $("status").textContent = res?.ok
    ? `${res.listings} listings → Downloads/${res.filename}`
    : `Export failed: ${res?.error || "unknown error"}`;
});

$("exportJsonBtn").addEventListener("click", async () => {
  $("status").textContent = "Exporting JSON...";
  const res = await send("EXPORT_JSON");
  $("status").textContent = res?.ok ? `Saved ${res.filename}` : `Export failed: ${res?.error || "unknown error"}`;
});

$("clearBtn").addEventListener("click", async () => {
  const confirmed = confirm("Clear all captured posts from this browser?");
  if (!confirmed) return;
  await send("CLEAR_DATA");
  await refresh();
});

refresh();

// Live-update the post counter while the popup is open.
setInterval(refresh, 2000);
