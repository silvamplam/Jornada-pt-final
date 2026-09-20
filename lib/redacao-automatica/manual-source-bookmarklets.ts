export const JORNADA_MANUAL_SOURCE_MESSAGE = "JORNADA_MANUAL_SOURCE_V1";
export const JORNADA_MANUAL_IMAGE_MESSAGE = "JORNADA_MANUAL_IMAGE_V1";
export const JORNADA_MANUAL_SOURCE_HELLO = "JORNADA_MANUAL_SOURCE_HELLO_V1";
export const JORNADA_MANUAL_SOURCE_READY = "JORNADA_MANUAL_SOURCE_READY_V1";
export const JORNADA_MANUAL_SOURCE_WINDOW = "JORNADA_MANUAL_SOURCE";

function manualSourceBookmarkletRuntime() {
  var mesaOrigins = ["https://www.jornada.pt", "https://jornada.pt"];
  var mesaUrl = mesaOrigins[0] + "/admin/editorial/redacao-automatica/mesa?manual_source=1";
  var windowName = "JORNADA_MANUAL_SOURCE";

  function cleanText(value: unknown) {
    return String(value || "").replace(/\r\n?/g, "\n").split(/\n+/)
      .map(function (line) { return line.trim().replace(/\s+/g, " "); })
      .filter(Boolean).join("\n\n");
  }

  function absoluteHttpUrl(value: unknown) {
    try {
      var candidate = String(value || "").trim();
      if (!candidate) return "";
      var url = new URL(candidate, document.baseURI);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function usefulParagraphs(root: Element) {
    var paragraphs = Array.prototype.slice.call(root.querySelectorAll("p")).filter(function (paragraph: Element) {
      return !paragraph.closest("nav,header,footer,aside,script,style,noscript,[aria-hidden='true']");
    }).map(function (paragraph: Element) { return cleanText(paragraph.textContent); }).filter(function (text: string) {
      return text.length >= 20;
    });
    if (paragraphs.length) return paragraphs;
    var fallback = cleanText(root.textContent);
    return fallback.length >= 80 ? [fallback] : [];
  }

  function articleCandidate(): { root: Element; paragraphs: string[]; score: number } | null {
    var selectors = [
      "[itemprop='articleBody']",
      "article",
      "main",
      "[role='main']",
      "section[class*='article']",
      "div[class*='article']",
      "section[class*='content']",
      "div[class*='content']",
    ];
    var roots = Array.prototype.slice.call(document.querySelectorAll(selectors.join(",")));
    var best: { root: Element; paragraphs: string[]; score: number } | null = null;
    roots.forEach(function (root: Element) {
      if (root.closest("nav,header,footer,aside")) return;
      var paragraphs = usefulParagraphs(root);
      var usefulLength = paragraphs.join(" ").length;
      if (usefulLength < 80) return;
      var allLength = cleanText((root as HTMLElement).innerText || root.textContent).length || usefulLength;
      var density = Math.min(1, usefulLength / Math.max(1, allLength));
      var score = usefulLength * (0.6 + density) + paragraphs.length * 100;
      if (!best || score > best.score) best = { root: root, paragraphs: paragraphs, score: score };
    });
    return best;
  }

  function imageFrom(root: Element | null) {
    var images = Array.prototype.slice.call((root || document).querySelectorAll("img"));
    var bestUrl = "";
    var bestScore = -1;
    images.forEach(function (image: HTMLImageElement) {
      var url = absoluteHttpUrl(image.currentSrc)
        || absoluteHttpUrl(image.src)
        || absoluteHttpUrl(image.getAttribute("src"));
      if (!url) return;
      var width = Number(image.naturalWidth || image.width || 0);
      var height = Number(image.naturalHeight || image.height || 0);
      var score = width * height;
      if (width >= 300 && height >= 160) score += 1000000;
      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    });
    return bestUrl;
  }

  function extractedImage(root: Element | null) {
    var meta = document.querySelector("meta[property='og:image'],meta[name='twitter:image'],meta[property='twitter:image']");
    return absoluteHttpUrl(meta && meta.getAttribute("content")) || imageFrom(root) || imageFrom(null);
  }

  function dateOnly(value: unknown) {
    if (typeof value !== "string") return "";
    var match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var checked = new Date(Date.UTC(year, month - 1, day));
    return checked.getUTCFullYear() === year && checked.getUTCMonth() === month - 1 && checked.getUTCDate() === day
      ? match[1] + "-" + match[2] + "-" + match[3]
      : "";
  }

  function jsonLdDate(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    if (Array.isArray(value)) {
      for (var index = 0; index < value.length; index += 1) {
        var nestedArrayDate = jsonLdDate(value[index]);
        if (nestedArrayDate) return nestedArrayDate;
      }
      return "";
    }
    var record = value as Record<string, unknown>;
    var direct = dateOnly(record.datePublished);
    if (direct) return direct;
    var keys = Object.keys(record);
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var nestedDate = jsonLdDate(record[keys[keyIndex]]);
      if (nestedDate) return nestedDate;
    }
    return "";
  }

  function extractedDate() {
    var scripts = Array.prototype.slice.call(document.querySelectorAll("script[type='application/ld+json']"));
    for (var index = 0; index < scripts.length; index += 1) {
      try {
        var fromJson = jsonLdDate(JSON.parse(scripts[index].textContent || ""));
        if (fromJson) return fromJson;
      } catch (_) { /* best effort */ }
    }
    var meta = document.querySelector([
      "meta[property='article:published_time']",
      "meta[name='article:published_time']",
      "meta[name='datePublished']",
      "meta[itemprop='datePublished']",
    ].join(","));
    var fromMeta = dateOnly(meta && meta.getAttribute("content"));
    if (fromMeta) return fromMeta;
    var time = document.querySelector("time[datetime]");
    return dateOnly(time && time.getAttribute("datetime"));
  }

  function sendToMesa(payload: Record<string, unknown>) {
    var target = window.open("", windowName);
    if (!target) {
      window.alert("O browser bloqueou a abertura da Mesa da Redação.");
      return;
    }
    var mesaWindow = target;
    try {
      if (mesaWindow.location.href === "about:blank") mesaWindow.location.href = mesaUrl;
    } catch (_) { /* an existing cross-origin Mesa must not be reloaded */ }
    target.focus();

    var finished = false;
    var attempts = 0;
    var timer = 0;
    function cleanup() {
      window.removeEventListener("message", onMessage);
      if (timer) window.clearInterval(timer);
    }
    function onMessage(event: MessageEvent) {
      var data = event.data;
      if (
        mesaOrigins.indexOf(event.origin) < 0
        || event.source !== mesaWindow
        || !data
        || data.type !== "JORNADA_MANUAL_SOURCE_READY_V1"
        || data.version !== 1
      ) return;
      finished = true;
      mesaWindow.postMessage(payload, event.origin);
      cleanup();
    }
    function hello() {
      if (finished || mesaWindow.closed || attempts >= 50) {
        cleanup();
        return;
      }
      attempts += 1;
      mesaOrigins.forEach(function (origin) {
        mesaWindow.postMessage({ type: "JORNADA_MANUAL_SOURCE_HELLO_V1", version: 1 }, origin);
      });
    }
    window.addEventListener("message", onMessage);
    hello();
    timer = window.setInterval(hello, 300);
  }

  var selected = cleanText(window.getSelection && window.getSelection()?.toString());
  var candidate = selected ? null : articleCandidate();
  var body = selected || (candidate ? candidate.paragraphs.join("\n\n") : "");
  var imageUrl = extractedImage(candidate ? candidate.root : null);
  sendToMesa({
    type: "JORNADA_MANUAL_SOURCE_V1",
    version: 1,
    body: body,
    imageUrl: imageUrl,
    publishedDate: extractedDate(),
    sourceUrl: absoluteHttpUrl(location.href),
    sourcePageTitle: cleanText(document.title).slice(0, 500),
    sourceHost: location.hostname,
  });
}

function manualImageBookmarkletRuntime() {
  var mesaOrigins = ["https://www.jornada.pt", "https://jornada.pt"];
  var mesaUrl = mesaOrigins[0] + "/admin/editorial/redacao-automatica/mesa?manual_source=1";
  var windowName = "JORNADA_MANUAL_SOURCE";

  function absoluteHttpUrl(value: unknown) {
    try {
      var candidate = String(value || "").trim();
      if (!candidate) return "";
      var url = new URL(candidate, document.baseURI);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function sendToMesa(imageUrl: string) {
    var target = window.open("", windowName);
    if (!target) {
      window.alert("O browser bloqueou a abertura da Mesa da Redação.");
      return;
    }
    var mesaWindow = target;
    try {
      if (mesaWindow.location.href === "about:blank") mesaWindow.location.href = mesaUrl;
    } catch (_) { /* reuse the existing Mesa without reloading its form */ }
    target.focus();
    var finished = false;
    var attempts = 0;
    var timer = 0;
    function cleanup() {
      window.removeEventListener("message", onMessage);
      if (timer) window.clearInterval(timer);
    }
    function onMessage(event: MessageEvent) {
      var data = event.data;
      if (
        mesaOrigins.indexOf(event.origin) < 0
        || event.source !== mesaWindow
        || !data
        || data.type !== "JORNADA_MANUAL_SOURCE_READY_V1"
        || data.version !== 1
      ) return;
      finished = true;
      mesaWindow.postMessage({
        type: "JORNADA_MANUAL_IMAGE_V1",
        version: 1,
        imageUrl: imageUrl,
      }, event.origin);
      cleanup();
    }
    function hello() {
      if (finished || mesaWindow.closed || attempts >= 50) {
        cleanup();
        return;
      }
      attempts += 1;
      mesaOrigins.forEach(function (origin) {
        mesaWindow.postMessage({ type: "JORNADA_MANUAL_SOURCE_HELLO_V1", version: 1 }, origin);
      });
    }
    window.addEventListener("message", onMessage);
    hello();
    timer = window.setInterval(hello, 300);
  }

  function imageUrl(image: HTMLImageElement) {
    return absoluteHttpUrl(image.currentSrc)
      || absoluteHttpUrl(image.src)
      || absoluteHttpUrl(image.getAttribute("src"));
  }

  var images = Array.prototype.slice.call(document.images || []);
  var imageDocument = String(document.contentType || "").toLowerCase().indexOf("image/") === 0;
  var directImage = imageDocument
    || (images.length === 1 && String(document.body && document.body.innerText || "").trim() === "");
  if (directImage) {
    var directUrl = images[0] ? imageUrl(images[0]) : "";
    if (!directUrl && imageDocument) directUrl = absoluteHttpUrl(location.href);
    if (!directUrl) window.alert("A imagem não tem um URL http/https válido.");
    else sendToMesa(directUrl);
    return;
  }

  if (!images.length) {
    window.alert("Não foram encontradas imagens nesta página.");
    return;
  }

  var banner = document.createElement("div");
  banner.textContent = "Clique na imagem que quer enviar para a Jornada · Esc para cancelar";
  banner.setAttribute("data-jornada-image-picker", "true");
  banner.style.cssText = "position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);padding:9px 13px;border-radius:7px;background:#173f28;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.28);pointer-events:none";
  (document.body || document.documentElement).appendChild(banner);
  var hovered: HTMLImageElement | null = null;
  var previousOutline = "";
  var previousOffset = "";

  function restoreOutline() {
    if (!hovered) return;
    hovered.style.outline = previousOutline;
    hovered.style.outlineOffset = previousOffset;
    hovered = null;
  }
  function cleanup() {
    restoreOutline();
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    banner.remove();
  }
  function targetImage(event: Event): HTMLImageElement | null {
    var target = event.target as Element | null;
    return target && typeof target.closest === "function"
      ? target.closest("img") as HTMLImageElement | null
      : null;
  }
  function onMouseOver(event: Event) {
    var image = targetImage(event);
    if (!image || image === hovered) return;
    restoreOutline();
    hovered = image;
    previousOutline = image.style.outline;
    previousOffset = image.style.outlineOffset;
    image.style.outline = "3px solid #2c9b57";
    image.style.outlineOffset = "2px";
  }
  function onMouseOut(event: Event) {
    if (targetImage(event) === hovered) restoreOutline();
  }
  function onClick(event: Event) {
    var image = targetImage(event);
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    var selectedUrl = imageUrl(image);
    cleanup();
    if (!selectedUrl) window.alert("A imagem não tem um URL http/https válido.");
    else sendToMesa(selectedUrl);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cleanup();
  }
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

export const SEND_TO_JORNADA_BOOKMARKLET =
  `javascript:(()=>{var __name=function(value){return value};(${manualSourceBookmarkletRuntime.toString()})()})()`;
export const SEND_IMAGE_TO_JORNADA_BOOKMARKLET =
  `javascript:(()=>{var __name=function(value){return value};(${manualImageBookmarkletRuntime.toString()})()})()`;
