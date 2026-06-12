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

  // FB shows relative/short timestamps in the feed ("1m", "2 hrs", "9 June at 22:19").
  // Parse to ISO. Returns "" if unparseable — exact times are best-effort by design.
  function parseFbTimestamp(text, now = new Date()) {
    if (!text) return "";
    const t = text.trim();

    let m = t.match(/^(\d+)\s*(m|min|mins|minute|minutes)$/i);
    if (m) return new Date(now - m[1] * 60e3).toISOString();
    m = t.match(/^(\d+)\s*(h|hr|hrs|hour|hours)$/i);
    if (m) return new Date(now - m[1] * 3600e3).toISOString();
    m = t.match(/^(\d+)\s*(d|day|days)$/i);
    if (m) return new Date(now - m[1] * 86400e3).toISOString();
    m = t.match(/^(\d+)\s*(w|week|weeks)$/i);
    if (m) return new Date(now - m[1] * 7 * 86400e3).toISOString();

    // "Yesterday at 22:19"
    m = t.match(/^yesterday(?:\s+at\s+(\d{1,2}):(\d{2}))?$/i);
    if (m) {
      const d = new Date(now - 86400e3);
      if (m[1]) d.setHours(+m[1], +m[2], 0, 0);
      return d.toISOString();
    }

    // "9 June at 22:19" / "9 June" / "June 9 at 10:15" (assume current year;
    // if that lands in the future, roll back a year)
    const months = "january february march april may june july august september october november december".split(" ");
    m = t.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+at\s+(\d{1,2}):(\d{2}))?$/) ||
        t.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+at\s+(\d{1,2}):(\d{2}))?$/);
    if (m) {
      const day = /^\d/.test(m[1]) ? +m[1] : +m[2];
      const monName = (/^\d/.test(m[1]) ? m[2] : m[1]).toLowerCase();
      const mon = months.findIndex((x) => x.startsWith(monName.slice(0, 3)));
      if (mon >= 0 && day >= 1 && day <= 31) {
        const d = new Date(now);
        d.setMonth(mon, day);
        d.setHours(m[3] ? +m[3] : 12, m[4] ? +m[4] : 0, 0, 0);
        if (d > now) d.setFullYear(d.getFullYear() - 1);
        return d.toISOString();
      }
    }
    return "";
  }

  // The post permalink is the anchor whose TEXT is the timestamp ("1m", "9 June at 22:19").
  // Grabbing "first link in article" (old behavior) returns shared links / comment
  // anchors and caused URL↔post mismatches.
  function getPermalinkAndDate(article) {
    const anchors = [...article.querySelectorAll("a[href]")];
    for (const a of anchors) {
      const href = a.href || "";
      if (!/\/posts\/|\/permalink\/|story_fbid=|multi_permalinks=/.test(href)) continue;
      const label = (a.getAttribute("aria-label") || a.innerText || "").trim();
      const iso = parseFbTimestamp(label);
      if (iso) return { permalink: href.split("?")[0], postCreatedAt: iso };
    }
    // Fallback: first post-shaped link, no date
    for (const a of anchors) {
      const href = a.href || "";
      if (/\/posts\/|\/permalink\/|story_fbid=/.test(href)) {
        return { permalink: href.split("?")[0], postCreatedAt: "" };
      }
    }
    return { permalink: "", postCreatedAt: "" };
  }

  // Author = first profile link in the post header (bold name link).
  function getAuthor(article) {
    const candidates = [...article.querySelectorAll('h2 a[href], h3 a[href], h4 a[href], strong a[href], a[href*="/user/"]')];
    for (const a of candidates) {
      const name = (a.innerText || "").trim();
      if (name && name.length >= 2 && name.length <= 60 && !/^https?:/.test(name)) return name;
    }
    return "";
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

      const { permalink, postCreatedAt } = getPermalinkAndDate(article);

      sentHashes.add(hash);
      posts.push({
        text,
        images: [...new Set(images)],
        permalink,
        postCreatedAt,
        author: getAuthor(article)
      });
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
