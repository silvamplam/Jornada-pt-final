// Usage: node scripts/verify-historical-contract-legacy.cjs <agent-browser executable>
// Requires scripts/serve-historical-contract-legacy.ts. No remote requests or writes.
const { execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const browser = process.argv[2];
if (!browser) throw new Error("Supply the agent-browser executable");
const saved = process.argv.includes("--saved");
const output = path.resolve("out/historical-contract-legacy");
mkdirSync(output, { recursive: true });
const cases = ["dynamic-title", "dynamic-empty", "legacy", "columns", "tiered", "video", "balanced", "secondary", "live-control", "generic-panel"];
function run(...args) {
  const result = JSON.parse(execFileSync(browser, ["--session", "historical-contract-legacy", ...args, "--json"],
    { encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 }));
  if (!result.success) throw new Error(`${args[0]}: ${result.error}`);
  return result.data;
}
const read = (code) => run("eval", code).result;
const results = [];
const failures = [];
function check(label, operation) {
  try { operation(); } catch (error) { failures.push({ label, message: error.message.slice(0, 1200) }); }
}
for (const width of [1440, 1024, 760, 390]) {
  if (!saved) run("set", "viewport", String(width), "1000");
  for (const caseName of cases) {
    const pair = {};
    for (const version of ["main", "branch"]) {
      let evidence;
      if (saved) {
        evidence = JSON.parse(readFileSync(path.join(output, `${version}-${caseName}-${width}.json`), "utf8"));
      } else {
      run("open", `http://127.0.0.1:3147/?case=${caseName}&version=${version}`);
      read("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))).then(()=>true)");
      read("window.hydrateFixture(); true");
      read("new Promise(resolve=>{const timer=setInterval(()=>{if(window.__hydrated){clearInterval(timer);resolve(true)}},50)})");
      evidence = read("({before:window.__before,after:window.__after,final:window.measureFixture(),errors:window.__errors,shifts:window.__shifts})");
      }
      pair[version] = evidence;
      writeFileSync(path.join(output, `${version}-${caseName}-${width}.json`), JSON.stringify(evidence, null, 2));
      check(`${version}/${caseName}/${width}: hydration`, () => assert.deepEqual(evidence.after.geometry, evidence.before.geometry));
      check(`${version}/${caseName}/${width}: console`, () => assert.deepEqual(evidence.errors, []));
      check(`${version}/${caseName}/${width}: CLS`, () => assert.equal(evidence.final.cls, 0));
      check(`${version}/${caseName}/${width}: overflow`, () => {
        assert.equal(evidence.final.overflow, false);
        assert.deepEqual(evidence.final.overflowingElements, []);
      });
      if (!saved && version === "branch" && !["live-control", "generic-panel"].includes(caseName)) {
        run("screenshot", path.join(output, `${version}-${caseName}-${width}.png`));
      }
      if (!saved && caseName === "legacy") {
        for (const [name, selector] of [["analysis", ".composition-interpretive-analysis"], ["other-games", ".composition-interpretive-other-games"], ["posterior", ".public-beyond-matchday"]]) {
          read(`window.scrollTo(0, document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top + scrollY - 48); true`);
          run("screenshot", path.join(output, `${version}-legacy-${name}-${width}.png`));
        }
      }
    }
    const before = pair.main.final, after = pair.branch.final;
    check(`${caseName}/${width}: envelope`, () => {
      assert.equal(after.envelope.width, before.envelope.width);
      assert.ok(after.envelope.width <= 1200);
      if (width === 1440) assert.equal(after.envelope.width, 1200);
    });
    check(`${caseName}/${width}: preserved geometry`, () => {
      if (caseName === "legacy") assert.deepEqual(after.subgrids, before.subgrids);
      else assert.deepEqual(after.geometry, before.geometry);
    });
    if (caseName === "legacy") check(`legacy/${width}: 12/1/24 and padding`, () => {
      assert.equal(after.boundaries.length, 3);
      for (const boundary of after.boundaries) {
        assert.ok(Math.abs(boundary.titleToLine - 12) < .02);
        assert.equal(boundary.lineHeight, 1);
        assert.ok(Math.abs(boundary.lineToContent - 24) < .02);
        assert.equal(boundary.pseudoPosition, "static");
        assert.equal(boundary.headingPadding, "0px");
        assert.equal(boundary.headingBorder, "0px");
        assert.equal(boundary.headingBackground, "rgba(0, 0, 0, 0)");
      }
    });
    if (caseName === "dynamic-empty") check(`untitled/${width}: no ghost header`, () => {
      assert.equal(after.headings, 0);
      assert.equal(after.untitledBoundary.lineHeight, 1);
      // getComputedStyle padding retains more precision than Chromium's used layout pixels.
      assert.ok(Math.abs(after.untitledBoundary.lineToContent - 24) < .02);
    });
    if (caseName === "generic-panel") check(`generic panel/${width}`, () => assert.equal(after.genericPadding, "18px 20px"));
    results.push({ width, caseName, envelope: after.envelope.width, beforeBoundaries: before.boundaries,
      afterBoundaries: after.boundaries, cls: after.cls, hydrationEqual: JSON.stringify(pair.branch.before.geometry) === JSON.stringify(pair.branch.after.geometry),
      geometryEqual: JSON.stringify(caseName === "legacy" ? before.subgrids : before.geometry) === JSON.stringify(caseName === "legacy" ? after.subgrids : after.geometry),
      overflow: after.overflow, errors: pair.branch.errors });
    writeFileSync(path.join(output, "browser-results.json"), JSON.stringify({ results, failures }, null, 2));
    console.log(`${width} ${caseName}: ${failures.length} cumulative failures`);
  }
}
console.log(JSON.stringify({ comparisons: results.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
