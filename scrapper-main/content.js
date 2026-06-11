(() => {
  // Guard: script may be injected more than once.
  if (window.__roostCollector) return;
  window.__roostCollector = true;

  let captureMode = false;
  let scrollTimer = null;
  const sentHashes = new Set(); // don't resend posts already pushed this page-visit

  function postHash(text) {
    let hash = 0;
    const s = text.replace(/\s+/g, " ").slice(0, 400);
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    return hash.toString(36);
  }

  // FB feed posts live in div[role="article"]. Each becomes one record.
  // Passive DOM read only — no clicks, no auto-scroll, no requests.
  function getPosts() {
    const articles = [...document.querySelectorAll('div[role="article"]')];
    const posts = [];

    for (const article of articles) {
      const text = (article.innerText || "").trim();
      if (text.length < 40) continue; // UI noise / stubs

      const hash = postHash(text);
      if (sentHashes.has(hash)) continue;

      // Content photos only (skip emoji, icons, profile pics)
      const images = [...article.querySelectorAll("img")]
        .map((img) => ({
          src: img.currentSrc || img.src,
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0
        }))
        .filter((img) =>
          img.src &&
          !img.src.includes("emoji") &&
          !img.src.includes("static") &&
          img.width >= 100 && img.height >= 100
        )
        .map((img) => img.src);

      let permalink = "";
      for (const a of article.querySelectorAll("a[href]")) {
        const href = a.href || "";
        if (href.includes("/posts/") || href.includes("/permalink/") || href.includes("story_fbid=")) {
          permalink = href.split("?")[0];
          break;
        }
      }

      sentHashes.add(hash);
      posts.push({ text, images: [...new Set(images)], permalink });
    }

    return posts;
  }

  function collectAndSend() {
    const posts = getPosts();
    if (!posts.length) return;
    chrome.runtime.sendMessage({
      type: "POSTS_COLLECTED",
      data: {
        url: location.href,
        title: document.title,
        capturedAt: new Date().toISOString(),
        posts
      }
    }).catch(() => {});
  }

  function onScroll() {
    if (!captureMode) return;
    clearTimeout(scrollTimer);
    // Collect 1.5s after scrolling settles — new posts have rendered by then.
    scrollTimer = setTimeout(collectAndSend, 1500);
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SET_CAPTURE_MODE") {
      captureMode = !!message.enabled;
      if (captureMode) collectAndSend(); // grab whatever is on screen right now
      sendResponse({ ok: true, captureMode });
    }
    if (message.type === "COLLECT_ARTIFACTS") {
      try {
        collectAndSend();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    }
    return true;
  });
})();
