// Mount the REAL Mesa component, with its own CSS and real read-only desk JSON.
// No credentials, remote API proxy or write path. The fixture stays outside Git.
// tsx scripts/serve-five-column-groups-preview.tsx <desk-snapshot.json>
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { build, type BuildOptions } from "esbuild";

async function main() {
  const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const port = Number(process.env.GROUP_PREVIEW_PORT || 3106);
  const entry = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
    import Desk from "./app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient";
    import "./app/globals.css";
    const desk = ${JSON.stringify(fixture)};
    const contextSelector = { competitions:[{id:desk.competitionId,name:desk.competitionName}],
      seasons:[{id:desk.seasonId,competitionId:desk.competitionId,label:desk.seasonLabel}],
      matchdays:[{id:desk.matchdayId,seasonId:desk.seasonId,label:desk.matchdayLabel,thematicCompatible:true}],error:null };
    const router = {back(){},forward(){},refresh(){location.reload()},push(){},replace(){},prefetch(){return Promise.resolve()}};
    createRoot(document.getElementById("root")).render(<AppRouterContext.Provider value={router}><Desk desk={desk} contextSelector={contextSelector}/></AppRouterContext.Provider>);
  `;
  const options: BuildOptions = { stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true,
    write: false, outfile: "desk.js", platform: "browser", jsx: "automatic", loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""', "process.env": "{}" } };
  const current = await build(options);
  const base = process.env.GROUP_PREVIEW_BASE || "21b29b48740a1580aa606f3e37c7dc0bea210302";
  const tracked = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", base, "app", "components", "lib"], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/));
  const baseline = await build({ ...options, plugins: [{ name: "immutable-main", setup(builder) {
    builder.onLoad({ filter: /\.(tsx?|css)$/ }, (args) => {
      const relative = path.relative(process.cwd(), args.path).replaceAll("\\", "/");
      if (!tracked.has(relative)) return;
      return { contents: execFileSync("git", ["show", `${base}:${relative}`], { encoding: "utf8", windowsHide: true }),
        loader: relative.endsWith(".module.css") ? "local-css" : relative.endsWith(".css") ? "css" : relative.endsWith(".tsx") ? "tsx" : "ts", resolveDir: path.dirname(args.path) };
    });
  } }] });
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (request.method !== "GET") {
      response.writeHead(423, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, message: "Validação visual local: Apply remoto desativado. A persistência é verificada no PostgreSQL local." })); return;
    }
    if (url.pathname === "/") {
      const prefix = url.searchParams.has("baseline") ? "baseline" : "desk";
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "connect-src 'self'; form-action 'none'" })
        .end(`<!doctype html><html lang="pt"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Jornada · Mesa Viva · Validação local</title><link rel="stylesheet" href="/${prefix}.css"></head><body><div id="root"></div><script src="/${prefix}.js"></script></body></html>`);
    } else if (/^\/(desk|baseline)\.(js|css)$/.test(url.pathname)) {
      const output = url.pathname.startsWith("/baseline") ? baseline : current;
      const extension = path.extname(url.pathname);
      response.writeHead(200, { "Content-Type": extension === ".js" ? "text/javascript" : "text/css" }).end(output.outputFiles?.find((file) => file.path.endsWith(extension))?.contents ?? "");
    } else if (url.pathname.startsWith("/assets/") && !url.pathname.includes("..") && existsSync(`public${url.pathname}`)) {
      response.writeHead(200, { "Content-Type": "image/png" }).end(readFileSync(`public${url.pathname}`));
    } else if (url.pathname.startsWith("/api/")) {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, message: "Serviço de vídeo fora da validação local." }));
    } else response.writeHead(url.pathname === "/favicon.ico" ? 204 : 404).end();
  }).listen(port, "127.0.0.1", () => console.log(`Mesa real, dados locais: http://127.0.0.1:${port}`));
}
void main();
