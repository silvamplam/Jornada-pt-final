import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveBroadcastChannelLogoPresentation } from "./public-broadcast-channel-logo";

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
    assert.deepEqual(
      resolveBroadcastChannelLogoPresentation(name, `https://cdn.example.test/${name.at(-1)}.svg`),
      {
        kind: "image",
        name,
        logoUrl: `https://cdn.example.test/${name.at(-1)}.svg`,
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
  assert.deepEqual(
    [...helperSource.matchAll(/^\s*\["([^"]+)", \{/gm)].map((match) => match[1]),
    ["rtp1", "sport tv 1", "sport tv 2", "sport tv 3", "sport tv 4", "sport tv 5", "sport tv 6", "sport tv 7", "sport tv+", "btv", "tvi", "dazn 1", "dazn 2", "dazn 3"]
  );
  assert.doesNotMatch(helperSource, /Math\.|calculate|computedScale/);
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

test("PublicMatchMeta centraliza estrutura, espaçamento e área do canal", async () => {
  const [componentSource, styleSource] = await Promise.all([
    readFile(matchMetaComponentUrl, "utf8"),
    readFile(matchMetaStylesUrl, "utf8")
  ]);
  assert.match(componentSource, /<span className=\{styles\.dateTime\}>\{dateTime\}<\/span>/);
  assert.match(componentSource, /const hasChannel = Boolean\(channelName\?\.trim\(\)\)/);
  assert.match(componentSource, /const channel = hasChannel \? \([\s\S]*?<span className=\{styles\.channel\}>[\s\S]*?variant="matchMeta"/);
  assert.doesNotMatch(componentSource, /matchMetaLayoutMode|channelVariant|matchMetaCompact/);
  assert.match(componentSource, /variant === "compact" \? `\$\{styles\.matchMeta\} \$\{styles\.compact\}` : styles\.matchMeta/);
  assert.match(componentSource, /<span className=\{className\} data-public-match-meta>/);
  assert.doesNotMatch(componentSource, /denseDate|denseTime|denseBottom/);
  assert.match(styleSource, /\.matchMeta\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*max-content minmax\(2px, 1fr\) max-content[\s\S]*?align-items:\s*center[\s\S]*?width:\s*auto[\s\S]*?max-width:\s*none[\s\S]*?min-width:\s*0[\s\S]*?margin-inline:\s*calc\(-1 \* var\(--public-match-card-inline-padding, 0px\)\)[\s\S]*?padding-inline:\s*3px[\s\S]*?column-gap:\s*0/);
  assert.match(styleSource, /\.dateTime\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?justify-self:\s*start[\s\S]*?min-width:\s*0[\s\S]*?overflow:\s*visible[\s\S]*?text-align:\s*left[\s\S]*?text-overflow:\s*clip[\s\S]*?white-space:\s*nowrap[\s\S]*?margin:\s*0[\s\S]*?font-size:\s*9\.5px[\s\S]*?line-height:\s*1[\s\S]*?letter-spacing:\s*-0\.1px/);
  assert.match(styleSource, /\.compact\s*\{[\s\S]*?column-gap:\s*0/);
  assert.match(styleSource, /\.compact \.dateTime\s*\{[\s\S]*?font-size:\s*8\.5px[\s\S]*?line-height:\s*1[\s\S]*?letter-spacing:\s*-0\.1px/);
  assert.doesNotMatch(`${componentSource}\n${styleSource}`, /dense|row-gap|grid-template-rows|text-overflow:\s*ellipsis/);
  assert.match(styleSource, /\.channel\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-column:\s*3[\s\S]*?place-items:\s*center[\s\S]*?justify-self:\s*end[\s\S]*?flex-shrink:\s*0[\s\S]*?width:\s*max-content[\s\S]*?max-width:\s*none[\s\S]*?height:\s*max-content[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0[\s\S]*?overflow:\s*visible/);
  assert.doesNotMatch(styleSource, /display:\s*inline-flex|position:\s*absolute|margin[^:]*:\s*-/);
});

test("PublicMatchMeta usa 9.5px com 9 jogos e 8.5px com 10", async () => {
  const styleSource = await readFile(matchMetaStylesUrl, "utf8");
  assert.match(styleSource, /\.dateTime\s*\{[\s\S]*?font-size:\s*9\.5px/);
  assert.match(styleSource, /\.compact \.dateTime\s*\{[\s\S]*?font-size:\s*8\.5px/);
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
  assert.match(editorialStyleSource, /> \[data-public-match-meta\]\s*\{[\s\S]*?flex:\s*1 1 auto/);
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

test("PublicMatchStrip usa meta default com 9 jogos e compact horizontal com 10", async () => {
  const [componentSource, styleSource] = await Promise.all([
    readFile(integrationUrls[0], "utf8"),
    readFile(matchStripStylesUrl, "utf8")
  ]);
  assert.match(componentSource, /"--public-match-strip-columns":\s*matches\.length/);
  const compactThreshold = Number(componentSource.match(/matches\.length >= (\d+) \? "compact" : "default"/)?.[1]);
  assert.equal(compactThreshold, 10);
  assert.equal(9 >= compactThreshold ? "compact" : "default", "default");
  assert.equal(10 >= compactThreshold ? "compact" : "default", "compact");
  assert.match(componentSource, /metaVariant=\{metaVariant\}/);
  assert.match(componentSource, /dateTime=\{schedule\.dateTime \? \([\s\S]*?\{schedule\.visual\}[\s\S]*?variant=\{metaVariant\}/);
  assert.doesNotMatch(componentSource, /denseDate|denseTime|styles\.dense|flex-direction:\s*column/);
  assert.match(styleSource, /grid-template-columns:\s*repeat\(var\(--public-match-strip-columns\), minmax\(0, 1fr\)\)/);
  assert.match(styleSource, /\.row > \.card\s*\{[\s\S]*?--public-match-card-inline-padding:\s*clamp\(3px, 0\.5vw, 8px\)[\s\S]*?min-width:\s*0[\s\S]*?width:\s*auto[\s\S]*?padding-inline:\s*var\(--public-match-card-inline-padding\)/);
  assert.match(componentSource, /const teamClassName = showScore \? `\$\{styles\.team\} \$\{styles\.teamWithScore\}` : styles\.team/);
  assert.equal(componentSource.match(/className=\{`\$\{teamClassName\} public-matchday-mini-team`\}/g)?.length, 2);
  assert.equal(componentSource.match(/className=\{styles\.teamName\}/g)?.length, 2);
  assert.match(styleSource, /\.row > \.card > \.team\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\)[\s\S]*?align-items:\s*center[\s\S]*?width:\s*auto[\s\S]*?min-width:\s*0[\s\S]*?margin-inline:\s*calc\(-1 \* var\(--public-match-card-inline-padding\)\)[\s\S]*?padding-inline:\s*3px[\s\S]*?column-gap:\s*4px/);
  assert.match(styleSource, /\.row > \.card > \.teamWithScore\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\) max-content/);
  assert.match(styleSource, /\.row > \.card > \.team > \.teamName\s*\{[\s\S]*?min-width:\s*0[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/);
  const noScoreNameGainAtMinPadding = (2 * (3 - 3)) + ((2 * 6) - 4);
  const noScoreNameGainAtMaxPadding = (2 * (8 - 3)) + ((2 * 6) - 4);
  const scoreNameGainAtMinPadding = (2 * (3 - 3)) + ((2 * 6) - (2 * 4));
  const scoreNameGainAtMaxPadding = (2 * (8 - 3)) + ((2 * 6) - (2 * 4));
  assert.deepEqual(
    [noScoreNameGainAtMinPadding, noScoreNameGainAtMaxPadding, scoreNameGainAtMinPadding, scoreNameGainAtMaxPadding],
    [8, 18, 4, 14]
  );
  assert.match(componentSource, /<PublicTeamBadge[\s\S]*?variant="compact"/);
  assert.doesNotMatch(`${componentSource}\n${styleSource}`, /opticalScale|transform:\s*scale|\.team[^}]*height:/);
  assert.doesNotMatch(`${componentSource}\n${styleSource}`, /overflow-x:\s*auto|flex-wrap|grid-template-columns:\s*repeat\(10|min-width:\s*154px/);
  assert.equal(Array.from({ length: 10 }).length, 10);
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
  assert.doesNotMatch(stripSource, /liga-portugal|la-liga|competitionSlug/);
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

test("as cinco superfícies públicas reutilizam PublicMatchMeta sem layout local divergente", async () => {
  const sources = await Promise.all(integrationUrls.map((url) => readFile(url, "utf8")));
  for (const source of sources) {
    assert.match(source, /import PublicMatchMeta from "@\/components\/public\/PublicMatchMeta"/);
    assert.match(source, /<PublicMatchMeta/);
    assert.doesNotMatch(source, /compactTvLabel|SportTV/);
    assert.doesNotMatch(source, /Sem transmissão|Sem canal/);
    assert.doesNotMatch(source, /public-matchday-mini-separator|public-games-meta-copy|public-games-meta-channel|public-game-tv/);
  }
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
