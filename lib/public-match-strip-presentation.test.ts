import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatPublicMatchStripScore,
  getPublicMatchStripPresentation,
  type PublicMatchStripPresentationInput
} from "@/lib/public-match-strip-presentation";
import {
  ARROW_ZONE_WIDTH,
  CARD_BORDER_WIDTH,
  CARD_GAP,
  CARD_HEIGHT,
  CARD_INLINE_PADDING,
  CARD_STEP,
  CARD_TEAM_COLUMN_WIDTH,
  CARD_WIDTH,
  VISIBLE_CARD_COUNTS,
  getMatchCarouselShellWidth,
  getMatchCarouselViewportWidth,
  selectMatchCarouselVisibleCardCount
} from "@/lib/public-match-strip-carousel-geometry";

const NOW = new Date("2026-07-26T20:05:30.000Z");

test("geometria contínua reserva a largura das setas e mantém células inteiras", () => {
  assert.equal(CARD_WIDTH, 147);
  assert.equal(CARD_HEIGHT, 88);
  assert.equal(CARD_GAP, 0);
  assert.equal(CARD_STEP, 147);
  assert.equal(CARD_INLINE_PADDING, 6);
  assert.equal(CARD_BORDER_WIDTH, 1);
  assert.equal(CARD_TEAM_COLUMN_WIDTH, 66.5);
  assert.equal(ARROW_ZONE_WIDTH, 28);
  assert.deepEqual(VISIBLE_CARD_COUNTS, [8, 6, 4, 2, 1]);
  assert.deepEqual(
    VISIBLE_CARD_COUNTS.map((count) => getMatchCarouselViewportWidth(count)),
    [1176, 882, 588, 294, 147]
  );
  assert.deepEqual(
    VISIBLE_CARD_COUNTS.map((count) => getMatchCarouselShellWidth(count)),
    [1232, 938, 644, 350, 203]
  );

  for (const [availableWidth, expectedCount] of [
    [1920, 8], [1232, 8], [1231, 6], [1176, 6],
    [938, 6], [937, 4], [882, 4],
    [644, 4], [643, 2], [588, 2],
    [350, 2], [349, 1], [294, 1], [203, 1], [0, 1]
  ] as const) {
    assert.equal(selectMatchCarouselVisibleCardCount(availableWidth), expectedCount);
    if (availableWidth >= getMatchCarouselShellWidth(1)) {
      assert.ok(getMatchCarouselShellWidth(expectedCount) <= availableWidth);
    }
  }
});

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

test("adiado tem estado proprio, sem resultado nem canal", () => {
  assert.deepEqual(getPublicMatchStripPresentation(match({
    status: "postponed",
    home_score: 4,
    away_score: 3
  }), NOW), {
    kind: "postponed",
    statusLabel: "Adiado",
    center: { kind: "empty" },
    status: { kind: "label", label: "Adiado" },
    finishedScore: null,
    showChannel: false
  });
});

test("cancelado conserva fallback agendado sem inferir resultado", () => {
  const presentation = getPublicMatchStripPresentation(match({
    status: "cancelled",
    home_score: 4,
    away_score: 3
  }), NOW);

  assert.equal(presentation.kind, "scheduled");
  assert.equal(presentation.statusLabel, "Cancelado");
  assert.deepEqual(presentation.center, { kind: "empty" });
  assert.deepEqual(presentation.status, { kind: "schedule" });
  assert.equal(presentation.finishedScore, null);
  assert.equal(presentation.showChannel, true);
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

  assert.match(
    homeSource,
    /<PublicMatchStrip[\s\S]*?carouselLayout="fluid-peek"[\s\S]*?matches=\{featuredMatches\.slice\(0, 8\)\}[\s\S]*?variant="clean"/
  );
  assert.match(competitionSource, /className="public-league-match-strip-scroll"[\s\S]*?<PublicMatchStrip[\s\S]*?carouselLayout="fluid-peek"/);
  assert.match(competitionSource, /<PublicMatchStrip[\s\S]*?variant="clean"/);
  assert.doesNotMatch(competitionSource, /<PublicMatchStrip[\s\S]*?competitionSlug=/);
  assert.doesNotMatch(competitionSource, /className="public-home-match-strip-static"/);
  assert.match(newsSource, /<PublicMatchStrip[\s\S]*?variant="clean"/);
  assert.match(componentSource, /type PublicMatchStripVariant = "default" \| "home" \| "clean"/);
  assert.match(componentSource, /variant\?: PublicMatchStripVariant/);
  assert.match(componentSource, /data-visual-variant=\{visualVariant\}/);
  assert.match(componentSource, /visualVariant !== "home"/);
  assert.match(componentSource, /--public-match-home-backdrop-image/);
  assert.match(componentSource, /--public-match-away-backdrop-image/);
  assert.match(stylesSource, /\.panel\[data-visual-variant="home"\] \.row > \.card::before/);
  assert.match(stylesSource, /var\(--public-match-home-backdrop-image\)/);
  assert.match(stylesSource, /var\(--public-match-away-backdrop-image\)/);
  assert.match(stylesSource, /clip-path: polygon\(0 0, 100% 0, 82% 100%, 0 100%\)/);
  const cleanStyles = stylesSource.slice(stylesSource.indexOf('.panel[data-visual-variant="clean"]'));
  const panelRule = cleanStyles.match(/\.panel\[data-visual-variant="clean"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  const cardRule = cleanStyles.match(/\.panel\[data-visual-variant="clean"\] \.row > \.card\s*\{([^}]*)\}/)?.[1] ?? "";
  const viewportRule = cleanStyles.match(/\.carouselViewport\s*\{([^}]*)\}/)?.[1] ?? "";
  const trackRule = cleanStyles.match(/\.carouselViewport > \.row\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(panelRule, /width:\s*100%/);
  assert.match(panelRule, /max-width:\s*1232px/);
  assert.match(panelRule, /background:\s*#ffffff/);
  assert.match(cardRule, /flex:\s*0 0 var\(--match-card-width\)/);
  assert.match(cardRule, /height:\s*var\(--match-card-height\)/);
  assert.match(cardRule, /grid-template-columns:\s*24px minmax\(0, 1fr\) 18px/);
  assert.match(cardRule, /grid-template-rows:\s*16px 24px 24px 18px/);
  assert.match(cardRule, /padding:\s*3px var\(--match-card-inline-padding\)/);
  assert.match(cardRule, /row-gap:\s*0/);
  assert.match(cardRule, /border-inline:\s*1px solid transparent/);
  assert.match(cardRule, /border-inline-end-color:\s*#e0e3e6/);
  assert.match(cardRule, /border-radius:\s*0/);
  assert.match(cardRule, /box-shadow:\s*none/);
  assert.match(trackRule, /gap:\s*var\(--match-card-gap\)/);
  assert.match(viewportRule, /overflow-x:\s*auto/);
  assert.match(viewportRule, /scrollbar-width:\s*none/);
  assert.match(cleanStyles, /\.teamNames > \.teamName\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(cleanStyles, /\.cleanTeamScore\s*\{[^}]*font-size:\s*18px/);
  const scoreRule = cleanStyles.match(/\.cleanTeamScore\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(scoreRule, /border:|background:|box-shadow:|transform:/);
  assert.match(cleanStyles, /> \.broadcast\s*\{[^}]*grid-row:\s*4/);
  assert.doesNotMatch(cardRule, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(componentSource, /syncCleanHeaderAlignment|homeTeamNameRef|--match-card-status-inline-start/);
  assert.match(componentSource, /import PublicMatchStripCarousel/);
  assert.match(componentSource, /data-public-match-schedule/);
  assert.match(componentSource, /visualVariant === "clean" \? \(\s*cleanHeaderContent\s*\)/);
  assert.match(componentSource, /data-public-match-away-name/);
  assert.match(componentSource, /data-public-match-broadcast[\s\S]*?<PublicMatchMeta[\s\S]*?dateTime=\{<span aria-hidden="true" \/>\}[\s\S]*?variant="compact"/);
  assert.match(componentSource, /const hasScheduledHeaderTime = Boolean\([\s\S]*?visualVariant === "clean"[\s\S]*?kind === "scheduled"[\s\S]*?scheduleTimeVisual/);
  assert.match(componentSource, /const cleanScheduledHeader = hasScheduledHeaderTime \? \([\s\S]*?cleanScheduleHeader[\s\S]*?scheduleDateOnlyContent[\s\S]*?cleanScheduleTime[\s\S]*?scheduleTimeVisual/);
  assert.match(componentSource, /const cleanHeaderContent =[\s\S]*?: cleanScheduledHeader/);
  assert.match(componentSource, /const statusContent =[\s\S]*?presentation\.status\.kind === "label"[\s\S]*?: scheduleContent;/);
  assert.match(componentSource, /kind === "scheduled" \? \(\s*<PublicMatchMeta[\s\S]*?channelLogoUrl=\{presentation\.showChannel[\s\S]*?variant="compact"/);
  assert.match(componentSource, /const schedule = miniCardSchedule\(match\);/);
  assert.doesNotMatch(componentSource, /miniCardSchedule\(match,\s*visualVariant === "clean"\)/);
  assert.match(
    componentSource,
    /const hasScheduledHeaderTime = Boolean\(\s*visualVariant === "clean"\s*&& kind === "scheduled"\s*&& scheduleTimeVisual\s*\);/
  );
  assert.match(
    componentSource,
    /const cleanScheduledHeader = hasScheduledHeaderTime \? \([\s\S]*?className=\{styles\.cleanScheduleTime\}[\s\S]*?\{scheduleTimeVisual\}/
  );
  const compactCardSource = componentSource.split("function CompactMatchCard")[1]?.split("export default function PublicMatchStrip")[0] ?? "";
  assert.doesNotMatch(compactCardSource, /Liga Portugal|La Liga|Premier League|competitionSlug/);
  assert.doesNotMatch(competitionSource, /import PublicMatchdayNavigation|<PublicMatchdayNavigation/);
  assert.match(competitionSource, /className="public-matchday-nav-compact"/);

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
  assert.match(componentSource, /PUBLIC_MATCH_STRIP_REFRESH_INTERVAL_MS/);
  assert.match(componentSource, /window\.setInterval\([\s\S]*?PUBLIC_MATCH_STRIP_REFRESH_INTERVAL_MS/);
  assert.match(componentSource, /fetch\(\s*`\/api\/public\/matches\/live\?ids=/);
  assert.match(componentSource, /document\.visibilityState !== "visible"/);
  assert.match(componentSource, /cleanStateLabel = kind === "live"[\s\S]*?"AGORA"[\s\S]*?kind === "halftime"[\s\S]*?"INTERVALO"[\s\S]*?: null/);
  assert.match(componentSource, /const cleanHeaderLead = cleanMinute !== null \? `\$\{cleanMinute\}'` : null/);
  assert.doesNotMatch(componentSource, /const cleanKickoffLabel|cleanHeaderLead = kind === "finished" \? schedule\.visual/);
  assert.match(componentSource, /kind === "finished" \? \(\s*<span className="public-matchday-mini-time" aria-label="Finalizado">FINAL<\/span>/);
  assert.match(componentSource, /className=\{`\$\{styles\.cleanStateBadge\} \$\{cleanStateLabelClass\}`\}/);
  assert.match(componentSource, /const cleanTeamScores = visualVariant === "clean"\s*\? presentation\.finishedScore \?\? \(activeScore\s*\? \{ left: String\(match\.home_score\), right: String\(match\.away_score\) \}\s*: null\)\s*: null/);
  assert.doesNotMatch(componentSource, /\{ left: "0", right: "0" \}/);
  assert.match(componentSource, /data-has-team-scores=\{cleanTeamScores \? "true" : undefined\}/);
  assert.match(componentSource, /\{cleanTeamScores \? \(\s*<>\s*<strong/);
  assert.doesNotMatch(componentSource, /cleanScoreContent|cleanFinishedScore|cleanActiveFooterWithoutBroadcast/);
  assert.doesNotMatch(componentSource, /cleanFinalScoreBox/);
  assert.match(componentSource, /data-public-match-team-score="home"[\s\S]*?\{cleanTeamScores\.left\}/);
  assert.match(componentSource, /data-public-match-team-score="away"[\s\S]*?\{cleanTeamScores\.right\}/);
  assert.match(componentSource, /visualVariant === "clean" && kind !== "finished" \? \(\s*<span className=\{styles\.broadcast\}/);
  assert.match(componentSource, /\(kind === "live" \|\| kind === "halftime"\)\s*&&\s*presentation\.showChannel[\s\S]*?<PublicMatchMeta/);
  assert.match(componentSource, /const hasCleanBroadcast = Boolean\(/);
  assert.match(componentSource, /<span className=\{styles\.broadcast\}[\s\S]*?\{hasCleanBroadcast \? \(\s*<PublicMatchMeta/);
  assert.doesNotMatch(componentSource, /homeCompactName.*home_score|awayCompactName.*away_score/);
  assert.doesNotMatch(componentSource, /Versus|>\s*VS\s*</);
  assert.match(componentSource, /`\$\{styles\.score\} \$\{styles\.scheduledSeparator\}`/);
  assert.match(componentSource, /const activeScore = presentation\.center\.kind === "score"/);
  assert.match(componentSource, /className=\{styles\.statusScore\}>\{activeScore\}<\/strong>/);
  assert.match(componentSource, /className=\{styles\.halftimeStatus\}/);
  assert.match(componentSource, /const finishedScoreText = presentation\.finishedScore !== null/);
  assert.match(componentSource, /className=\{styles\.finishedScore\}/);
  assert.doesNotMatch(componentSource, /public-matchday-live-label/);
  assert.doesNotMatch(componentSource, /finishedLabel|finishedSideScore|finishedScoreSeparator/);
  assert.match(componentSource, /presentation\.center\.kind === "placeholder"/);
});
