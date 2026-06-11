const STORAGE_KEYS = {
  STATE: "collector_state_v1",
  RECORDS: "collector_records_v1"
};

const DEFAULT_STATE = {
  isCapturing: false,
  sessionId: null,
  startedAt: null,
  pausedAt: null
};

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  if (!state.sessionId) await setState(DEFAULT_STATE);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !/^https?:\/\//.test(tab.url)) return;

  const state = await getState();
  if (!state.isCapturing) return;

  // Small delay allows SPAs/pages to render some content.
  setTimeout(() => captureTab(tabId).catch(console.warn), 1200);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "GET_STATE": {
      const state = await getState();
      const records = await getRecords();
      return { ...state, count: records.length, ok: true };
    }
    case "START_CAPTURE": {
      const state = await getState();
      const next = {
        ...state,
        isCapturing: true,
        sessionId: state.sessionId || makeSessionId(),
        startedAt: state.startedAt || new Date().toISOString(),
        pausedAt: null
      };
      await setState(next);
      await captureActiveTab();
      return { ok: true, ...next };
    }
    case "PAUSE_CAPTURE": {
      const state = await getState();
      const next = { ...state, isCapturing: false, pausedAt: new Date().toISOString() };
      await setState(next);
      return { ok: true, ...next };
    }
    case "CAPTURE_CURRENT_PAGE": {
      await ensureSession();
      return await captureActiveTab();
    }
    case "EXPORT_ZIP": {
      return await exportZip();
    }
    case "EXPORT_JSON": {
      return await exportJson();
    }
    case "CLEAR_DATA": {
      await chrome.storage.local.set({
        [STORAGE_KEYS.STATE]: DEFAULT_STATE,
        [STORAGE_KEYS.RECORDS]: []
      });
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

async function getState() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.STATE);
  return data[STORAGE_KEYS.STATE] || DEFAULT_STATE;
}

async function setState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state });
}

async function getRecords() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.RECORDS);
  return data[STORAGE_KEYS.RECORDS] || [];
}

async function setRecords(records) {
  await chrome.storage.local.set({ [STORAGE_KEYS.RECORDS]: records });
}

async function ensureSession() {
  const state = await getState();
  if (!state.sessionId) {
    await setState({ ...state, sessionId: makeSessionId(), startedAt: new Date().toISOString() });
  }
}

function makeSessionId() {
  return `session_${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab found" };
  return await captureTab(tab.id);
}

async function captureTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    return { ok: false, error: "Only http/https webpages can be captured" };
  }

  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }).catch(() => null);

  const response = await chrome.tabs.sendMessage(tabId, { type: "COLLECT_ARTIFACTS" }).catch((error) => ({
    ok: false,
    error: error.message
  }));

  if (!response?.ok) return { ok: false, error: response?.error || "Content collection failed" };

  let screenshotDataUrl = null;
  try {
    screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch (error) {
    screenshotDataUrl = null;
  }

  const state = await getState();
  const records = await getRecords();

  const record = {
    id: `capture_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    sessionId: state.sessionId || makeSessionId(),
    ...response.data,
    screenshotDataUrl
  };

  // Avoid immediate duplicate captures of the same URL within 5 seconds.
  const last = records[records.length - 1];
  if (last && last.url === record.url) {
    const diffMs = new Date(record.capturedAt) - new Date(last.capturedAt);
    if (diffMs >= 0 && diffMs < 5000) return { ok: true, skippedDuplicate: true };
  }

  records.push(record);
  await setRecords(records);
  return { ok: true, recordId: record.id, count: records.length };
}

async function exportJson() {
  const state = await getState();
  const records = await getRecords();
  if (!records.length) return { ok: false, error: "No records to export" };

  // Export as JSON array for extraction tool
  const data = {
    exportedAt: new Date().toISOString(),
    session: state,
    count: records.length,
    records: records.map(({ screenshotDataUrl, htmlSnapshot, ...rest }) => rest)
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const filename = `${state.sessionId || "capture_session"}.json`;
  await chrome.downloads.download({ url, filename, saveAs: true });
  return { ok: true, filename };
}

async function exportZip() {
  const state = await getState();
  const records = await getRecords();
  if (!records.length) return { ok: false, error: "No records to export" };

  const files = [];
  const csvRows = [[
    "id", "session_id", "captured_at", "url", "page_title", "visible_text_file",
    "html_snapshot_file", "screenshot_file", "image_count", "image_urls_json"
  ]];

  const metadata = {
    exportedAt: new Date().toISOString(),
    session: state,
    count: records.length,
    records: records.map(({ screenshotDataUrl, htmlSnapshot, visibleText, bodyInnerText, ...rest }) => rest)
  };

  files.push({ path: "metadata.json", content: textToBytes(JSON.stringify(metadata, null, 2)) });

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const safe = String(i + 1).padStart(4, "0");
    const textPath = `visible_text/${safe}.txt`;
    const htmlPath = `html_snapshots/${safe}.html`;
    const imageJsonPath = `image_urls/${safe}.json`;
    const screenshotPath = r.screenshotDataUrl ? `screenshots/${safe}.png` : "";

    files.push({ path: textPath, content: textToBytes(r.visibleText || r.bodyInnerText || "") });
    files.push({ path: htmlPath, content: textToBytes(r.htmlSnapshot || "") });
    files.push({ path: imageJsonPath, content: textToBytes(JSON.stringify(r.imageUrls || [], null, 2)) });

    if (r.screenshotDataUrl) {
      files.push({ path: screenshotPath, content: dataUrlToBytes(r.screenshotDataUrl) });
    }

    csvRows.push([
      r.id,
      r.sessionId,
      r.capturedAt,
      r.url,
      r.title,
      textPath,
      htmlPath,
      screenshotPath,
      (r.imageUrls || []).length,
      JSON.stringify((r.imageUrls || []).map(x => x.src))
    ]);
  }

  files.push({ path: "captures.csv", content: textToBytes(toCsv(csvRows)) });
  files.push({ path: "README.txt", content: textToBytes(readmeText()) });

  const zipBytes = createZip(files);
  const blob = new Blob([zipBytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);

  const filename = `${state.sessionId || "capture_session"}.zip`;
  await chrome.downloads.download({ url, filename, saveAs: true });
  return { ok: true, filename };
}

function toCsv(rows) {
  return rows.map(row => row.map(cell => {
    const value = cell == null ? "" : String(cell);
    return `"${value.replaceAll('"', '""')}"`;
  }).join(",")).join("\n");
}

function readmeText() {
  return `Web Artifact Collector Export\n\nThis ZIP contains:\n- captures.csv: Excel-openable index file\n- metadata.json: structured metadata\n- visible_text/: extracted page text\n- html_snapshots/: raw HTML snapshots\n- screenshots/: visible viewport screenshots\n- image_urls/: image source URLs per page\n\nOCR is intentionally not done inside the extension. Run OCR later on screenshots or downloaded images.\n`;
}

function textToBytes(text) {
  return new TextEncoder().encode(text);
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Minimal ZIP writer: no compression, works without external libraries.
function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = file.content instanceof Uint8Array ? file.content : new Uint8Array(file.content);
    const crc = crc32(data);
    const mod = dosDateTime(new Date());

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, mod.time, true);
    lv.setUint16(12, mod.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, mod.time, true);
    cv.setUint16(14, mod.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);

  return concatUint8Arrays([...localParts, ...centralParts, end]);
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
