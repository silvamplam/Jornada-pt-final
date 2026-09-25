// Pipe into agent-browser eval --stdin after opening /?delay=1 on the loopback fixture.
(async () => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  for (const image of document.images) image.scrollIntoView();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const before = await (await fetch("/fixture-stats")).json();
  const rows = (id) => before.filter((entry) => entry.path.includes(`-${id}.jpg`) || (id === "external" && entry.path === "/external.jpg"));
  for (const id of ["compact", "card", "large"]) {
    const image = document.getElementById(id);
    check(image.naturalWidth > 0, `${id} did not load`);
    check(rows(id).length === 1 && rows(id)[0].path.includes("/previews/v1/"), `${id} fetched an original or duplicate`);
  }
  check(rows("compact")[0].path.endsWith("/w320.webp"), "compact variant");
  check(rows("card")[0].path.endsWith(devicePixelRatio === 1 ? "/w320.webp" : "/w640.webp"), "card variant");
  check(rows("large")[0].path.endsWith(devicePixelRatio === 1 ? "/w960.webp" : "/w1280.webp"), "large variant");
  for (const id of ["missing", "broken"]) {
    const image = document.getElementById(id);
    check(rows(id).length === 2, `${id} must try one derivative and one original`);
    check(rows(id).filter((entry) => entry.path.includes("/previews/")).length === 1, `${id} retried a derivative`);
    check(!image.hasAttribute("srcset") && !image.hasAttribute("sizes"), `${id} retained candidates`);
  }
  check(document.getElementById("missing").naturalWidth > 0, "fallback before hydration did not recover");
  check(window.originalFailures === 1, "original failure handler must run once");
  check(rows("external").length === 1 && !document.getElementById("external").hasAttribute("srcset"), "external changed");
  window.rerender();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const after = await (await fetch("/fixture-stats")).json();
  check(JSON.stringify(before) === JSON.stringify(after), "rerender caused a loop or extra image request");
  check(window.__consoleErrors.length === 0, "React/hydration errors");
  return { pass: true, dpr: devicePixelRatio, requests: after, originalFailures: window.originalFailures };
})()
