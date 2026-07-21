import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveBroadcastChannelLogoPresentation } from "./public-broadcast-channel-logo";

const componentUrl = new URL("../components/public/BroadcastChannelLogo.tsx", import.meta.url);
const stylesUrl = new URL("../components/public/BroadcastChannelLogo.module.css", import.meta.url);
const integrationUrls = [
  new URL("../components/public/PublicMatchStrip.tsx", import.meta.url),
  new URL("../components/public/PublicGamesPage.tsx", import.meta.url),
  new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx", import.meta.url),
  new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx", import.meta.url),
  new URL("../app/noticias/[slug]/page.tsx", import.meta.url)
];

test("nome válido e logo HTTPS produzem apresentação por imagem", () => {
  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("Sport TV 1", "https://cdn.example.test/sport-tv-1.svg"),
    {
      kind: "image",
      name: "Sport TV 1",
      logoUrl: "https://cdn.example.test/sport-tv-1.svg"
    }
  );
});

test("logo ausente, vazio, inválido ou HTTP usa o nome exato como fallback", () => {
  for (const logoUrl of [null, undefined, "", "   ", "não-é-url", "http://cdn.example.test/logo.svg"]) {
    assert.deepEqual(resolveBroadcastChannelLogoPresentation("Sport TV 2", logoUrl), {
      kind: "fallback",
      name: "Sport TV 2"
    });
  }
});

test("nome vazio ou jogo sem canal não produz logótipo nem texto inventado", () => {
  assert.deepEqual(resolveBroadcastChannelLogoPresentation(null, "https://cdn.example.test/logo.svg"), {
    kind: "hidden"
  });
  assert.deepEqual(resolveBroadcastChannelLogoPresentation("  ", "https://cdn.example.test/logo.svg"), {
    kind: "hidden"
  });
});

test("nomes dos subcanais permanecem exatos e Sport TV 7 usa fallback sem logo", () => {
  for (const name of ["Sport TV 1", "Sport TV 2", "Sport TV 3"]) {
    const presentation = resolveBroadcastChannelLogoPresentation(name, `https://cdn.example.test/${name.at(-1)}.svg`);
    assert.equal(presentation.kind, "image");
    if (presentation.kind === "image") assert.equal(presentation.name, name);
  }
  assert.deepEqual(resolveBroadcastChannelLogoPresentation("Sport TV 7", null), {
    kind: "fallback",
    name: "Sport TV 7"
  });
});

test("o componente cliente troca erro de imagem por fallback e usa uma única identificação semântica", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /^"use client";/);
  assert.match(source, /useState<string \| null>\(null\)/);
  assert.match(source, /presentation\.logoUrl === failedUrl/);
  assert.match(source, /onError=\{\(\) => setFailedUrl\(presentation\.logoUrl\)\}/);
  assert.match(source, /alt=\{presentation\.name\}/);
  assert.match(source, /title=\{presentation\.name\}/);
  assert.match(source, /\{presentation\.name\}[\s\S]*<\/span>/);
  assert.doesNotMatch(source, /aria-label|sr-only|visually-hidden/);
  assert.doesNotMatch(source, /next\/image|from ["']next\/image["']/);

  const imageBranch = source.match(/return \(\s*<span className=\{className\}>([\s\S]*?)<\/span>\s*\);/)?.[1];
  assert.ok(imageBranch);
  assert.match(imageBranch, /<img/);
  assert.doesNotMatch(imageBranch, />\s*\{presentation\.name\}\s*</);
});

test("o CSS preserva proporção sem cápsula e aplica contraste apenas à imagem", async () => {
  const source = await readFile(stylesUrl, "utf8");
  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("DAZN 1", "https://cdn.example.test/dazn-1.svg"),
    {
      kind: "image",
      name: "DAZN 1",
      logoUrl: "https://cdn.example.test/dazn-1.svg"
    }
  );
  assert.match(source, /object-fit:\s*contain/);
  assert.match(source, /width:\s*auto/);
  assert.match(source, /height:\s*auto/);
  assert.match(source, /background:\s*transparent/);
  assert.match(source, /border:\s*0/);
  assert.match(source, /border-radius:\s*0/);
  assert.doesNotMatch(source, /box-shadow/);
  assert.match(source, /drop-shadow[\s\S]*drop-shadow/);
  assert.match(source, /\.compact\s*\{[\s\S]*?width:\s*58px[\s\S]*?height:\s*14px[\s\S]*?padding:\s*0/);
  assert.match(source, /\.compact img\s*\{[\s\S]*?max-width:\s*58px[\s\S]*?max-height:\s*12px/);
  assert.match(source, /\.default\s*\{[\s\S]*?width:\s*92px[\s\S]*?height:\s*20px[\s\S]*?padding:\s*0/);
  assert.match(source, /\.default img\s*\{[\s\S]*?max-width:\s*92px[\s\S]*?max-height:\s*18px/);
});

test("Home e jornada contêm o canal compacto sem o deixar rebentar a linha inferior", async () => {
  const [homeStrip, matchdayPage] = await Promise.all([
    readFile(integrationUrls[0], "utf8"),
    readFile(integrationUrls[2], "utf8")
  ]);
  for (const source of [homeStrip, matchdayPage]) {
    assert.match(source, /className="public-matchday-mini-channel"/);
    assert.match(source, /public-matchday-mini-separator[\s\S]*public-matchday-mini-channel/);
  }
  assert.match(matchdayPage, /\.public-matchday-mini-channel\s*\{[\s\S]*?flex:\s*0 1 58px[\s\S]*?min-width:\s*0/);
});

test("as cinco superfícies públicas usam o componente comum sem compactTvLabel", async () => {
  const sources = await Promise.all(integrationUrls.map((url) => readFile(url, "utf8")));
  for (const source of sources) {
    assert.match(source, /import BroadcastChannelLogo from "@\/components\/public\/BroadcastChannelLogo"/);
    assert.match(source, /<BroadcastChannelLogo/);
    assert.doesNotMatch(source, /compactTvLabel|SportTV/);
    assert.doesNotMatch(source, /Sem transmissão|Sem canal/);
  }
});

test("não permanece imagem de canal com alt vazio nem texto redundante no PublicGamesPage", async () => {
  const source = await readFile(integrationUrls[1], "utf8");
  assert.doesNotMatch(source, /broadcastChannel\?\.logo_url \? <img/);
  assert.doesNotMatch(source, /<span>\{channelName\}<\/span>/);
  assert.match(source, /logoUrl=\{game\.broadcastChannel\?\.logo_url\}/);
  assert.match(source, /name=\{channelName\}/);
});

test("integrações mantêm variantes compact e default nos estados atuais", async () => {
  const sources = await Promise.all(integrationUrls.map((url) => readFile(url, "utf8")));
  const combined = sources.join("\n");
  assert.match(combined, /variant="compact"/);
  assert.match(combined, /variant="default"/);
  assert.match(combined, /kind === "scheduled"/);
  assert.match(combined, /kind === "live"/);
  assert.match(combined, /kind === "finished"/);
  assert.match(combined, /dateTime=\{schedule\.dateTime\}/);
  assert.match(combined, /home_score/);
  assert.match(combined, /away_score/);
});

test("navegação e voltas continuam ligadas ao helper público existente", async () => {
  const pageSources = await Promise.all(integrationUrls.slice(1).map((url) => readFile(url, "utf8")));
  const combined = pageSources.join("\n");
  assert.match(combined, /buildPublicMatchdayLegNavigation/);
  assert.match(combined, /1\.ª volta/);
  assert.match(combined, /2\.ª volta/);
});
