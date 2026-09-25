// Isolated browser fixture: no application auth, credentials or external requests.
// Uses the esbuild already installed with tsx; serves synthetic assets on loopback.
import { createServer } from "node:http";
import { build } from "esbuild";
import { syntheticEditorialImage } from "./benchmark-editorial-image-previews";
import { generateEditorialImagePreviews } from "../lib/editorial-image-preview-generator.server";
import { editorialPreviewPath } from "../lib/editorial-image-preview";

async function main() {
  const origin = "http://127.0.0.1:3102";
  const prefix = "/storage/v1/object/public/editorial-images/";
  const path = "editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-fixture.jpg";
  const cases = [
    { id: "compact", path, width: 320 },
    { id: "fluid", path: path.replace("fixture", "fluid"), width: 640 },
    { id: "missing", path: path.replace("fixture", "missing"), width: 320 },
    { id: "broken", path: path.replace("fixture", "broken"), width: 320 },
    { id: "external", path: "external.jpg", width: 320 },
  ];
  const original = await syntheticEditorialImage(1200, 800);
  const previews = await generateEditorialImagePreviews(original);
  const assets = new Map<string, { bytes: Buffer; type: string }>();
  for (const item of cases) {
    if (item.id !== "broken") assets.set(item.id === "external" ? "/external.jpg" : prefix + item.path, { bytes: original, type: "image/jpeg" });
    if (["compact", "fluid"].includes(item.id)) assets.set(prefix + editorialPreviewPath(item.path, item.width as 320 | 640),
      { bytes: previews.find((preview) => preview.width === item.width)!.bytes, type: "image/webp" });
  }
  const entries = cases.map((item) => ({ ...item, src: origin + (item.id === "external" ? "/" : prefix) + item.path }));
  const bundle = await build({
    stdin: {
      contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import BackofficeImage from "./components/admin/BackofficeImage";
        const entries = ${JSON.stringify(entries)};
        function Fixture() {
          const [count, setCount] = useState(0);
          const [selected, setSelected] = useState("");
          return <main><h1>A2 — synthetic preview fixture</h1>
            <button id="rerender" onClick={() => setCount(count + 1)}>Rerender {count}</button>
            <output id="selection">{selected}</output>
            <div className="cards">{entries.map(item => <label key={item.id} draggable
              onDragStart={event => event.dataTransfer.setData("text/plain", item.src)}>
              <span>{item.id}</span><input type="radio" name="selection" value={item.src} onChange={() => setSelected(item.src)} />
              <BackofficeImage id={item.id} src={item.src} previewWidth={item.width}
                className={item.id === "fluid" ? "fluid" : "compact"} alt={item.id}
                loading="lazy" decoding="async" />
            </label>)}</div></main>;
        }
        createRoot(document.getElementById("root")).render(<Fixture />);
      `,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", jsx: "automatic",
    define: { "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(origin), "process.env.NODE_ENV": '"production"' },
  });
  const requests: Record<string, number> = {};
  createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/fixture-stats") {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(requests)); return;
    }
    requests[url] = (requests[url] ?? 0) + 1;
    if (url === "/") {
      response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html><head><title>A2 local fixture</title>
        <style>body{font-family:system-ui;padding:30px;background:#f4f6f8;color:#182230}.cards{display:flex;gap:20px;margin-top:30px}
        label{display:grid;gap:8px;align-content:start;background:white;padding:12px;border:1px solid #ccd3dd}
        img{display:block;object-fit:cover;background:#dce4ed}.compact{width:84px;height:108px}.fluid{width:320px;height:180px}
        output{display:block;font-size:12px;overflow-wrap:anywhere;margin-top:16px}</style></head><body>
        <div id="root"></div><script src="/bundle.js"></script></body></html>`); return;
    }
    if (url === "/bundle.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents); return;
    }
    const asset = assets.get(url);
    if (asset) {
      response.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-store" }).end(asset.bytes);
    } else response.writeHead(404).end();
  }).listen(3102, "127.0.0.1", () => console.log("Synthetic fixture ready at " + origin));
}
void main();
