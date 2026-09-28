// Serve scripts/serve-five-news-column-preview.tsx on 3107 with
// COLUMN_PREVIEW_BASE=21b29b48740a1580aa606f3e37c7dc0bea210302 first.
// Usage: node scripts/verify-five-column-groups-public.cjs <agent-browser> <artifact-dir>
const { execFileSync } = require("node:child_process");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const [browser, output] = process.argv.slice(2);
if (!browser || !output) throw new Error("Supply agent-browser and an artifact directory");
fs.mkdirSync(output, { recursive: true });
function run(...args) {
  const result = JSON.parse(execFileSync(browser, ["--session", "column-groups", ...args, "--json"], { encoding: "utf8", windowsHide: true, timeout: 20000 }));
  if (!result.success) throw new Error(result.error);
  return result.data;
}
const read = code => run("eval", code).result;
function ready() {
  // Full-page comparisons also need lazy images below the viewport decoded.
  read("Promise.race([Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{})})),new Promise(r=>setTimeout(r,2500))])");
}
run("open", "http://127.0.0.1:3107/?group=1&sparse=1&ads=1&before=1");
const results = [];
for (const width of [1440, 1024, 390]) {
  run("set", "viewport", String(width), "1000"); ready();
  const metrics = read(`({width:innerWidth,columns:getComputedStyle(document.querySelector('.public-editorial-column-run')).gridTemplateColumns.split(' ').length,
    overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('.public-column-group-heading').textContent,
    order:[...document.querySelectorAll('.public-five-news-column-heading')].map(x=>x.textContent),images:document.images.length,
    frames:document.querySelectorAll('[data-public-editorial-section-frame]').length,adsInside:document.querySelector('.public-editorial-column-run').querySelectorAll('aside').length,
    positions:[...document.querySelectorAll('.public-five-news-column')].map(z=>[...z.querySelectorAll('[data-column-position]')].map(x=>x.dataset.columnPosition))})`);
  assert.equal(metrics.columns, width === 1440 ? 5 : width === 1024 ? 3 : 1);
  assert.equal(metrics.overflow, false); assert.equal(metrics.adsInside, 0);
  assert.equal(metrics.images, 3); assert.equal(metrics.frames, 1); assert.deepEqual(metrics.positions[1], ["2", "5"]);
  run("screenshot", "--full", path.join(output, `public-group-${width}.png`)); results.push(metrics);
  console.log(`PASS group ${width}: ${metrics.columns} columns, no overflow/ad inside, sparse positions retained`);
}
const equivalent = [];
for (const family of ["six_news", "five_news_balanced", "five_news_secondary", "six_news_1_2_3", "five_news_column"]) {
  for (const width of [1440, 1024, 390]) {
    run("set", "viewport", String(width), "1000");
    const url = `http://127.0.0.1:3107/?family=${family}&count=${family === "five_news_column" ? 5 : 1}`;
    let before;
    for (const mode of ["before", "after"]) {
      run("open", url + (mode === "before" ? "&baseline=1" : "")); ready();
      const file = path.join(output, `regression-${family}-${width}-${mode}.png`);
      run("screenshot", "--full", file);
      if (mode === "before") before = fs.readFileSync(file);
      else assert.deepEqual(fs.readFileSync(file), before, `${family} at ${width}`);
    }
    equivalent.push({ family, width, pngByteEquivalent: true });
    console.log(`PASS unchanged ${family} ${width}: PNG byte-equivalent to main`);
  }
}
fs.writeFileSync(path.join(output, "public-browser-results.json"), JSON.stringify({ results, equivalent }, null, 2));
