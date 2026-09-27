// Local preview using repository images and synthetic editorial copy. No database.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

async function main() {
  const items = [
    ["A jornada que abre novos caminhos na luta pelo título", "O equilíbrio entre os candidatos volta a marcar uma ronda de decisões, ambição e estádios cheios.", "hero-match"],
    ["A força do coletivo faz a diferença nos momentos decisivos", "O trabalho da semana traduz-se numa equipa mais próxima e capaz de controlar o jogo.", "news-players"],
    ["Treinador prepara mudanças para o próximo desafio", "As opções da equipa técnica e os detalhes que podem decidir a próxima partida.", "news-coach"],
    ["Um avançado em grande momento", "Os números ajudam a explicar a influência no ataque.", "news-striker"],
    ["Adeptos voltam a encher as bancadas", "Uma ligação que acompanha a equipa em cada jornada.", "hero-match"],
    ["Os nomes a seguir na próxima ronda", "Talento e confiança nas escolhas para o fim de semana.", "topic-striker"],
  ].map(([title, subtitle, image], index) => ({
    id: `preview-${index}`, sourceId: `preview-source-${index}`, title, subtitle,
    imageUrl: `/assets/${image}.png`, label: "JORNADA", linkUrl: "#preview",
    sortOrder: index + 1, publishedAt: null,
  }));
  const result = await build({ stdin: {
    contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import PublicFlexibleZoneLayout, { createPublicFlexibleZone } from "./components/public/PublicFlexibleZoneLayout";
      const items = ${JSON.stringify(items)};
      const fallback = new URLSearchParams(location.search).has("fallback");
      if (fallback) { items[4].imageUrl = ""; items[5].imageUrl = "/missing-editorial.png"; }
      createRoot(document.getElementById("root")).render(<PublicFlexibleZoneLayout matchdayNumber={7}
        zone={createPublicFlexibleZone({key:"preview-six-news",publicTitle:"Atualidade",visualFamily:"six_news_1_2_3",items})} />);
    `, loader: "tsx", resolveDir: process.cwd(),
  }, bundle: true, write: false, outfile: "preview.js", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""' },
  });
  const script = result.outputFiles.find((file) => file.path.endsWith(".js"))!.contents;
  const css = result.outputFiles.find((file) => file.path.endsWith(".css"))!.contents;
  const assets = new Map(items.map((item) => [item.imageUrl, readFileSync(`public${item.imageUrl}`)]));
  assets.set("/assets/jornada-logo-original.png", readFileSync("public/assets/jornada-logo-original.png"));
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1:3104");
    if (url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html>
        <html lang="pt"><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Jornada — preview local 1 + 2 + 3</title><link rel="stylesheet" href="/preview.css">
        <style>*{box-sizing:border-box}body{margin:0;color:#10151b;background:#fff;font-family:Segoe UI,Arial,sans-serif}
        header,main{max-width:1200px;margin:auto;padding:24px}header{font-size:13px;color:#526174}main{padding-top:0}
        @media(max-width:680px){header,main{padding:16px}}</style></head>
        <body><header>JORNADA · Preview local · 6 notícias — 1 + 2 + 3</header><main id="root"></main><script src="/preview.js"></script></body></html>`);
    } else if (url.pathname === "/preview.js") response.writeHead(200, { "Content-Type": "text/javascript" }).end(script);
    else if (url.pathname === "/preview.css") response.writeHead(200, { "Content-Type": "text/css" }).end(css);
    else if (url.pathname === "/favicon.ico") response.writeHead(204).end();
    else if (assets.has(url.pathname)) response.writeHead(200, { "Content-Type": "image/png" }).end(assets.get(url.pathname));
    else response.writeHead(404).end();
  }).listen(3104, "127.0.0.1", () => console.log("Preview: http://127.0.0.1:3104"));
}
void main();
