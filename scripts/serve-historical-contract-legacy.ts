// Synthetic, read-only fixture: real components/CSS from origin/main and working tree.
// node_modules/.bin/tsx scripts/serve-historical-contract-legacy.ts
import { build, type Plugin } from "esbuild";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

const port = 3147;
const output = path.resolve("out/historical-contract-legacy");
const entry = "scripts/fixtures/historical-contract-legacy.tsx";
const pagePath = "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx";
const cases = ["dynamic-title", "dynamic-empty", "legacy", "columns", "tiered", "video", "balanced", "secondary", "live-control", "generic-panel"];
const require = createRequire(path.join(output, "fixture.cjs"));

async function version(baseline: boolean) {
  const contents = new Map<string, string>();
  const source = (file: string) => {
    if (!contents.has(file)) contents.set(file, baseline
      ? execFileSync("git", ["show", `origin/main:${file}`], { encoding: "utf8", windowsHide: true })
      : readFileSync(file, "utf8"));
    return contents.get(file)!;
  };
  const plugin: Plugin = { name: "main-baseline", setup(builder) {
    builder.onLoad({ filter: /\.(?:tsx?|css)$/ }, (args) => {
      const relative = path.relative(process.cwd(), args.path).replaceAll("\\", "/");
      if (!/^(?:components|lib)\//.test(relative)) return;
      return { contents: source(relative), loader: relative.endsWith(".css") ? "local-css" : relative.endsWith(".tsx") ? "tsx" : "ts" };
    });
  } };
  const options = { bundle: true, write: false as const, jsx: "automatic" as const, plugins: [plugin],
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""' } };
  const server = await build({ ...options, entryPoints: [entry], outfile: path.join(output, "server.cjs"), platform: "node", packages: "external" });
  const module = { exports: {} as { default: React.ComponentType<{ caseName: string }> } };
  new Function("require", "module", "exports", server.outputFiles.find((file) => file.path.endsWith(".cjs"))!.text)(require, module, module.exports);
  const client = await build({ ...options, outfile: path.join(output, "client.js"), platform: "browser", stdin: {
    resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from "react";
      import { hydrateRoot } from "react-dom/client";
      import Fixture from "./${entry}";
      window.hydrateFixture = () => {
        window.__before = window.measureFixture();
        hydrateRoot(document.getElementById("root"), <Fixture caseName={window.__caseName} />,
          { onRecoverableError: error => window.__errors.push(String(error)) });
        setTimeout(() => { window.__after = window.measureFixture(); window.__hydrated = true; }, 700);
      };
    `,
  } });
  const publicStyles = source(pagePath).match(/const publicMatchdayStyles = `([\s\S]*?)`;/)?.[1];
  if (!publicStyles) throw new Error("Missing public page CSS");
  return { markup: new Map(cases.map((caseName) => [caseName, renderToString(React.createElement(module.exports.default, { caseName }))])),
    css: publicStyles + "\n" + client.outputFiles.find((file) => file.path.endsWith(".css"))!.text,
    script: client.outputFiles.find((file) => file.path.endsWith(".js"))!.text };
}

async function main() {
  mkdirSync(output, { recursive: true });
  const versions = { main: await version(true), branch: await version(false) };
  const image = readFileSync("public/assets/hero-match.png");
  const measurement = readFileSync("scripts/fixtures/historical-contract-measure.browser.js", "utf8");
  for (const [name, value] of Object.entries(versions)) writeFileSync(path.join(output, `${name}-legacy-ssr.html`), value.markup.get("legacy")!);
  createServer((request, response) => {
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const selected = url.searchParams.get("version") === "main" ? "main" : "branch";
    const fixture = versions[selected];
    if (url.pathname === "/fixture.jpg") { response.writeHead(200, { "Content-Type": "image/png" }).end(image); return; }
    if (url.pathname === "/client.js") { response.writeHead(200, { "Content-Type": "text/javascript" }).end(fixture.script); return; }
    if (url.pathname === "/fixture.css") { response.writeHead(200, { "Content-Type": "text/css" }).end(fixture.css); return; }
    if (url.pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const caseName = url.searchParams.get("case") ?? "legacy";
    if (url.pathname !== "/" || !cases.includes(caseName)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html lang="pt"><head>
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Histórica · ${selected} · ${caseName}</title>
      <link rel="stylesheet" href="/fixture.css?version=${selected}">
      <script>window.__errors=[];window.__shifts=[];window.__caseName=${JSON.stringify(caseName)};
        const oldError=console.error;console.error=(...args)=>{window.__errors.push(args.map(String).join(' '));oldError(...args)};
        new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__shifts.push({value:entry.value,time:entry.startTime})}).observe({type:'layout-shift',buffered:true});
      </script></head><body><div id="root">${fixture.markup.get(caseName)}</div>
      <script>${measurement}</script><script src="/client.js?version=${selected}"></script></body></html>`);
  }).listen(port, "127.0.0.1", () => console.log(`Historical contract fixture: http://127.0.0.1:${port}`));
}
void main();
