// Isolated preview: real public/editor components, local images, synthetic copy.
// No Supabase connection and no remote writes. Run with tsx; default port 3105.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { build, type BuildOptions } from "esbuild";

async function main() {
  const port = Number(process.env.COLUMN_PREVIEW_PORT || 3105);
  const origin = `http://127.0.0.1:${port}`;
  const options: BuildOptions = { stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import PublicFlexibleZoneLayout, { createPublicFlexibleZone } from "./components/public/PublicFlexibleZoneLayout";
    import PublicEditorialColumnRunLayout from "./components/public/PublicEditorialColumnRunLayout";
    import EditorialZoneTitleColorControl from "./components/admin/EditorialZoneTitleColorControl";
    import { composePublicEditorialColumnRuns } from "./lib/public-editorial-column-runs";
    import { editorialVisualFamilyDefinition } from "./lib/editorial-visual-families";
    import { renderPublicAdvertisingBoundary } from "./components/public/renderPublicAdvertisingBoundary";
    const params = new URLSearchParams(location.search);
    const titles = ["Benfica", "Sporting", "FC Porto", "Primeira Liga", "Além da Liga"];
    const colors = ["#D71920", "#008A44", "#2465A9", null, "#765137"];
    const images = ["hero-match", "news-players", "news-coach", "news-striker", "topic-striker"];
    const stories = [
      "A força do coletivo abre novos caminhos na luta pelo título",
      "Treinador prepara mudanças para o próximo desafio",
      "O talento da formação conquista espaço na equipa principal",
      "Adeptos voltam a encher as bancadas numa jornada de decisões",
      "Os números que ajudam a explicar o equilíbrio do campeonato",
    ];
    function App() {
      const [color, setColor] = useState(params.has("default") ? null : colors[0]);
      const count = Math.max(1, Math.min(Number(params.get("count") || 5), 11));
      const family = params.get("family") || "five_news_column";
      const zones = Array.from({length:count}, (_, i) => createPublicFlexibleZone({
        key:"column-" + i, publicTitle:titles[i % 5] + (i > 4 ? " · " + (Math.floor(i/5)+1) : ""),
        publicTitleColor:i === 0 ? color : colors[i % 5], visualFamily:family,
        ...(params.has("group") ? { columnGroup: { id:"group-"+Math.floor(i/5), publicTitle:"Mercado internacional", enabled:true, position:i%5+1 } } : {}),
        items:Array.from({length:editorialVisualFamilyDefinition(family).slots.length}, (_, p) => p + 1)
          .filter(p => !params.has("sparse") || (i % 2 ? [2,5] : [1,3,5]).includes(p))
          .map(p => ({id:i+"-"+p,sourceId:i+"-"+p,sortOrder:p,label:"JORNADA",
            title:stories[(i+p-1)%5],subtitle:"Texto complementar preservado no estado editorial.",
            imageUrl:params.has("fallback") && i === 0 ? "/missing-image.png" : "/assets/"+images[(i+p-1)%5]+".png",
            linkUrl:"#artigo-"+i+"-"+p,publishedAt:null})),
      }));
      const blocks = zones.map(zone => ({kind:"zone",zone}));
      if (params.has("break")) blocks.splice(2,0,{kind:params.get("break")});
      const grouped = composePublicEditorialColumnRuns(blocks, b => b.kind === "zone" ? b.zone : undefined);
      return <>
        {params.has("editor") ? <div className="preview-control"><EditorialZoneTitleColorControl value={color} onChange={setColor} /></div> : null}
        {renderPublicAdvertisingBoundary(grouped, block => block.kind === "column_run"
          ? <PublicEditorialColumnRunLayout key={block.key} zones={block.zones} publicTitle={block.publicTitle} matchdayNumber={7} />
          : block.kind === "zone" ? <PublicFlexibleZoneLayout key={block.zone.key} zone={block.zone} matchdayNumber={7} />
          : params.has("hidden") ? null : <section className="preview-break" key={block.kind}>{block.kind === "video" ? "Vídeo" : "Últimas"}</section>,
          params.has("ads") ? <aside className="preview-ad" aria-label="Publicidade">Publicidade · fixture local</aside> : null,
          params.has("before"))}
      </>;
    }
    createRoot(document.getElementById("root")).render(<App />);
  ` }, bundle: true, write: false, outfile: "preview.js", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""' } };
  const result = await build(options);
  // Optional immutable comparison, compiled in memory without changing the checkout.
  // Only use ?baseline=1 with an existing family; the new family has no "before".
  const baselineRef = process.env.COLUMN_PREVIEW_BASE;
  const tracked = baselineRef ? new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", baselineRef,
    "components/public", "lib"], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/)) : new Set<string>();
  const baseline = baselineRef ? await build({ ...options, plugins: [{ name: "baseline-source", setup(builder) {
    builder.onLoad({ filter: /\.(tsx?|css)$/ }, (args) => {
      const relative = path.relative(process.cwd(), args.path).replaceAll("\\", "/");
      if (!tracked.has(relative)) return;
      return { contents: execFileSync("git", ["show", baselineRef + ":" + relative], { encoding: "utf8", windowsHide: true }),
        loader: relative.endsWith(".module.css") ? "local-css" : relative.endsWith(".css") ? "css" : relative.endsWith(".tsx") ? "tsx" : "ts", resolveDir: path.dirname(args.path) };
    });
  } }] }) : null;
  const script = result.outputFiles!.find((file) => file.path.endsWith(".js"))!.contents;
  const css = result.outputFiles!.find((file) => file.path.endsWith(".css"))!.contents;
  const assets = new Map(["hero-match", "news-players", "news-coach", "news-striker", "topic-striker", "jornada-logo-original"]
    .map((name) => [`/assets/${name}.png`, readFileSync(`public/assets/${name}.png`)]));
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", origin);
    const prefix = baseline && url.searchParams.has("baseline") ? "/baseline" : "/preview";
    if (url.pathname === "/") response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html>
      <html lang="pt"><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Jornada · Colunas editoriais</title><link rel="stylesheet" href="${prefix}.css">
      <style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#10151b;font-family:Arial,sans-serif}
      header{max-width:1248px;margin:auto;padding:24px;font-size:13px;color:#526174}
      main{max-width:1248px;margin:auto;padding:0 24px 36px}.preview-ad{margin:32px auto;text-align:center;padding:24px;background:#fafafa;font-size:12px;color:#64748b}
      .preview-break{margin:32px 0;border-block:1px solid #e1e5e9;padding:24px}.preview-control{margin:20px 0;padding:16px;background:#f5f7f9}
      @media(max-width:680px){header{padding:16px}main{padding:0 16px 28px}}</style></head>
      <body><header>JORNADA · Colunas editoriais · Conteúdo sintético de validação</header>
      <main id="root"></main><script src="${prefix}.js"></script></body></html>`);
    else if (baseline && url.pathname === "/baseline.js") response.writeHead(200, { "Content-Type": "text/javascript" }).end(baseline.outputFiles!.find(file => file.path.endsWith(".js"))!.contents);
    else if (baseline && url.pathname === "/baseline.css") response.writeHead(200, { "Content-Type": "text/css" }).end(baseline.outputFiles!.find(file => file.path.endsWith(".css"))!.contents);
    else if (url.pathname === "/preview.js") response.writeHead(200, { "Content-Type": "text/javascript" }).end(script);
    else if (url.pathname === "/preview.css") response.writeHead(200, { "Content-Type": "text/css" }).end(css);
    else if (url.pathname === "/favicon.ico") response.writeHead(204).end();
    else if (assets.has(url.pathname)) response.writeHead(200, { "Content-Type": "image/png" }).end(assets.get(url.pathname));
    else response.writeHead(404).end();
  }).listen(port, "127.0.0.1", () => console.log(`Preview: ${origin}`));
}
void main();
