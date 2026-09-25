// Open /layouts?base=1 then /layouts at the same viewport, run this in each page.
// Baseline uses canonical img elements; A3 uses the actual responsive component.
(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  window.scrollTo(0, 0);
  const current = Array.from(document.querySelectorAll("main img, main article, main h1, main h2, main h3, main a")).map((element) => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { tag: element.tagName, cls: element.className, text: element.tagName === "IMG" ? "" : element.textContent,
      x: rect.x, y: rect.y, w: rect.width, h: rect.height, fit: style.objectFit, position: style.objectPosition,
      frame: element.getAttribute("data-editorial-image-framing") };
  });
  if (window.__consoleErrors.length || !Array.from(document.images).every((image) => image.naturalWidth > 0)) throw new Error("Image or console failure");
  const key = "a3-layout-baseline-" + innerWidth;
  const baseline = new URL(location.href).searchParams.get("base") === "1";
  if (baseline) sessionStorage.setItem(key, JSON.stringify(current));
  else if (sessionStorage.getItem(key) !== JSON.stringify(current)) throw new Error("Geometry/content/framing differs from baseline");
  return { pass: true, baseline, viewport: innerWidth, elements: current.length, images: document.images.length };
})()
