import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getPublicBroadcastLogoUrl,
  getPublicBroadcastMatchMetaScale,
  isSportTvBroadcastChannel,
  resolveBroadcastChannelLogoPresentation
} from "./public-broadcast-channel-logo";

const componentUrl = new URL("../components/public/BroadcastChannelLogo.tsx", import.meta.url);
const stylesUrl = new URL("../components/public/BroadcastChannelLogo.module.css", import.meta.url);
const helperUrl = new URL("./public-broadcast-channel-logo.ts", import.meta.url);
const matchMetaComponentUrl = new URL("../components/public/PublicMatchMeta.tsx", import.meta.url);
const matchMetaStylesUrl = new URL("../components/public/PublicMatchMeta.module.css", import.meta.url);
const matchStripStylesUrl = new URL("../components/public/PublicMatchStrip.module.css", import.meta.url);
const publicEditorialStylesUrl = new URL("../components/public/publicEditorialStyles.ts", import.meta.url);
const homePageUrl = new URL("../app/page.tsx", import.meta.url);
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
      logoUrl: "https://cdn.example.test/sport-tv-1.svg",
      opticalScale: 1.14,
      contrastMode: "light-logo",
      slotMinWidth: 64
    }
  );
});

test("os fatores óticos aprovados ficam centralizados por canal no helper", async () => {
  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("RTP1", "https://cdn.example.test/rtp1.svg"),
    {
      kind: "image",
      name: "RTP1",
      logoUrl: "https://cdn.example.test/rtp1.svg",
      opticalScale: 0.72,
      contrastMode: "standard",
      slotMinWidth: 46,
      matchMetaGeometry: {
        baseWidth: 54,
        baseHeight: 15.26,
        renderedWidth: 38.88,
        renderedHeight: 10.99
      }
    }
  );
  for (const name of ["Sport TV 1", "Sport TV 2", "Sport TV 3", "Sport TV 4", "Sport TV 5", "Sport TV 6", "Sport TV 7", "Sport TV+"]) {
    const logoUrl = `https://cdn.example.test/${name.toLowerCase().replaceAll(" ", "-")}.svg`;
    assert.deepEqual(resolveBroadcastChannelLogoPresentation(name, logoUrl), {
      kind: "image",
      name,
      logoUrl,
      opticalScale: 1.14,
      contrastMode: "light-logo",
      slotMinWidth: 64
    });
  }
  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("BTV", "https://cdn.example.test/btv.svg"),
    {
      kind: "image",
      name: "BTV",
      logoUrl: "https://cdn.example.test/btv.svg",
      opticalScale: 0.82,
      contrastMode: "standard",
      slotMinWidth: 46
    }
  );
  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("TVI", "https://cdn.example.test/tvi.png"),
    {
      kind: "image",
      name: "TVI",
      logoUrl: "https://cdn.example.test/tvi.png",
      opticalScale: 1.48,
      contrastMode: "standard",
      slotMinWidth: 46,
      matchMetaGeometry: {
        baseWidth: 15.83,
        baseHeight: 12,
        renderedWidth: 23.43,
        renderedHeight: 17.76,
        sourceViewport: {
          width: 1920,
          height: 1080,
          viewBox: "530 214 860 652"
        }
      }
    }
  );
  for (const name of ["DAZN 1", "DAZN 2", "DAZN 3"]) {
    const sourceLogoUrl = `https://cdn.example.test/${name.at(-1)}.svg`;
    const expectedLogoUrl = name === "DAZN 2"
      ? "https://commons.wikimedia.org/wiki/Special:Redirect/file/DAZN_2_2024.svg"
      : name === "DAZN 3"
        ? "https://commons.wikimedia.org/wiki/Special:Redirect/file/DAZN_3_2024.svg"
        : sourceLogoUrl;
    assert.deepEqual(
      resolveBroadcastChannelLogoPresentation(name, sourceLogoUrl),
      {
        kind: "image",
        name,
        logoUrl: expectedLogoUrl,
        opticalScale: 0.82,
        contrastMode: "standard",
        slotMinWidth: 46
      }
    );
  }
  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("Canal 11", "https://cdn.example.test/canal-11.svg"),
    {
      kind: "image",
      name: "Canal 11",
      logoUrl: "https://cdn.example.test/canal-11.svg",
      opticalScale: 1,
      contrastMode: "standard",
      slotMinWidth: 46
    }
  );

  const helperSource = await readFile(helperUrl, "utf8");
  const channelVisualConfigSource = helperSource.split("const CHANNEL_VISUAL_CONFIG")[1] ?? "";
  assert.deepEqual(
    [...channelVisualConfigSource.matchAll(/^\s*\["([^"]+)", \{/gm)].map((match) => match[1]),
    ["rtp1", "sport tv 1", "sport tv 2", "sport tv 3", "sport tv 4", "sport tv 5", "sport tv 6", "sport tv 7", "sport tv+", "btv", "tvi", "dazn 1", "dazn 2", "dazn 3"]
  );
  assert.doesNotMatch(helperSource, /Math\.|calculate|computedScale/);
});

test("normalização final dos canais é global e preserva Sport TV como referência", async () => {
  assert.equal(getPublicBroadcastMatchMetaScale("Sport TV 1"), 1);
  assert.equal(getPublicBroadcastMatchMetaScale("Sport TV+"), 1);
  assert.equal(getPublicBroadcastMatchMetaScale("RTP1"), 0.68);
  assert.equal(getPublicBroadcastMatchMetaScale("TVI"), 0.82);
  assert.equal(getPublicBroadcastMatchMetaScale("BTV"), 0.68);
  assert.equal(getPublicBroadcastMatchMetaScale("Canal 11"), 0.756);
  assert.equal(getPublicBroadcastMatchMetaScale("Canal desconhecido"), 0.72);
  assert.equal(getPublicBroadcastMatchMetaScale("DAZN 1"), 0.7);
  assert.equal(getPublicBroadcastMatchMetaScale("DAZN 2"), 0.7);
  assert.equal(getPublicBroadcastMatchMetaScale("DAZN 3"), 0.7);

  assert.equal(getPublicBroadcastLogoUrl("DAZN 1", "https://cdn.example.test/dazn-1.svg"), "https://cdn.example.test/dazn-1.svg");
  assert.equal(
    getPublicBroadcastLogoUrl("DAZN 2", "https://cdn.example.test/dazn-2.png"),
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/DAZN_2_2024.svg"
  );
  assert.equal(
    getPublicBroadcastLogoUrl("DAZN 3", "https://cdn.example.test/dazn-3.png"),
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/DAZN_3_2024.svg"
  );

  const [componentSource, styleSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  assert.match(componentSource, /matchMeta \? ` \$\{styles\.normalizedMatchMeta\}` : ""/);
  assert.match(componentSource, /--broadcast-channel-match-meta-scale/);
  assert.match(styleSource, /\.matchMeta\.normalizedMatchMeta\s*\{[\s\S]*?width:\s*64px;[\s\S]*?height:\s*18px;[\s\S]*?transform:\s*scale\(var\(--broadcast-channel-match-meta-scale, 1\)\)/);
  assert.match(styleSource, /\.matchMeta\.normalizedMatchMeta img,[\s\S]*?width:\s*61\.56px;[\s\S]*?height:\s*18px;[\s\S]*?object-fit:\s*contain/);
  assert.match(styleSource, /\.matchMeta\.canal11 img,[\s\S]*?drop-shadow\(0 0 0\.7px rgba\(15, 23, 42, 0\.62\)\)[\s\S]*?drop-shadow\(0 0\.75px 0\.85px rgba\(15, 23, 42, 0\.36\)\)/);
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
  assert.equal((source.match(/data-public-broadcast-logo-visual/g) ?? []).length, 3);
  assert.match(source, /\{presentation\.name\}[\s\S]*<\/span>/);
  assert.doesNotMatch(source, /aria-label|sr-only|visually-hidden/);
  assert.doesNotMatch(source, /next\/image|from ["']next\/image["']/);

  assert.match(source, /presentation\.contrastMode === "light-logo"/);
  assert.match(source, /--broadcast-channel-optical-scale/);
  const imageBranch = source.match(/return \(\s*<span className=\{imageClassName\} style=\{imageStyle\}>([\s\S]*?)<\/span>\s*\);/)?.[1];
  assert.ok(imageBranch);
  assert.match(imageBranch, /<img/);
  assert.doesNotMatch(imageBranch, /<span[^>]*>\s*\{presentation\.name\}\s*<\/span>/);
});

test("o CSS preserva proporção sem cápsula e aplica contraste apenas à imagem", async () => {
  const source = await readFile(stylesUrl, "utf8");
  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("DAZN 1", "https://cdn.example.test/dazn-1.svg"),
    {
      kind: "image",
      name: "DAZN 1",
      logoUrl: "https://cdn.example.test/dazn-1.svg",
      opticalScale: 0.82,
      contrastMode: "standard",
      slotMinWidth: 46
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
  assert.match(source, /transform:\s*scale\(var\(--broadcast-channel-optical-scale, 1\)\)/);
  assert.match(source, /transform-origin:\s*center/);
  assert.match(source, /\.lightLogo img\s*\{[\s\S]*?drop-shadow\(0 0 0\.6px rgba\(15, 23, 42, 0\.95\)\)[\s\S]*?drop-shadow\(0 0 1\.4px rgba\(15, 23, 42, 0\.6\)\)/);
  assert.match(source, /\.compact\s*\{[\s\S]*?width:\s*58px[\s\S]*?height:\s*14px[\s\S]*?padding:\s*0/);
  assert.match(source, /\.compact img\s*\{[\s\S]*?max-width:\s*58px[\s\S]*?max-height:\s*12px/);
  assert.match(source, /\.default\s*\{[\s\S]*?width:\s*92px[\s\S]*?height:\s*20px[\s\S]*?padding:\s*0/);
  assert.match(source, /\.default img\s*\{[\s\S]*?max-width:\s*92px[\s\S]*?max-height:\s*18px/);
  assert.match(source, /\.matchMeta\s*\{[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*flex-end[\s\S]*?width:\s*var\(--broadcast-channel-match-meta-slot-width, 54px\)[\s\S]*?max-width:\s*none[\s\S]*?height:\s*18px[\s\S]*?min-height:\s*18px[\s\S]*?padding:\s*0[\s\S]*?line-height:\s*0/);
  assert.match(source, /\.matchMeta img\s*\{[\s\S]*?width:\s*var\(--broadcast-channel-match-meta-width, 54px\)[\s\S]*?height:\s*var\(--broadcast-channel-match-meta-height, 18px\)[\s\S]*?max-width:\s*none[\s\S]*?max-height:\s*none[\s\S]*?align-self:\s*center[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0[\s\S]*?object-fit:\s*contain[\s\S]*?transform:\s*none/);
  assert.doesNotMatch(source, /matchMetaCompact/);
});

test("RTP1 e TVI usam geometria estática real e Sport TV mantém o slot de 64px", async () => {
  const [componentSource, styleSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  assert.doesNotMatch(componentSource, /isSportTvChannel|sportTvAlignment|nonSportTvAlignment/);
  assert.doesNotMatch(styleSource, /align-items:\s*flex-end|align-self:\s*flex-end|object-position:\s*right bottom|translateY|\btop:|\bbottom:/);
  assert.match(componentSource, /matchMetaGeometry\?\.renderedHeight \?\? Math\.min\(18, 18 \* presentation\.opticalScale\)/);
  assert.match(componentSource, /const slotWidth = Math\.max\(renderedWidth, presentation\.slotMinWidth\)/);
  assert.match(styleSource, /\.matchMeta\s*\{[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*flex-end[\s\S]*?height:\s*18px[\s\S]*?min-height:\s*18px/);
  assert.match(styleSource, /\.matchMeta img\s*\{[\s\S]*?align-self:\s*center[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0[\s\S]*?transform:\s*none/);
  assert.match(componentSource, /matchMetaGeometry\?\.sourceViewport \? \([\s\S]*?<svg[\s\S]*?viewBox=\{matchMetaGeometry\.sourceViewport\.viewBox\}/);
  assert.match(styleSource, /\.matchMeta \.alphaViewport\s*\{[\s\S]*?width:\s*var\(--broadcast-channel-match-meta-width, 54px\)[\s\S]*?height:\s*var\(--broadcast-channel-match-meta-height, 18px\)[\s\S]*?max-width:\s*none[\s\S]*?max-height:\s*none/);
  assert.match(styleSource, /\.matchMeta\.normalizedMatchMeta \.alphaViewport\s*\{[\s\S]*?width:\s*var\(--broadcast-channel-match-meta-width, 54px\)[\s\S]*?max-width:\s*none[\s\S]*?height:\s*var\(--broadcast-channel-match-meta-height, 18px\)[\s\S]*?max-height:\s*none/);

  for (const [name, opticalScale, slotMinWidth, renderedWidth, slotWidth, renderedHeight] of [
    ["RTP1", 0.72, 46, 38.88, 46, 10.99],
    ["TVI", 1.48, 46, 23.43, 46, 17.76],
    ["DAZN 1", 0.82, 46, 44.28, 46, 14.76],
    ["Sport TV 1", 1.14, 64, 61.56, 64, 18]
  ] as const) {
    const presentation = resolveBroadcastChannelLogoPresentation(name, `https://cdn.example.test/${name}.svg`);
    assert.equal(presentation.kind, "image");
    if (presentation.kind !== "image") continue;
    assert.equal(presentation.opticalScale, opticalScale);
    assert.equal(presentation.slotMinWidth, slotMinWidth);
    const actualWidth = presentation.matchMetaGeometry?.renderedWidth ?? Number((54 * opticalScale).toFixed(2));
    const actualHeight = presentation.matchMetaGeometry?.renderedHeight ?? Number(Math.min(18, 18 * opticalScale).toFixed(2));
    assert.equal(actualWidth, renderedWidth);
    assert.equal(Number(Math.max(actualWidth, slotMinWidth).toFixed(2)), slotWidth);
    assert.equal(actualHeight, renderedHeight);
    assert.ok(renderedHeight <= 18);
  }
});

test("as chaves reais TVI e RTP1 aplicam a geometria medida sem overflow", () => {
  const btv = resolveBroadcastChannelLogoPresentation("BTV", "https://cdn.example.test/btv.svg");
  const tvi = resolveBroadcastChannelLogoPresentation("TVI", "https://cdn.example.test/tvi.svg");
  const rtp1 = resolveBroadcastChannelLogoPresentation("RTP1", "https://cdn.example.test/rtp1.svg");
  assert.equal(btv.kind, "image");
  assert.equal(tvi.kind, "image");
  assert.equal(rtp1.kind, "image");
  if (btv.kind !== "image" || tvi.kind !== "image" || rtp1.kind !== "image") return;

  assert.equal(btv.opticalScale, 0.82);
  assert.equal(tvi.opticalScale, 1.48);
  assert.equal(rtp1.opticalScale, 0.72);
  assert.deepEqual(tvi.matchMetaGeometry?.sourceViewport, {
    width: 1920,
    height: 1080,
    viewBox: "530 214 860 652"
  });
  assert.deepEqual(
    [tvi.matchMetaGeometry?.renderedWidth, tvi.matchMetaGeometry?.renderedHeight],
    [23.43, 17.76]
  );
  assert.deepEqual(
    [rtp1.matchMetaGeometry?.renderedWidth, rtp1.matchMetaGeometry?.renderedHeight],
    [38.88, 10.99]
  );
  assert.ok((tvi.matchMetaGeometry?.renderedHeight ?? Infinity) <= 18);
  assert.ok((rtp1.matchMetaGeometry?.renderedHeight ?? Infinity) <= 18);
});

test("PublicMatchMeta preserva o alinhamento compacto com e sem canal", async () => {
  const [componentSource, styleSource] = await Promise.all([
    readFile(matchMetaComponentUrl, "utf8"),
    readFile(matchMetaStylesUrl, "utf8")
  ]);
  assert.match(componentSource, /<span className=\{styles\.dateTime\}>\{dateTime\}<\/span>/);
  assert.match(componentSource, /const hasChannel = Boolean\(channelName\?\.trim\(\)\)/);
  assert.match(componentSource, /const channel = hasChannel \? \([\s\S]*?<span className=\{styles\.channel\}>[\s\S]*?variant="matchMeta"/);
  assert.doesNotMatch(componentSource, /matchMetaLayoutMode|channelVariant|matchMetaCompact/);
  assert.match(componentSource, /variant\?: "default" \| "compact";/);
  assert.match(componentSource, /variant === "compact"[\s\S]*?styles\.compact/);
  assert.doesNotMatch(componentSource, /variant === "clean"|styles\.clean/);
  assert.match(componentSource, /const className = hasChannel \? variantClassName : `\$\{variantClassName\} \$\{styles\.withoutChannel\}`/);
  assert.match(componentSource, /<span[\s\S]*?className=\{className\}[\s\S]*?data-public-match-channel-family=\{isSportTvChannel \? "sport-tv" : undefined\}[\s\S]*?data-public-match-meta/);
  assert.doesNotMatch(componentSource, /denseDate|denseTime|denseBottom/);
  assert.match(styleSource, /\.matchMeta\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*max-content minmax\(2px, 1fr\) max-content[\s\S]*?align-items:\s*center[\s\S]*?width:\s*auto[\s\S]*?max-width:\s*none[\s\S]*?min-width:\s*0[\s\S]*?margin-inline:\s*calc\(-1 \* var\(--public-match-card-inline-padding, 0px\)\)[\s\S]*?padding-inline:\s*3px[\s\S]*?column-gap:\s*0/);
  assert.match(styleSource, /\.dateTime\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?justify-self:\s*start[\s\S]*?min-width:\s*0[\s\S]*?overflow:\s*visible[\s\S]*?text-align:\s*left[\s\S]*?text-overflow:\s*clip[\s\S]*?white-space:\s*nowrap[\s\S]*?margin:\s*0[\s\S]*?font-size:\s*9\.5px[\s\S]*?line-height:\s*1[\s\S]*?letter-spacing:\s*-0\.1px/);
  assert.match(styleSource, /\.compact\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?grid-template-rows:\s*14px 2px 18px 2px[\s\S]*?align-items:\s*start[\s\S]*?justify-items:\s*stretch[\s\S]*?width:\s*100%[\s\S]*?height:\s*37px[\s\S]*?border-bottom:[\s\S]*?text-align:\s*left/);
  assert.match(styleSource, /\.compact \.dateTime\s*\{[\s\S]*?grid-row:\s*1[\s\S]*?justify-self:\s*stretch[\s\S]*?width:\s*100%[\s\S]*?font-size:\s*11px[\s\S]*?font-weight:\s*600[\s\S]*?line-height:\s*14px[\s\S]*?letter-spacing:\s*0[\s\S]*?text-align:\s*inherit/);
  assert.match(styleSource, /\.withoutChannel\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?width:\s*100%/);
  assert.match(styleSource, /\.withoutChannel \.dateTime\s*\{[\s\S]*?justify-self:\s*center[\s\S]*?text-align:\s*center/);
  assert.match(styleSource, /\.compact\.withoutChannel \.dateTime\s*\{[\s\S]*?justify-self:\s*stretch[\s\S]*?text-align:\s*inherit/);
  assert.doesNotMatch(`${componentSource}\n${styleSource}`, /dense|row-gap|text-overflow:\s*ellipsis/);
  assert.doesNotMatch(styleSource, /\.clean(?:\s|\.)/);
  assert.match(styleSource, /\.channel\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-column:\s*3[\s\S]*?place-items:\s*center[\s\S]*?justify-self:\s*end[\s\S]*?flex-shrink:\s*0[\s\S]*?width:\s*max-content[\s\S]*?max-width:\s*none[\s\S]*?height:\s*max-content[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0[\s\S]*?overflow:\s*visible/);
  assert.match(styleSource, /\.compact \.channel\s*\{[\s\S]*?display:\s*block[\s\S]*?grid-column:\s*1[\s\S]*?grid-row:\s*3[\s\S]*?justify-self:\s*stretch[\s\S]*?height:\s*18px[\s\S]*?text-align:\s*inherit/);
  assert.match(styleSource, /\.compact \.channel > span\s*\{[\s\S]*?justify-content:\s*flex-start[\s\S]*?transform-origin:\s*left center/);
  assert.doesNotMatch(styleSource, /display:\s*inline-flex|position:\s*absolute|margin[^:]*:\s*-/);
});

test("PublicMatchMeta usa 9.5px por omissão e 11px na faixa compacta", async () => {
  const styleSource = await readFile(matchMetaStylesUrl, "utf8");
  assert.match(styleSource, /\.dateTime\s*\{[\s\S]*?font-size:\s*9\.5px/);
  assert.match(styleSource, /\.compact \.dateTime\s*\{[\s\S]*?font-size:\s*11px/);
});

test("matchMeta usa dimensões reais, full-bleed simétrico e colunas separadas", async () => {
  const [logoComponentSource, logoStyleSource, metaStyleSource, helperSource, stripStyleSource, editorialStyleSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(matchMetaStylesUrl, "utf8"),
    readFile(helperUrl, "utf8"),
    readFile(matchStripStylesUrl, "utf8"),
    readFile(publicEditorialStylesUrl, "utf8")
  ]);
  assert.match(logoComponentSource, /const renderedWidth = matchMetaGeometry\?\.renderedWidth \?\? 54 \* presentation\.opticalScale/);
  assert.match(logoComponentSource, /const renderedHeight = matchMetaGeometry\?\.renderedHeight \?\? Math\.min\(18, 18 \* presentation\.opticalScale\)/);
  assert.match(logoComponentSource, /const slotWidth = Math\.max\(renderedWidth, presentation\.slotMinWidth\)/);
  assert.match(logoComponentSource, /"--broadcast-channel-match-meta-width": `\$\{renderedWidth\.toFixed\(2\)\}px`/);
  assert.match(logoComponentSource, /"--broadcast-channel-match-meta-height": `\$\{renderedHeight\.toFixed\(2\)\}px`/);
  assert.match(logoComponentSource, /"--broadcast-channel-match-meta-slot-width": `\$\{slotWidth\.toFixed\(2\)\}px`/);
  const matchMetaWrapperRule = logoStyleSource.match(/\.matchMeta\s*\{([^}]*)\}/)?.[1] ?? "";
  const matchMetaImageRule = logoStyleSource.match(/\.matchMeta img\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(matchMetaWrapperRule, /align-items:\s*center/);
  assert.match(matchMetaWrapperRule, /justify-content:\s*flex-end/);
  assert.match(matchMetaWrapperRule, /width:\s*var\(--broadcast-channel-match-meta-slot-width, 54px\)/);
  assert.match(matchMetaWrapperRule, /height:\s*18px/);
  assert.match(matchMetaWrapperRule, /min-height:\s*18px/);
  assert.match(matchMetaImageRule, /width:\s*var\(--broadcast-channel-match-meta-width, 54px\)/);
  assert.match(matchMetaImageRule, /height:\s*var\(--broadcast-channel-match-meta-height, 18px\)/);
  assert.match(matchMetaImageRule, /max-width:\s*none/);
  assert.match(matchMetaImageRule, /max-height:\s*none/);
  assert.match(matchMetaImageRule, /align-self:\s*center/);
  assert.match(matchMetaImageRule, /margin:\s*0/);
  assert.match(matchMetaImageRule, /padding:\s*0/);
  assert.match(matchMetaImageRule, /object-fit:\s*contain/);
  assert.match(matchMetaImageRule, /transform:\s*none/);
  assert.doesNotMatch(`${matchMetaWrapperRule}\n${matchMetaImageRule}`, /scale\(|zoom:|align-items:\s*flex-end|align-self:\s*flex-end|translateY|\btop:|\bbottom:/);
  assert.doesNotMatch(logoStyleSource, /\.matchMeta(?:::|\s+[^i{][^{]*::)/);
  assert.doesNotMatch(helperSource, /reservedLayoutWidth|\b(?:70|74)\b/);
  assert.match(metaStyleSource, /\.compact\s*\{[\s\S]*?column-gap:\s*0/);
  assert.match(metaStyleSource, /grid-template-columns:\s*max-content minmax\(2px, 1fr\) max-content/);
  assert.match(stripStyleSource, /--public-match-card-inline-padding:\s*clamp\(3px, 0\.5vw, 8px\)/);
  assert.match(stripStyleSource, /padding-inline:\s*var\(--public-match-card-inline-padding\)/);
  assert.match(metaStyleSource, /margin-inline:\s*calc\(-1 \* var\(--public-match-card-inline-padding, 0px\)\)/);
  assert.match(metaStyleSource, /padding-inline:\s*3px/);
  assert.match(editorialStyleSource, /> \[data-public-match-meta\]\[data-public-match-channel-family="sport-tv"\]\s*\{[\s\S]*?flex:\s*1 1 auto/);
  assert.match(metaStyleSource, /column-gap:\s*0/);
  assert.match(metaStyleSource, /\.dateTime\s*\{[\s\S]*?grid-column:\s*1/);
  assert.match(metaStyleSource, /\.channel\s*\{[\s\S]*?grid-column:\s*3[\s\S]*?width:\s*max-content[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0/);
  assert.doesNotMatch(`${matchMetaImageRule}\n${metaStyleSource}`, /position:\s*absolute|overflow:\s*hidden|text-overflow:\s*ellipsis/);

  const channelCases = [
    { name: "Sport TV 1", scale: 1.14, width: 61.56, slotWidth: 64, height: 18, matches: 9 },
    { name: "Sport TV 1", scale: 1.14, width: 61.56, slotWidth: 64, height: 18, matches: 10 },
    { name: "RTP1", scale: 0.72, width: 38.88, slotWidth: 46, height: 10.99, matches: 9 },
    { name: "TVI", scale: 1.48, width: 23.43, slotWidth: 46, height: 17.76, matches: 9 },
    { name: "DAZN 1", scale: 0.82, width: 44.28, slotWidth: 46, height: 14.76, matches: 10 }
  ];
  for (const channelCase of channelCases) {
    const presentation = resolveBroadcastChannelLogoPresentation(channelCase.name, `https://cdn.example.test/${channelCase.name}.svg`);
    assert.equal(presentation.kind, "image");
    if (presentation.kind !== "image") continue;
    assert.equal(presentation.opticalScale, channelCase.scale);
    const renderedWidth = presentation.matchMetaGeometry?.renderedWidth ?? Number((54 * presentation.opticalScale).toFixed(2));
    const renderedHeight = presentation.matchMetaGeometry?.renderedHeight ?? Number(Math.min(18, 18 * presentation.opticalScale).toFixed(2));
    assert.equal(renderedWidth, channelCase.width);
    assert.equal(Number(Math.max(renderedWidth, presentation.slotMinWidth).toFixed(2)), channelCase.slotWidth);
    assert.equal(renderedHeight, channelCase.height);
    assert.ok(channelCase.height <= 18);
    const fontSize = channelCase.matches >= 10 ? 8.5 : 9.5;
    const textWidth = (7.171 * fontSize) - (13 * 0.1);
    const usefulCardWidth = channelCase.name === "Sport TV 1"
      ? (channelCase.matches >= 10 ? 132 : 139)
      : (channelCase.matches >= 10 ? 150 : 160);
    assert.ok(textWidth + channelCase.slotWidth + 3 + 3 + 2 <= usefulCardWidth);
    const textRight = 3 + textWidth;
    const channelLeft = usefulCardWidth - 3 - channelCase.slotWidth;
    assert.ok(textRight + 2 <= channelLeft);
  }
});

test("PublicMatchStrip usa carrossel limpo e mantém o layout partilhado nos restantes contextos", async () => {
  const [componentSource, carouselSource, styleSource] = await Promise.all([
    readFile(integrationUrls[0], "utf8"),
    readFile(new URL("../components/public/PublicMatchStripCarousel.tsx", import.meta.url), "utf8"),
    readFile(matchStripStylesUrl, "utf8")
  ]);
  assert.match(componentSource, /import PublicMatchStripCarousel/);
  assert.match(componentSource, /variant = "clean"/);
  assert.match(componentSource, /variant === "clean" \? \([\s\S]*?<PublicMatchStripCarousel layout=\{carouselLayout\}>/);
  assert.match(componentSource, /data-public-match-card/);
  assert.match(componentSource, /data-public-match-schedule/);
  assert.match(componentSource, /visualVariant === "clean" \? \(\s*cleanHeaderContent\s*\)/);
  assert.match(componentSource, /data-public-match-broadcast[\s\S]*?<PublicMatchMeta[\s\S]*?dateTime=\{<span aria-hidden="true" \/>\}[\s\S]*?variant="compact"/);
  assert.match(componentSource, /visual:\s*`\$\{compactCivilDate\(civilDate\)\} \\u00b7 \$\{kickoffTime\}`/);
  assert.doesNotMatch(componentSource, /data-strip-density/);
  assert.match(carouselSource, /aria-label="Ver jogo anterior"/);
  assert.match(carouselSource, /aria-label="Ver jogo seguinte"/);
  assert.match(carouselSource, /new ResizeObserver\(updateVisibleCardCount\)/);
  assert.match(carouselSource, /selectMatchCarouselVisibleCardCount\(availableWidth\)/);
  assert.match(carouselSource, /data-visible-cards=\{layout === "fixed" \? visibleCardCount : undefined\}/);
  assert.match(carouselSource, /data-can-move-forward=\{canMoveForward \? "true" : undefined\}/);
  assert.match(carouselSource, /data-can-move-back=\{canMoveBack \? "true" : undefined\}/);
  assert.match(carouselSource, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(carouselSource, /viewport\.scrollTo\(\{[\s\S]*?left:\s*targetScroll[\s\S]*?behavior:\s*reducedMotion \? "auto" : "smooth"/);
  assert.match(carouselSource, /\(currentStep \+ direction\) \* CARD_STEP/);
  assert.match(carouselSource, /"--match-card-width": `\$\{CARD_WIDTH\}px`/);
  assert.match(carouselSource, /"--match-card-height": `\$\{CARD_HEIGHT\}px`/);
  assert.match(carouselSource, /"--match-card-gap": `\$\{CARD_GAP\}px`/);
  assert.match(carouselSource, /"--match-carousel-shell-width": layout === "fluid-peek" \? "100%" : `\$\{shellWidth\}px`/);
  assert.match(styleSource, /\.panel\[data-visual-variant="clean"\]\s*\{[\s\S]*?width:\s*100vw[\s\S]*?max-width:\s*none[\s\S]*?margin:\s*0 calc\(50% - 50vw\)/);
  assert.match(styleSource, /\.carousel\s*\{[\s\S]*?width:\s*var\(--match-carousel-shell-width\)[\s\S]*?max-width:\s*100%[\s\S]*?margin-inline:\s*auto/);
  assert.match(styleSource, /\.carouselViewport\s*\{[\s\S]*?width:\s*var\(--match-carousel-viewport-width\)[\s\S]*?padding-inline:\s*0[\s\S]*?overflow-x:\s*hidden[\s\S]*?scrollbar-width:\s*none/);
  assert.match(styleSource, /\.carouselViewport::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
  assert.match(styleSource, /\.carouselViewport > \.row\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?justify-content:\s*flex-start[\s\S]*?width:\s*max-content[\s\S]*?gap:\s*var\(--match-card-gap\)[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0/);
  assert.doesNotMatch(styleSource, /grid-auto-columns/);
  assert.doesNotMatch(styleSource, /@media \(max-width:\s*(?:1591|1211|831|451)px\)/);
  assert.match(styleSource, /\.carouselButton\s*\{[\s\S]*?width:\s*var\(--match-carousel-arrow-zone-width\)[\s\S]*?color:\s*#44152f/);
  assert.match(styleSource, /\.carousel\[data-can-move-forward="true"\]::after\s*\{[\s\S]*?right:\s*max\(0px, calc\(\(100% - var\(--match-carousel-viewport-width\)\) \/ 2\)\)[\s\S]*?width:\s*72px[\s\S]*?linear-gradient[\s\S]*?rgba\(255, 255, 255, 0\.88\)/);
  assert.match(styleSource, /\.carousel\[data-can-move-back="true"\]::before\s*\{[\s\S]*?left:\s*max\(0px, calc\(\(100% - var\(--match-carousel-viewport-width\)\) \/ 2\)\)[\s\S]*?width:\s*72px[\s\S]*?linear-gradient[\s\S]*?rgba\(255, 255, 255, 0\.88\)/);
  assert.match(styleSource, /\.carouselButtonBack\s*\{[\s\S]*?left:\s*0/);
  assert.match(styleSource, /\.carouselButtonForward\s*\{[\s\S]*?right:\s*0/);
  assert.match(styleSource, /\.panel\[data-visual-variant="clean"\] \.row > \.card \{[\s\S]*?box-sizing:\s*border-box[\s\S]*?flex:\s*0 0 var\(--match-card-width\)[\s\S]*?grid-template-rows:\s*13px 10px 28px 8px 14px 13px 18px[\s\S]*?width:\s*var\(--match-card-width\)[\s\S]*?min-width:\s*var\(--match-card-width\)[\s\S]*?max-width:\s*var\(--match-card-width\)[\s\S]*?height:\s*var\(--match-card-height\)[\s\S]*?max-height:\s*var\(--match-card-height\)[\s\S]*?padding:\s*12px var\(--match-card-inline-padding\)[\s\S]*?background:\s*#ffffff/);
  assert.match(styleSource, /> \.status\s*\{[\s\S]*?grid-row:\s*1[\s\S]*?width:\s*100%[\s\S]*?height:\s*13px[\s\S]*?font-size:\s*11px[\s\S]*?font-weight:\s*500[\s\S]*?line-height:\s*13px/);
  assert.match(styleSource, /> \.broadcast\s*\{[\s\S]*?grid-row:\s*7[\s\S]*?align-self:\s*end[\s\S]*?justify-content:\s*flex-end[\s\S]*?width:\s*calc\(100% \+ var\(--match-card-inline-padding\)\)[\s\S]*?margin:\s*0 calc\(-1 \* var\(--match-card-inline-padding\)\) 0 0[\s\S]*?padding:\s*0 6px 0 0[\s\S]*?transform:\s*translateY\(-2px\)[\s\S]*?text-align:\s*right/);
  assert.match(styleSource, /> \.broadcast > :global\(\[data-public-match-meta\]\)\s*\{[\s\S]*?justify-content:\s*flex-end[\s\S]*?height:\s*18px[\s\S]*?padding:\s*0[\s\S]*?border:\s*0[\s\S]*?text-align:\s*right/);
  assert.match(styleSource, /> \.broadcast > :global\(\[data-public-match-meta\]\) > :not\(:first-child\) > span\s*\{[\s\S]*?justify-content:\s*flex-end[\s\S]*?transform-origin:\s*right bottom/);
  assert.match(styleSource, /\.teamNames\s*\{[\s\S]*?grid-row:\s*5[\s\S]*?grid-template-columns:\s*repeat\(2, var\(--match-card-team-column-width\)\)[\s\S]*?align-self:\s*stretch[\s\S]*?width:\s*100%[\s\S]*?margin:\s*0[\s\S]*?column-gap:\s*var\(--match-card-gap\)[\s\S]*?height:\s*14px/);
  assert.match(styleSource, /\.teamNames > \.teamName\s*\{[\s\S]*?justify-self:\s*center[\s\S]*?width:\s*max-content[\s\S]*?max-width:\s*none[\s\S]*?overflow:\s*visible[\s\S]*?font-size:\s*12px[\s\S]*?font-weight:\s*600[\s\S]*?line-height:\s*14px[\s\S]*?white-space:\s*nowrap/);
  assert.doesNotMatch(styleSource, /> :not\(:first-child\) :is\(img, picture, svg\)\s*\{[\s\S]*?height:\s*12px/);
});

test("fluid-peek preserva sete jogos claros, esbate o oitavo e alinha o canal pela equipa da direita", async () => {
  const [homeSource, matchdaySource, newsSource, stripSource, carouselSource, styleSource] =
    await Promise.all([
      readFile(homePageUrl, "utf8"),
      readFile(integrationUrls[2], "utf8"),
      readFile(integrationUrls[4], "utf8"),
      readFile(integrationUrls[0], "utf8"),
      readFile(new URL("../components/public/PublicMatchStripCarousel.tsx", import.meta.url), "utf8"),
      readFile(matchStripStylesUrl, "utf8")
    ]);

  assert.match(homeSource, /<PublicMatchStrip[\s\S]*?carouselLayout="fluid-peek"/);
  assert.match(matchdaySource, /<PublicMatchStrip[\s\S]*?carouselLayout="fluid-peek"/);
  assert.doesNotMatch(newsSource, /carouselLayout="fluid-peek"/);
  assert.match(stripSource, /carouselLayout = "fixed"/);
  assert.match(stripSource, /<PublicMatchStripCarousel layout=\{carouselLayout\}>/);
  assert.doesNotMatch(carouselSource, /PEEK_LEADING_OFFSET/);
  assert.match(carouselSource, /const PEEK_TOTAL_CARD_COUNT = 8;/);
  assert.match(carouselSource, /const PEEK_CLEAR_CARD_COUNT = 7;/);
  assert.match(carouselSource, /const PEEK_EDGE_FADE_WIDTH = CARD_WIDTH \/ 2;/);
  assert.match(carouselSource, /const PEEK_CARD_HEIGHT = 98;/);
  assert.match(carouselSource, /\(PEEK_TOTAL_CARD_COUNT \* CARD_WIDTH\)[\s\S]*?\(\(PEEK_TOTAL_CARD_COUNT - 1\) \* CARD_GAP\)/);
  assert.match(carouselSource, /const PEEK_VIEWPORT_WIDTH = PEEK_CONTENT_WIDTH;/);


  assert.match(
    carouselSource,
    /useLayoutEffect\(\(\) => \{\s*if \(layout === "fluid-peek"\) return;[\s\S]*?new ResizeObserver\(updateVisibleCardCount\)/
  );
  assert.match(carouselSource, /querySelectorAll<HTMLElement>\("\[data-public-match-card\]"\)/);
  assert.match(carouselSource, /querySelector<HTMLElement>\("\[data-public-match-away-name\]"\)/);
  assert.match(carouselSource, /querySelector<Element>\("\[data-public-broadcast-logo-visual\]"\)/);
  assert.match(carouselSource, /setProperty\("--public-match-broadcast-shift-x", "0px"\)/);
  assert.match(carouselSource, /Number\(\(awayNameRect\.right - logoVisualRect\.right\)\.toFixed\(2\)\)/);
  assert.match(carouselSource, /setProperty\("--public-match-broadcast-shift-x", `\$\{shiftX\}px`\)/);
  assert.match(carouselSource, /querySelectorAll<Element>\("\[data-public-broadcast-logo-visual\]"\)/);
  assert.match(carouselSource, /observer\?\.observe\(logo\)/);
  assert.match(carouselSource, /const completeCardCount = cardRects\.filter/);
  assert.doesNotMatch(carouselSource, /forwardPartialCard|fallbackPartialWidth|nextCardVisibleFraction/);
  assert.match(carouselSource, /data-complete-card-count=/);
  assert.match(carouselSource, /boundedScrollLeft = Math\.min\(Math\.max\(viewport\.scrollLeft, 0\), maximumScroll\)/);
  assert.match(carouselSource, /targetScroll = Math\.round\(Math\.min\(/);
  assert.match(carouselSource, /data-first-card-start=/);
  assert.match(carouselSource, /data-clear-card-count=\{layout === "fluid-peek" \? PEEK_CLEAR_CARD_COUNT : undefined\}/);
  assert.match(carouselSource, /data-edge-fade-width=\{layout === "fluid-peek" \? PEEK_EDGE_FADE_WIDTH : undefined\}/);
  assert.doesNotMatch(carouselSource, /data-next-card-visible-fraction=/);
  assert.match(carouselSource, /data-peek-content-width=/);
  assert.match(carouselSource, /data-peek-viewport-width=/);
  assert.match(carouselSource, /"--match-carousel-edge-fade-width": `\$\{PEEK_EDGE_FADE_WIDTH\}px`/);
  assert.match(carouselSource, /"--match-carousel-peek-card-height":/);

  const fluidPanelRule = styleSource.match(
    /\.panel\[data-visual-variant="clean"\]\[data-carousel-layout="fluid-peek"\]\s*\{([^}]*)\}/
  )?.[1] ?? "";
  assert.match(fluidPanelRule, /width:\s*calc\(100% \+ 48px\)/);
  assert.match(fluidPanelRule, /margin-inline:\s*-24px/);
  assert.match(fluidPanelRule, /padding-top:\s*0/);
  assert.doesNotMatch(fluidPanelRule, /100vw/);
  assert.match(
    styleSource,
    /\.carousel\[data-carousel-layout="fluid-peek"\]\s*\{[\s\S]*?position:\s*relative[\s\S]*?width:\s*min\([\s\S]*?var\(--match-carousel-peek-viewport-width\)[\s\S]*?2 \* var\(--match-carousel-arrow-zone-width\)[\s\S]*?margin-inline:\s*auto/
  );
  const fluidCarouselRule = styleSource.match(
    /\.carousel\[data-carousel-layout="fluid-peek"\]\s*\{([^}]*)\}/
  )?.[1] ?? "";
  assert.doesNotMatch(fluidCarouselRule, /display:\s*grid|grid-template-columns/);
  assert.match(
    styleSource,
    /\.carousel\[data-carousel-layout="fluid-peek"\]::before,[\s\S]*?\.carousel\[data-carousel-layout="fluid-peek"\]::after\s*\{[\s\S]*?display:\s*none[\s\S]*?content:\s*""[\s\S]*?pointer-events:\s*none/
  );
  assert.match(
    styleSource,
    /@media \(min-width: 761px\) \{[\s\S]*?\.carousel\[data-carousel-layout="fluid-peek"\]\[data-can-move-back="true"\]::before,[\s\S]*?\.carousel\[data-carousel-layout="fluid-peek"\]\[data-can-move-forward="true"\]::after\s*\{[\s\S]*?position:\s*absolute[\s\S]*?inset-block:\s*0[\s\S]*?z-index:\s*1[\s\S]*?display:\s*block[\s\S]*?width:\s*var\(--match-carousel-edge-fade-width\)/
  );
  assert.match(
    styleSource,
    /\.carousel\[data-carousel-layout="fluid-peek"\]\[data-can-move-back="true"\]::before\s*\{[\s\S]*?left:\s*var\(--match-carousel-arrow-zone-width\)[\s\S]*?linear-gradient\([\s\S]*?#ffffff 0%[\s\S]*?rgba\(255, 255, 255, 0\.88\) 28%[\s\S]*?rgba\(255, 255, 255, 0\) 100%/
  );
  assert.match(
    styleSource,
    /\.carousel\[data-carousel-layout="fluid-peek"\]\[data-can-move-forward="true"\]::after\s*\{[\s\S]*?right:\s*var\(--match-carousel-arrow-zone-width\)[\s\S]*?linear-gradient\([\s\S]*?rgba\(255, 255, 255, 0\) 0%[\s\S]*?rgba\(255, 255, 255, 0\.88\) 72%[\s\S]*?#ffffff 100%/
  );
  assert.match(
    styleSource,
    /\.carousel\[data-carousel-layout="fluid-peek"\] \.carouselViewport\s*\{[\s\S]*?width:\s*min\([\s\S]*?var\(--match-carousel-peek-viewport-width\)[\s\S]*?calc\(100% - \(2 \* var\(--match-carousel-arrow-zone-width\)\)\)[\s\S]*?max-width:\s*var\(--match-carousel-peek-viewport-width\)[\s\S]*?margin-inline:\s*auto[\s\S]*?overflow:\s*hidden/
  );
  assert.match(
    styleSource,
    /\.carousel\[data-carousel-layout="fluid-peek"\] \.carouselViewport > \.row\s*\{[\s\S]*?padding-inline:\s*0/
  );
  const fluidCardRule = styleSource.match(
    /\.panel\[data-visual-variant="clean"\]\[data-carousel-layout="fluid-peek"\] \.row > \.card\s*\{([^}]*)\}/
  )?.[1] ?? "";
  assert.match(fluidCardRule, /background:\s*rgba\(68, 21, 47, 0\.13\)/);
  assert.match(fluidCardRule, /grid-template-rows:\s*13px 5px 28px 4px 14px 5px 18px/);
  assert.match(fluidCardRule, /height:\s*var\(--match-carousel-peek-card-height\)/);
  assert.match(
    styleSource,
    /data-carousel-layout="fluid-peek"\] \.row > \.card > \.broadcast\s*\{[\s\S]*?position:\s*absolute[\s\S]*?right:\s*0[\s\S]*?bottom:\s*4px[\s\S]*?width:\s*max-content[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0[\s\S]*?transform:\s*translate\(var\(--public-match-broadcast-shift-x, 0px\), -2px\)/
  );
  assert.match(fluidCardRule, /padding:\s*6px var\(--match-card-inline-padding\) 3px/);
  assert.match(fluidCardRule, /animation:\s*public-match-card-emerge 320ms/);
  assert.match(fluidCardRule, /border-top-left-radius:\s*0/);
  assert.match(fluidCardRule, /border-top-right-radius:\s*0/);
  assert.match(fluidCardRule, /border-bottom-right-radius:\s*10px/);
  assert.match(fluidCardRule, /border-bottom-left-radius:\s*10px/);
  assert.doesNotMatch(fluidCardRule, /\bopacity\s*:/);
  assert.doesNotMatch(styleSource, /match-carousel-peek-inline-gutter|match-carousel-forward-fade|match-carousel-back-fade/);
  assert.match(styleSource, /\.carouselButton\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*50%[\s\S]*?width:\s*var\(--match-carousel-arrow-zone-width\)[\s\S]*?background:\s*transparent/);
  assert.match(styleSource, /\.carouselButtonBack\s*\{[\s\S]*?left:\s*0/);
  assert.match(styleSource, /\.carouselButtonForward\s*\{[\s\S]*?right:\s*0/);
  assert.match(
    styleSource,
    /@media \(max-width: 760px\)[\s\S]*?data-carousel-layout="fluid-peek"[\s\S]*?display:\s*none[\s\S]*?overflow-x:\s*auto/
  );
  assert.match(
    styleSource,
    /@media \(max-width: 760px\)[\s\S]*?data-carousel-layout="fluid-peek"[\s\S]*?width:\s*calc\(100% \+ 32px\)[\s\S]*?\.carousel\[data-carousel-layout="fluid-peek"\][\s\S]*?display:\s*block[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none[\s\S]*?\.carouselViewport[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/
  );
  assert.match(
    styleSource,
    /\.carouselButton\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*50%/
  );
  const arrowButtonRule = styleSource.match(/\.carouselButton\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(arrowButtonRule, /color:\s*#44152f/);
  assert.match(arrowButtonRule, /font-size:\s*31px/);
  assert.match(arrowButtonRule, /font-weight:\s*400/);
  assert.match(arrowButtonRule, /background:\s*transparent/);
  assert.doesNotMatch(arrowButtonRule, /border-radius|box-shadow/);
  assert.match(styleSource, /rgba\(255, 255, 255, 0\.96\)/);
  assert.match(
    matchdaySource,
    /\.public-season-nav-bar\s*\{[\s\S]*?background:\s*#44152f[\s\S]*?box-shadow:\s*0 8px 18px rgba\(68, 21, 47, 0\.16\)[\s\S]*?\}\s*\.public-season-nav-inner\s*\{[\s\S]*?box-sizing:\s*border-box[\s\S]*?align-items:\s*center[\s\S]*?height:\s*74px[\s\S]*?min-height:\s*74px[\s\S]*?padding:\s*8px 0/
  );
});

test("Home e páginas públicas de jornada reutilizam a mesma linha horizontal de equipa", async () => {
  const [homeSource, matchdaySource, stripSource] = await Promise.all([
    readFile(homePageUrl, "utf8"),
    readFile(integrationUrls[2], "utf8"),
    readFile(integrationUrls[0], "utf8")
  ]);
  for (const source of [homeSource, matchdaySource]) {
    assert.match(source, /import PublicMatchStrip/);
    assert.match(source, /<PublicMatchStrip/);
  }
  assert.match(stripSource, /competitionSlug\?: string \| null/);
  assert.match(stripSource, /getPublicMatchStripTheme\(competitionSlug\)/);
  assert.doesNotMatch(
    stripSource,
    /competitionSlug\s*===|competitionSlug\?\.trim\(\)\.toLowerCase\(\)|"liga-portugal"|"premier-league"|"la-liga"/
  );
});

test("layout aprovado não depende de query parameter e a notícia sem jornada não recebe barra", async () => {
  const [homeSource, matchdaySource, newsSource, stripSource] = await Promise.all([
    readFile(homePageUrl, "utf8"),
    readFile(integrationUrls[2], "utf8"),
    readFile(integrationUrls[4], "utf8"),
    readFile(integrationUrls[0], "utf8")
  ]);
  for (const source of [homeSource, matchdaySource, newsSource, stripSource]) {
    assert.doesNotMatch(source, /layoutJogos|layoutVariant|adjusted-preview|adjustedPreview/);
  }
  assert.match(
    homeSource,
    /<PublicMatchStrip[\s\S]*?matches=\{featuredMatches\.slice\(0, 8\)\}/,
  );
  assert.match(matchdaySource, /<PublicMatchStrip[\s\S]*?matches=\{context\.matchesForMatchday\.map/);
  assert.doesNotMatch(matchdaySource, /showActiveCompetitionLogo=\{false\}/);
  assert.doesNotMatch(matchdaySource, /className="public-season-competition-emblem"/);
  assert.doesNotMatch(matchdaySource, /resolvePublicCompetitionLogoPresentation\(currentCompetitionMenuItem\)/);
  assert.match(matchdaySource, /<PublicCompetitionNavigation[\s\S]*?classificationHref="#classificacao"[\s\S]*?showMessageTicker=\{false\}/);
  assert.match(newsSource, /if \(!article\.matchday_id\) \{\s*return null;/);
  assert.match(newsSource, /articleMatches\.length > 0 \? \([\s\S]*?<PublicMatchStrip/);
});

test("todas as ocorrencias publicas da faixa usam a variante clean partilhada", async () => {
  const [homeSource, matchdaySource, newsSource, stripSource] = await Promise.all([
    readFile(homePageUrl, "utf8"),
    readFile(integrationUrls[2], "utf8"),
    readFile(integrationUrls[4], "utf8"),
    readFile(integrationUrls[0], "utf8")
  ]);
  for (const source of [homeSource, matchdaySource, newsSource]) {
    assert.match(source, /<PublicMatchStrip[\s\S]*?variant="clean"/);
  }
  assert.match(stripSource, /variant = "clean"/);
  assert.match(newsSource, /if \(!article\.matchday_id\) \{\s*return null;/);
  assert.match(newsSource, /articleMatches\.length > 0 \? \([\s\S]*?<PublicMatchStrip/);
  assert.doesNotMatch(newsSource, /\.news-article-games-strip\s*\{|\.news-article-games-strip \.public-matchday-mini-card/);
});

test("a Home não recorta a área partilhada nem reduz o logótipo", async () => {
  const [homeSource, homeStyles] = await Promise.all([
    readFile(integrationUrls[0], "utf8"),
    readFile(publicEditorialStylesUrl, "utf8")
  ]);
  assert.match(homeSource, /<PublicMatchMeta/);
  assert.doesNotMatch(homeSource, /width:\s*(?:4[0-9]|5[0-3])|height:\s*1[0-7]|scale\(/);
  assert.match(homeStyles, /\.public-matchday-mini-card \.public-matchday-mini-status\s*\{[\s\S]*?overflow:\s*visible/);
});

test("a faixa compacta alinha Sport TV, BTV e TVI a esquerda", async () => {
  const [componentSource, metaStyles, helperSource] = await Promise.all([
    readFile(matchMetaComponentUrl, "utf8"),
    readFile(matchMetaStylesUrl, "utf8"),
    readFile(helperUrl, "utf8")
  ]);
  assert.match(componentSource, /const isSportTvChannel = isSportTvBroadcastChannel\(channelName\)/);
  assert.match(componentSource, /data-public-match-channel-family=\{isSportTvChannel \? "sport-tv" : undefined\}/);
  assert.match(metaStyles, /\.compact\s*\{[\s\S]*?text-align:\s*left/);
  assert.match(metaStyles, /\.compact \.channel > span\s*\{[\s\S]*?justify-content:\s*flex-start[\s\S]*?transform-origin:\s*left center/);
  for (const name of ["Sport TV 1", "Sport TV 2", "Sport TV 3", "Sport TV 4", "Sport TV 5", "Sport TV 6", "Sport TV 7", "Sport TV+"]) {
    assert.equal(isSportTvBroadcastChannel(name), true);
  }
  for (const name of ["BTV", "RTP1", "TVI", "DAZN 1", "Canal 11", "Outro canal", null]) {
    assert.equal(isSportTvBroadcastChannel(name), false);
  }
  assert.match(helperSource, /\["sport tv 1", \{ opticalScale: 1\.14, contrastMode: "light-logo", slotMinWidth: 64 \}\]/);
});

test("as cinco superfícies públicas reutilizam o contrato partilhado sem layout local divergente", async () => {
  const sources = await Promise.all(integrationUrls.map((url) => readFile(url, "utf8")));
  for (const source of sources.slice(0, 4)) {
    assert.match(source, /import PublicMatchMeta from "@\/components\/public\/PublicMatchMeta"/);
    assert.match(source, /<PublicMatchMeta/);
    assert.doesNotMatch(source, /compactTvLabel|SportTV/);
    assert.doesNotMatch(source, /Sem transmissão|Sem canal/);
    assert.doesNotMatch(source, /public-matchday-mini-separator|public-games-meta-copy|public-games-meta-channel|public-game-tv/);
  }
  assert.match(sources[4], /import PublicMatchStrip from "@\/components\/public\/PublicMatchStrip"/);
  assert.match(sources[4], /<PublicMatchStrip/);
  assert.doesNotMatch(sources[4], /ArticleMatchCard|news-article-game-card|import PublicMatchMeta/);
});

test("não permanece imagem de canal com alt vazio nem texto redundante no PublicGamesPage", async () => {
  const source = await readFile(integrationUrls[1], "utf8");
  assert.doesNotMatch(source, /broadcastChannel\?\.logo_url \? <img/);
  assert.doesNotMatch(source, /<span>\{channelName\}<\/span>/);
  assert.match(source, /channelLogoUrl=\{game\.broadcastChannel\?\.logo_url\}/);
  assert.match(source, /channelName=\{channelName\}/);
});

test("integrações usam a mesma variante matchMeta e mantêm os estados atuais", async () => {
  const sources = await Promise.all(integrationUrls.map((url) => readFile(url, "utf8")));
  const combined = sources.join("\n");
  assert.match(await readFile(matchMetaComponentUrl, "utf8"), /variant="matchMeta"/);
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
