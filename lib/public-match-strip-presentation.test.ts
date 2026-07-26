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
    lowerScore: null,
    showChannel: true
  });
});

test("direto 0-0 substitui VS e usa minuto publico com canal", () => {
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
    lowerScore: null,
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
    lowerScore: null,
    showChannel: true
  });
});

test("finalizado move resultado para a linha inferior e oculta o canal", () => {
  assert.deepEqual(getPublicMatchStripPresentation(match({
    status: "finished",
    home_score: 1,
    away_score: 0
  }), NOW), {
    kind: "finished",
    statusLabel: "Finalizado",
    center: { kind: "empty" },
    status: { kind: "label", label: "Finalizado" },
    lowerScore: "1\u20130",
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
  assert.equal(presentation.lowerScore, "0\u20130");
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
    assert.equal(presentation.lowerScore, null);
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
    assert.equal(presentation.lowerScore, null);
    assert.equal(presentation.showChannel, true);
  }
});

test("resultado com dois algarismos usa en dash sem perder valores", () => {
  assert.equal(formatPublicMatchStripScore(10, 9), "10\u20139");
  assert.equal(formatPublicMatchStripScore(0, 0), "0\u20130");
  assert.equal(formatPublicMatchStripScore(1, 0), "1\u20130");
  assert.equal(formatPublicMatchStripScore(2, 2), "2\u20132");
});

test("quatro consumidores usam a barra partilhada e a grelha grande fica separada", async () => {
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
    newsSource,
    gamesSource
  ]) {
    assert.match(source, /import PublicMatchStrip/);
    assert.match(source, /<PublicMatchStrip/);
  }

  assert.match(gamesSource, /function ReferenceGamesCard\(/);
  assert.match(
    gamesSource,
    /group\.matches\.map\(\(match\) => \(\s*<ReferenceGamesCard/
  );
  assert.doesNotMatch(componentSource, /setInterval|setTimeout|fetch\(/);
  assert.doesNotMatch(componentSource, /homeCompactName.*home_score|awayCompactName.*away_score/);
  assert.doesNotMatch(componentSource, /Versus|>\s*VS\s*</);
  assert.doesNotMatch(stylesSource, /\.versus\b/);
  assert.match(componentSource, /`\$\{styles\.score\} \$\{styles\.scheduledSeparator\}`/);
  assert.match(componentSource, /presentation\.lowerScore !== null/);
  assert.match(componentSource, /className=\{styles\.finishedScore\}/);
  assert.match(stylesSource, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*2px\s*minmax\(0,\s*1fr\)/);
  assert.match(stylesSource, /\.row > \.card > \.team:first-of-type\s*\{[\s\S]*?grid-column:\s*1/);
  assert.match(stylesSource, /\.row > \.card > \.team:nth-of-type\(2\)\s*\{[\s\S]*?grid-column:\s*3/);
  assert.match(stylesSource, /grid-template-rows:\s*52px 28px/);
  assert.match(stylesSource, /\.score\s*\{[\s\S]*?max-width:\s*54px;[\s\S]*?overflow:\s*hidden;[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(stylesSource, /\.scheduledSeparator\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?font-weight:\s*800/);
  assert.match(stylesSource, /\.finishedScore\s*\{[\s\S]*?grid-row:\s*2;[\s\S]*?height:\s*18px;[\s\S]*?font-variant-numeric:\s*tabular-nums/);
});
