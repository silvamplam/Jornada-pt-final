// Loopback-only SSR/hydration fixture. No credentials, production data or network services.
import { createServer } from "node:http";
import { build } from "esbuild";
import React from "react";
import { renderToString } from "react-dom/server";
import PublicEditorialImage from "../components/public/PublicEditorialImage";
import { syntheticEditorialImage } from "./benchmark-editorial-image-previews";
import { generateEditorialImagePreviews } from "../lib/editorial-image-preview-generator.server";
import { editorialPreviewPath, PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "../lib/editorial-image-preview";
import type { PublicEditorialImageSize } from "../lib/public-editorial-image";

async function main() {
  const origin = "http://127.0.0.1:3103";
  process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
  Object.assign(globalThis, { React }); // tsx uses the project's preserve JSX setting.
  const prefix = "/storage/v1/object/public/editorial-images/";
  const path = "editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-fixture.jpg";
  const entries = [
    { id: "compact", imageSize: "thumbnail", width: 86 },
    { id: "card", imageSize: "half", width: 300, loading: "lazy" },
    { id: "large", imageSize: "article", width: 780 },
    { id: "missing", imageSize: "card", width: 220 },
    { id: "broken", imageSize: "card", width: 220 },
    { id: "external", imageSize: "thumbnail", width: 86 },
  ].map((entry) => ({ ...entry, path: path.replace("fixture", entry.id),
    src: entry.id === "external" ? "http://localhost:3103/external.jpg" : origin + prefix + path.replace("fixture", entry.id) }));
  const original = await syntheticEditorialImage();
  const previews = await generateEditorialImagePreviews(original, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
  const assets = new Map<string, { bytes: Buffer; type: string }>();
  for (const entry of entries) {
    if (entry.id !== "broken") assets.set(new URL(entry.src).pathname, { bytes: original, type: "image/jpeg" });
    if (["compact", "card", "large"].includes(entry.id)) for (const preview of previews) {
      assets.set(prefix + editorialPreviewPath(entry.path, preview.width), { bytes: preview.bytes, type: "image/webp" });
    }
  }
  const props = (entry: typeof entries[number]) => ({ id: entry.id, src: entry.src, imageSize: entry.imageSize as PublicEditorialImageSize,
    alt: entry.id, width: entry.width, height: Math.round(entry.width * 2 / 3),
    loading: entry.loading as "lazy" | undefined, style: { objectFit: "cover" as const, objectPosition: "60% 40%" }, "data-editorial-image-framing": "standard" });
  const body = entries.map((entry) => `<section><h2>${entry.id}</h2><div id="root-${entry.id}">${renderToString(React.createElement(PublicEditorialImage, props(entry)))}</div></section>`).join("");
  const bundle = await build({ stdin: { contents: `
    import React from "react";
    import { hydrateRoot } from "react-dom/client";
    import PublicEditorialImage from "./components/public/PublicEditorialImage";
    const entries = ${JSON.stringify(entries.map(props))};
    const roots = entries.map(props => ({ root: hydrateRoot(document.getElementById("root-" + props.id),
      <PublicEditorialImage {...props} onError={() => { window.originalFailures = (window.originalFailures || 0) + 1; }} />), props }));
    window.rerender = () => roots.forEach(({root, props}) => root.render(<PublicEditorialImage {...props}
      onError={() => { window.originalFailures = (window.originalFailures || 0) + 1; }} />));
    window.hydrated = true;
  `, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic",
    define: { "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(origin), "process.env.NODE_ENV": '"production"' } });
  const requests: { path: string; status: number; bytes: number }[] = [];
  const layoutBundles = await Promise.all([false, true].map(async (baseline) => build({
    entryPoints: ["scripts/fixtures/public-editorial-layouts.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic",
    define: { "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(origin), "process.env.NODE_ENV": '"production"' },
    plugins: baseline ? [{ name: "canonical-img-baseline", setup(plugin) {
      plugin.onLoad({ filter: /PublicEditorialImage\.tsx$/ }, () => ({ loader: "tsx", contents:
        'import React from "react"; export default function Image({ imageSize, ...props }) { return <img {...props} />; }' }));
    } }] : [],
  })));
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", origin);
    if (url.pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    if (url.pathname === "/fixture-stats") { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(requests)); return; }
    if (url.pathname === "/layouts") {
      response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html><head><title>A3 layout fixture</title></head>
        <body style="margin:16px"><div id="root"></div><script>window.__consoleErrors=[];const old=console.error;console.error=(...args)=>{window.__consoleErrors.push(args.map(String).join(' '));old(...args)};</script>
        <script src="/layouts.js?base=${url.searchParams.get("base") === "1" ? 1 : 0}"></script></body></html>`); return;
    }
    if (url.pathname === "/layouts.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" }).end(layoutBundles[url.searchParams.get("base") === "1" ? 1 : 0].outputFiles[0].contents); return;
    }
    if (url.pathname === "/") {
      requests.length = 0;
      response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html><head><title>A3 local SSR fixture</title>
        <style>body{font-family:system-ui;margin:16px;color:#182230}section{display:inline-grid;vertical-align:top;margin:10px}img{display:block;background:#eee;max-width:100%}h2{font-size:16px}</style></head><body>
        <h1>A3 synthetic editorial images</h1><button onclick="window.rerender()">Rerender</button>${body}
        <script>window.__consoleErrors=[];const oldError=console.error;console.error=(...args)=>{window.__consoleErrors.push(args.map(String).join(' '));oldError(...args)};</script>
        <script src="/bundle.js?delay=${url.searchParams.get("delay") === "1" ? 1500 : 0}"></script></body></html>`); return;
    }
    if (url.pathname === "/bundle.js") {
      setTimeout(() => response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents), Number(url.searchParams.get("delay"))); return;
    }
    const asset = assets.get(url.pathname);
    requests.push({ path: url.pathname, status: asset ? 200 : 404, bytes: asset?.bytes.length ?? 0 });
    if (asset) response.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-store" }).end(asset.bytes);
    else response.writeHead(404).end();
  }).listen(3103, "127.0.0.1", () => console.log("A3 SSR fixture ready at " + origin));
}
void main();
