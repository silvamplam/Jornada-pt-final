// Measurement belongs only to the test fixture, never to a production renderer.
window.measureFixture = () => {
  const root = document.querySelector("[data-fixture-case]");
  const r = (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  const geometry = (element) => {
    const origin = r(element);
    return [element, ...element.querySelectorAll("*")].filter((e) => !["STYLE", "SCRIPT", "LINK"].includes(e.tagName)).map((e) => {
      const box = r(e);
      const style = getComputedStyle(e);
      return { tag: e.tagName, class: e.className, x: box.x - origin.x, y: box.y - origin.y,
        width: box.width, height: box.height, font: style.font, gap: style.gap, objectFit: style.objectFit };
    });
  };
  const boundaries = [...root.querySelectorAll('[data-public-editorial-flow="single"], .composition-interpretive-preview > .composition-interpretive-section, .public-beyond-matchday:not([data-public-editorial-flow])')].map((flow) => {
    const heading = flow.querySelector(":scope > [data-public-editorial-heading], :scope > .composition-interpretive-section-heading, :scope > .public-beyond-matchday-header");
    if (!heading) return null;
    const content = [...flow.children].find((e) => e !== heading && !["STYLE", "SCRIPT"].includes(e.tagName));
    if (!content) return null;
    const css = getComputedStyle(flow), pseudo = getComputedStyle(flow, "::before"), head = getComputedStyle(heading);
    const box = r(flow), h = r(heading), c = r(content);
    const framed = flow.hasAttribute("data-public-editorial-flow");
    const lineHeight = framed ? parseFloat(pseudo.height) : parseFloat(pseudo.height) || parseFloat(css.borderTopWidth);
    const lineTop = framed ? box.y + parseFloat(css.paddingTop) + parseFloat(css.gridTemplateRows) + (parseFloat(css.rowGap) || 0) + parseFloat(pseudo.marginTop)
      : box.y + (parseFloat(pseudo.top) || 0);
    return { class: flow.className, title: heading.textContent, headingHeight: h.height,
      titleToLine: lineTop - (h.y + h.height), lineHeight, lineToContent: c.y - lineTop - lineHeight,
      lineToTitle: h.y - lineTop, headingPadding: head.padding, headingBorder: head.borderBottomWidth,
      headingBackground: head.backgroundColor, pseudoPosition: pseudo.position, pseudoContent: pseudo.content };
  }).filter(Boolean);
  const subgrids = {};
  for (const selector of [".composition-interpretive-analysis-grid", ".composition-interpretive-other-games-layout", ".public-beyond-matchday-grid"]) {
    const element = root.querySelector(selector);
    if (element) subgrids[selector] = geometry(element);
  }
  const classic = root.querySelector(".public-matchday-panel > header");
  const untitled = [...root.querySelectorAll("[data-public-editorial-section-frame]")].find(e => !e.querySelector("[data-public-editorial-flow]"));
  const untitledContent = untitled && [...untitled.children].find(e => e.tagName !== "STYLE");
  const untitledLineTop = untitled ? r(untitled).y + parseFloat(getComputedStyle(untitled).paddingTop) : 0;
  return { envelope: r(root), overflow: document.documentElement.scrollWidth > innerWidth,
    overflowingElements: [...root.querySelectorAll("*")].filter(e => {const b=r(e); return b.width && (b.x < -0.5 || b.x + b.width > innerWidth + 0.5);}).map(e=>e.className),
    geometry: geometry(root), boundaries, subgrids,
    headings: root.querySelectorAll("h2, header, [data-public-editorial-heading]").length,
    untitledBoundary: untitledContent ? { lineHeight: parseFloat(getComputedStyle(untitled, "::before").height),
      lineToContent: r(untitledContent).y - untitledLineTop - 1 } : null,
    genericPadding: classic ? getComputedStyle(classic).padding : null,
    cls: window.__shifts.reduce((sum, e) => sum + e.value, 0), errors: [...window.__errors] };
};
