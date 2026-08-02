import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatPublicMatchStripScore,
  getPublicMatchStripPresentation,
  type PublicMatchStripPresentationInput
} from "@/lib/public-match-strip-presentation";

const NOW = new Date("2026-07-26T20:05:30.000Z");

function match(
  overrides: Partial<PublicMatchStripPresentationInput> = {}
): PublicMatchStripPresentationInput {
  return {
    status: "scheduled",
    minute: null,
    live_started_at: null,
    live_base_minute: null,
    is_clock_running: false,
    home_score: null,
    away_score: null,
    ...overrides
  };
}

test("agendado mostra apenas traco central e mantem horario e canal", () => {
  assert.deepEqual(getPublicMatchStripPresentation(match(), NOW), {
    kind: "scheduled",
    statusLabel: "Agendado",
    center: { kind: "placeholder", text: "-" },
    status: { kind: "schedule" },
    finishedScore: null,
    showChannel: true
  });
});

test("direto 0-0 usa resultado central e minuto publico com canal", () => {
  assert.deepEqual(getPublicMatchStripPresentation(match({
    status: "live",
    minute: 0,
    home_score: 0,
    away_score: 0
  }), NOW), {
    kind: "live",
    statusLabel: "Live",
    center: { kind: "score", text: "0\u20130" },
    status: { kind: "live", label: "Live", minute: 0 },
    finishedScore: null,
    showChannel: true
  });
});

test("direto 1-0 apresenta apenas o resultado central formatado", () => {
  const presentation = getPublicMatchStripPresentation(match({
    status: "live",
    minute: 22,
    home_score: 1,
    away_score: 0
  }), NOW);

  assert.deepEqual(presentation.center, { kind: "score", text: "1\u20130" });
});

test("relogio a correr reutiliza minuto base e instante de inicio", () => {
  const presentation = getPublicMatchStripPresentation(match({
    status: "live",
    minute: 3,
    live_started_at: "2026-07-26T20:00:00.000Z",
    live_base_minute: 40,
    is_clock_running: true,
    home_score: 2,
    away_score: 2
  }), NOW);

  assert.deepEqual(presentation.status, {
    kind: "live",
    label: "Live",
    minute: 45
  });
});

test("relogio pausado mantem minuto base e canal visivel", () => {
  const presentation = getPublicMatchStripPresentation(match({
    status: "live",
    minute: 58,
    live_started_at: "2026-07-26T19:30:00.000Z",
    live_base_minute: 63,
    is_clock_running: false,
    home_score: 2,
    away_score: 2
  }), NOW);

  assert.deepEqual(presentation.status, {
    kind: "live",
    label: "Live",
    minute: 63
  });
  assert.equal(presentation.showChannel, true);
});

test("intervalo apresenta resultado, terminologia anterior e canal", () => {
  assert.deepEqual(getPublicMatchStripPresentation(match({
    status: "halftime",
    minute: 45,
    home_score: 2,
    away_score: 2
  }), NOW), {
    kind: "halftime",
    statusLabel: "Intervalo",
    center: { kind: "score", text: "2\u20132" },
    status: { kind: "label", label: "Intervalo" },
    finishedScore: null,
    showChannel: true
  });
});

test("finalizado separa os marcadores por lado e oculta o canal", () => {
  assert.deepEqual(getPublicMatchStripPresentation(match({
    status: "finished",
    home_score: 1,
    away_score: 0
  }), NOW), {
    kind: "finished",
    statusLabel: "Finalizado",
    center: { kind: "empty" },
    status: { kind: "label", label: "Finalizado" },
    finishedScore: { left: "1", right: "0" },
    showChannel: false
  });
});

test("finalizado sem canal conserva a mesma apresentacao sem inventar espaco textual", () => {
  const presentation = getPublicMatchStripPresentation(match({
    status: "finished",
    home_score: 0,
    away_score: 0
  }), NOW);

  assert.equal(presentation.showChannel, false);
  assert.deepEqual(presentation.center, { kind: "empty" });
  assert.deepEqual(presentation.status, {
    kind: "label",
    label: "Finalizado"
  });
  assert.deepEqual(presentation.finishedScore, { left: "0", right: "0" });
});

test("marcador incompleto deixa o centro vazio sem fabricar resultado", () => {
  for (const input of [
    match({ status: "live", home_score: 1, away_score: null }),
    match({ status: "halftime", home_score: null, away_score: 0 }),
    match({ status: "finished", home_score: null, away_score: null })
  ]) {
    const presentation = getPublicMatchStripPresentation(input, NOW);

    assert.deepEqual(
      presentation.center,
      { kind: "empty" }
    );
    assert.equal(presentation.finishedScore, null);
  }
});

test("adiado e cancelado preservam fallback agendado sem inferir estado pelo marcador", () => {
  for (const [status, label] of [
    ["postponed", "Adiado"],
    ["cancelled", "Cancelado"]
  ] as const) {
    const presentation = getPublicMatchStripPresentation(match({
      status,
      home_score: 4,
      away_score: 3
    }), NOW);

    assert.equal(presentation.kind, "scheduled");
    assert.equal(presentation.statusLabel, label);
    assert.deepEqual(presentation.center, { kind: "empty" });
    assert.deepEqual(presentation.status, { kind: "schedule" });
    assert.equal(presentation.finishedScore, null);
    assert.equal(presentation.showChannel, true);
  }
});

test("resultado com dois algarismos usa en dash sem perder valores", () => {
  assert.equal(formatPublicMatchStripScore(10, 9), "10\u20139");
  assert.equal(formatPublicMatchStripScore(0, 0), "0\u20130");
  assert.equal(formatPublicMatchStripScore(1, 0), "1\u20130");
  assert.equal(formatPublicMatchStripScore(2, 2), "2\u20132");
});

test("a barra partilhada permanece nos contextos validos e o separador Jogos mantem apenas a grelha grande", async () => {
  const [
    componentSource,
    stylesSource,
    homeSource,
    competitionSource,
    newsSource,
    gamesSource
  ] = await Promise.all([
    readFile(new URL("../components/public/PublicMatchStrip.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/public/PublicMatchStrip.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(new URL("../app/noticias/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx",
        import.meta.url
      ),
      "utf8"
    )
  ]);

  for (const source of [
    homeSource,
    competitionSource,
    newsSource
  ]) {
    assert.match(source, /import PublicMatchStrip/);
    assert.match(source, /<PublicMatchStrip/);
  }

  assert.match(homeSource, /<PublicMatchStrip matches=\{featuredMatches\} variant="home" \/>/);
  assert.match(componentSource, /variant\?: PublicMatchStripVariant/);
  assert.match(componentSource, /data-visual-variant=\{visualVariant\}/);
  assert.match(componentSource, /visualVariant !== "home"/);
  assert.match(componentSource, /--public-match-home-backdrop-image/);
  assert.match(componentSource, /--public-match-away-backdrop-image/);
  assert.match(stylesSource, /\.panel\[data-visual-variant="home"\] \.row > \.card::before/);
  assert.match(stylesSource, /var\(--public-match-home-backdrop-image\)/);
  assert.match(stylesSource, /var\(--public-match-away-backdrop-image\)/);
  assert.match(stylesSource, /clip-path: polygon\(0 0, 100% 0, 82% 100%, 0 100%\)/);

  assert.doesNotMatch(gamesSource, /import PublicMatchStrip|<PublicMatchStrip/);
  assert.doesNotMatch(gamesSource, /public-matchday-strip|data-matchday-strip/);
  assert.match(gamesSource, /import PublicMatchdayNavigation/);
  assert.match(gamesSource, /<PublicMatchdayNavigation/);
  assert.match(gamesSource, /<strong>Jogos da jornada<\/strong>/);
  assert.match(gamesSource, /\{ key: "scheduled", label: "Agendados", matches: scheduledMatches \}/);
  assert.match(gamesSource, /function ReferenceGamesCard\(/);
  assert.match(
    gamesSource,
    /group\.matches\.map\(\(match\) => \(\s*<ReferenceGamesCard/
  );
  assert.match(
    gamesSource,
    /<section className="public-games-page-head"[\s\S]*?<\/section>\s*<div className="public-games-layout">/
  );
  assert.doesNotMatch(componentSource, /setInterval|setTimeout|fetch\(/);
  assert.doesNotMatch(componentSource, /homeCompactName.*home_score|awayCompactName.*away_score/);
  assert.doesNotMatch(componentSource, /Versus|>\s*VS\s*</);
  assert.doesNotMatch(stylesSource, /\.versus\b/);
  assert.match(componentSource, /`\$\{styles\.score\} \$\{styles\.scheduledSeparator\}`/);
  assert.match(componentSource, /const activeScore = presentation\.center\.kind === "score"/);
  assert.match(componentSource, /className=\{styles\.statusScore\}>\{activeScore\}<\/strong>/);
  assert.match(componentSource, /className=\{styles\.halftimeStatus\}/);
  assert.match(componentSource, /const finishedScoreText = presentation\.finishedScore !== null/);
  assert.match(componentSource, /className=\{styles\.finishedScore\}/);
  assert.doesNotMatch(componentSource, /public-matchday-live-label/);
  assert.doesNotMatch(componentSource, /finishedLabel|finishedSideScore|finishedScoreSeparator/);
  assert.match(componentSource, /presentation\.center\.kind === "placeholder"/);
  assert.match(stylesSource, /\.liveStatus,\s*\n\.halftimeStatus\s*\{[\s\S]*?align-items:\s*baseline/);
  assert.match(stylesSource, /\.finishedMeta\s*\{[\s\S]*?transform:\s*translateY\(-3px\)/);
  assert.match(stylesSource, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*2px\s*minmax\(0,\s*1fr\)/);
  assert.match(stylesSource, /\.row > \.card > \.team:first-of-type\s*\{[\s\S]*?grid-column:\s*1/);
  assert.match(stylesSource, /\.row > \.card > \.team:nth-of-type\(2\)\s*\{[\s\S]*?grid-column:\s*3/);
  assert.match(stylesSource, /grid-template-rows:\s*48px 32px/);
  assert.match(stylesSource, /\.score\s*\{[\s\S]*?max-width:\s*54px;[\s\S]*?overflow:\s*hidden;[\s\S]*?font-size:\s*clamp\(19px,\s*14cqi,\s*22px\);[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(stylesSource, /\.scheduledSeparator\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?font-weight:\s*800/);
  assert.match(stylesSource, /\.liveStatus,\s*\.halftimeStatus\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?justify-content:\s*center/);
  assert.match(stylesSource, /\.statusScore\s*\{[\s\S]*?font-size:\s*clamp\(14\.5px,\s*10\.5cqi,\s*16px\);[\s\S]*?font-variant-numeric:\s*tabular-nums;[\s\S]*?letter-spacing:\s*0\.1em/);
  assert.match(stylesSource, /\.liveStatus :global\(\.public-matchday-live-minute\),\s*\.halftimeStatus \.stateLabel:global\(\.public-matchday-live-minute\)\s*\{[\s\S]*?color:\s*#16a34a;[\s\S]*?font-size:\s*10px/);
  assert.match(stylesSource, /\.finishedScore\s*\{[\s\S]*?font-size:\s*clamp\(18px,\s*12\.5cqi,\s*21px\);[\s\S]*?font-variant-numeric:\s*tabular-nums;[\s\S]*?letter-spacing:\s*0\.1em/);
  assert.match(stylesSource, /\.row > \.card > \.status > \.finishedMeta\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*?height:\s*32px/);
  assert.match(stylesSource, /public-matchday-mini-card-live[\s\S]*?grid-template-rows:\s*10px 20px/);
  assert.match(stylesSource, /public-matchday-mini-card-live[^}]*\.liveStatus\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?gap:\s*4px/);
  assert.match(stylesSource, /public-matchday-mini-card-live[^}]*\.statusScore\s*\{[\s\S]*?font-size:\s*clamp\(14\.5px,\s*10\.5cqi,\s*16px\);[\s\S]*?letter-spacing:\s*0\.1em/);
  assert.match(stylesSource, /public-matchday-mini-card-live[^}]*public-matchday-live-minute[\s\S]*?align-items:\s*center;[\s\S]*?top:\s*1px/);
  assert.doesNotMatch(stylesSource, /public-matchday-mini-card-live[\s\S]*?grid-template-rows:\s*8px 20px/);
  assert.doesNotMatch(stylesSource, /public-matchday-mini-card-live[\s\S]*?font-size:\s*7\.75px/);
  assert.doesNotMatch(stylesSource, /\.finishedLabel\b|\.finishedSideScore\b|\.finishedScoreSeparator\b/);
});
