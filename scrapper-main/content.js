(() => {
  function getVisibleText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue.trim();
        if (!text) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const parts = [];
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue.trim());
    return [...new Set(parts)].join("\n");
  }

  function getMeta() {
    return [...document.querySelectorAll("meta")].map((m) => ({
      name: m.getAttribute("name"),
      property: m.getAttribute("property"),
      content: m.getAttribute("content")
    })).filter(m => m.name || m.property || m.content);
  }

  function getImages() {
    return [...document.images].map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.alt || "",
      width: img.naturalWidth || img.width || null,
      height: img.naturalHeight || img.height || null
    })).filter(img => img.src);
  }

  function collectArtifacts() {
    return {
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      visibleText: getVisibleText(),
      bodyInnerText: document.body ? document.body.innerText : "",
      htmlSnapshot: document.documentElement.outerHTML,
      imageUrls: getImages(),
      meta: getMeta(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        devicePixelRatio: window.devicePixelRatio
      }
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "COLLECT_ARTIFACTS") {
      try {
        sendResponse({ ok: true, data: collectArtifacts() });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    }
    return true;
  });
})();
