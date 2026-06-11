importScripts("extraction.js");

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

// Re-arm capture mode when a new page finishes loading while capturing.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !/^https?:\/\//.test(tab.url)) return;

  const state = await getState();
  if (!state.isCapturing) return;

  setTimeout(() => armTab(tabId).catch(console.warn), 1200);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case "GET_STATE": {
      const state = await getState();
      const records = await getRecords();
      const postCount = records.reduce((sum, r) => sum + (r.posts ? r.posts.length : 0), 0);
      return { ...state, count: records.length, postCount, ok: true };
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
      await armActiveTab();
      return { ok: true, ...next };
    }
    case "PAUSE_CAPTURE": {
      const state = await getState();
      const next = { ...state, isCapturing: false, pausedAt: new Date().toISOString() };
      await setState(next);
      await disarmActiveTab();
      // Auto-export: pause = your CSV is ready.
      const exported = await exportCsv().catch((e) => ({ ok: false, error: e.message }));
      return { ok: true, ...next, exported };
    }
    case "CAPTURE_CURRENT_PAGE": {
      await ensureSession();
      return await armActiveTab();
    }
    // Content script pushes freshly scraped posts as you scroll.
    case "POSTS_COLLECTED": {
      if (!sender.tab) return { ok: false, error: "No sender tab" };
      const state = await getState();
      if (!state.isCapturing) return { ok: true, ignored: true };
      await storeCapture(message.data);
      const records = await getRecords();
      return { ok: true, count: records.length };
    }
    case "EXPORT_CSV": {
      return await exportCsv();
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

async function storeCapture(data) {
  const state = await getState();
  const records = await getRecords();
  records.push({
    id: `capture_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    sessionId: state.sessionId || makeSessionId(),
    ...data
  });
  await setRecords(records);
}

// Inject content script + turn on scroll-capture in a tab.
async function armTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    return { ok: false, error: "Only http/https webpages can be captured" };
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }).catch(() => null);
  const response = await chrome.tabs.sendMessage(tabId, { type: "SET_CAPTURE_MODE", enabled: true })
    .catch((error) => ({ ok: false, error: error.message }));
  return response || { ok: false, error: "No response from page" };
}

async function armActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab found" };
  return await armTab(tab.id);
}

async function disarmActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: "SET_CAPTURE_MODE", enabled: false }).catch(() => null);
}

// ---- Exports (data: URLs — MV3 service workers can't use createObjectURL) ----

async function exportCsv() {
  const records = await getRecords();
  if (!records.length) return { ok: false, error: "No captures yet. Start, scroll a group, then Pause." };

  const listings = extractListings(records);
  if (!listings.length) return { ok: false, error: "Captured pages contained no parseable posts." };

  const header = Object.keys(listings[0]);
  const rows = [header, ...listings.map((l) => header.map((k) => l[k]))];
  const csv = "﻿" + toCsv(rows); // BOM so Excel reads ₹/Unicode correctly

  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const filename = `roost_listings_${stamp}.csv`;
  await chrome.downloads.download({
    url: "data:text/csv;charset=utf-8," + encodeURIComponent(csv),
    filename,
    saveAs: false
  });
  return { ok: true, filename, listings: listings.length };
}

async function exportJson() {
  const state = await getState();
  const records = await getRecords();
  if (!records.length) return { ok: false, error: "No records to export" };

  const data = {
    exportedAt: new Date().toISOString(),
    session: state,
    count: records.length,
    records
  };
  const filename = `${state.sessionId || "capture_session"}.json`;
  await chrome.downloads.download({
    url: "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2)),
    filename,
    saveAs: false
  });
  return { ok: true, filename };
}

function toCsv(rows) {
  return rows.map(row => row.map(cell => {
    const value = cell == null ? "" : String(cell);
    return `"${value.replaceAll('"', '""')}"`;
  }).join(",")).join("\n");
}
