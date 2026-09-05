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

test("geometria do carrossel deriva todas as larguras da mesma formula", () => {
  assert.equal(CARD_WIDTH, 148);
  assert.equal(CARD_HEIGHT, 112);
  assert.equal(CARD_GAP, 8);
  assert.equal(CARD_STEP, 156);
  assert.equal(CARD_INLINE_PADDING, 10);
  assert.equal(CARD_BORDER_WIDTH, 1);
  assert.equal(CARD_TEAM_COLUMN_WIDTH, 59);
  assert.equal(ARROW_ZONE_WIDTH, 32);
  assert.deepEqual(VISIBLE_CARD_COUNTS, [8, 6, 4, 2, 1]);
  assert.deepEqual(
    VISIBLE_CARD_COUNTS.map((count) => getMatchCarouselViewportWidth(count)),
    [1240, 928, 616, 304, 148]
  );
  assert.deepEqual(
    VISIBLE_CARD_COUNTS.map((count) => getMatchCarouselShellWidth(count)),
    [1304, 992, 680, 368, 212]
  );

  for (const [availableWidth, expectedCount] of [
    [1920, 8],
    [1914, 8],
    [1536, 8],
    [1304, 8],
    [1240, 8],
    [1239, 6],
    [992, 6],
    [928, 6],
    [927, 4],
    [680, 4],
    [616, 4],
    [615, 2],
    [368, 2],
    [304, 2],
    [303, 1]
  ] as const) {
    assert.equal(selectMatchCarouselVisibleCardCount(availableWidth), expectedCount);
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
  assert.match(competitionSource, /\.public-league-match-strip-scroll > \.public-matchday-scoreboard-panel\s*\{[\s\S]*?margin-top:\s*3px/);
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
  assert.match(componentSource, /import PublicMatchStripCarousel/);
  assert.match(componentSource, /data-public-match-schedule/);
  assert.match(componentSource, /visualVariant === "clean" \? \(\s*cleanHeaderContent\s*\)/);
  assert.match(componentSource, /data-public-match-away-name/);
  assert.match(componentSource, /data-public-match-broadcast[\s\S]*?<PublicMatchMeta[\s\S]*?dateTime=\{<span aria-hidden="true" \/>\}[\s\S]*?variant="compact"/);
  assert.match(cleanStyles, /\.panel\[data-visual-variant="clean"\]\s*\{[\s\S]*?width:\s*100vw[\s\S]*?max-width:\s*none[\s\S]*?margin:\s*0 calc\(50% - 50vw\)/);
  assert.match(cleanStyles, /\.carouselMeasure\s*\{[\s\S]*?width:\s*100%/);
  assert.match(cleanStyles, /\.carousel\s*\{[\s\S]*?width:\s*var\(--match-carousel-shell-width\)[\s\S]*?max-width:\s*100%[\s\S]*?margin-inline:\s*auto/);
  assert.match(cleanStyles, /\.carouselViewport \{[\s\S]*?width:\s*var\(--match-carousel-viewport-width\)[\s\S]*?max-width:\s*var\(--match-carousel-viewport-width\)[\s\S]*?margin-inline:\s*auto[\s\S]*?padding-inline:\s*0[\s\S]*?overflow-x:\s*hidden[\s\S]*?scrollbar-width:\s*none/);
  assert.match(cleanStyles, /\.carouselViewport::-webkit-scrollbar \{[\s\S]*?display:\s*none/);
  assert.match(cleanStyles, /\.carouselViewport > \.row\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?justify-content:\s*flex-start[\s\S]*?width:\s*max-content[\s\S]*?gap:\s*var\(--match-card-gap\)[\s\S]*?margin:\s*0[\s\S]*?padding:\s*0/);
  assert.doesNotMatch(cleanStyles, /grid-auto-columns/);
  assert.doesNotMatch(cleanStyles, /@media \(max-width:\s*(?:1591|1211|831|451)px\)/);
  assert.match(cleanStyles, /\.row > \.card \{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?flex:\s*0 0 var\(--match-card-width\);[\s\S]*?width:\s*var\(--match-card-width\);[\s\S]*?min-width:\s*var\(--match-card-width\);[\s\S]*?max-width:\s*var\(--match-card-width\);[\s\S]*?height:\s*var\(--match-card-height\);[\s\S]*?min-height:\s*var\(--match-card-height\);[\s\S]*?max-height:\s*var\(--match-card-height\);[\s\S]*?background:\s*#ffffff/);
  assert.match(cleanStyles, /> \.status\s*\{[\s\S]*?grid-row:\s*1[\s\S]*?box-sizing:\s*border-box[\s\S]*?width:\s*calc\(100% - var\(--match-card-status-inline-start, 14px\)\)[\s\S]*?height:\s*14px[\s\S]*?margin-left:\s*var\(--match-card-status-inline-start, 14px\)[\s\S]*?padding:\s*0[\s\S]*?font-size:\s*11px[\s\S]*?font-weight:\s*500[\s\S]*?line-height:\s*14px/);
  assert.match(componentSource, /ref=\{cardRef\}/);
  assert.match(componentSource, /ref=\{homeTeamNameRef\}/);
  assert.match(componentSource, /const syncCleanHeaderAlignment = useCallback/);
  assert.match(componentSource, /homeNameRect\.left - contentLeft/);
  assert.match(componentSource, /--match-card-status-inline-start/);
  assert.match(componentSource, /new ResizeObserver\(syncCleanHeaderAlignment\)/);
  assert.match(componentSource, /const hasScheduledHeaderTime = Boolean\([\s\S]*?visualVariant === "clean"[\s\S]*?kind === "scheduled"[\s\S]*?scheduleTimeVisual/);
  assert.match(componentSource, /const cleanScheduledHeader = hasScheduledHeaderTime \? \([\s\S]*?cleanScheduleHeader[\s\S]*?scheduleDateOnlyContent[\s\S]*?cleanScheduleTime[\s\S]*?scheduleTimeVisual/);
  assert.match(componentSource, /const cleanHeaderContent =[\s\S]*?: cleanScheduledHeader/);
  assert.match(componentSource, /const statusContent =[\s\S]*?presentation\.status\.kind === "label"[\s\S]*?: scheduleContent;/);
  assert.match(componentSource, /kind === "scheduled" \? \(\s*<PublicMatchMeta[\s\S]*?channelLogoUrl=\{presentation\.showChannel[\s\S]*?variant="compact"/);
  assert.match(stylesSource, /\.cleanScheduleHeader\s*\{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*space-between;[\s\S]*?height:\s*14px/);
  assert.match(stylesSource, /\.panel\[data-visual-variant="clean"\] \.cleanScheduleHeader\s*\{[^}]*translate:\s*0 1px;/);
  assert.match(stylesSource, /\.cleanScheduleTime\s*\{[\s\S]*?margin-left:\s*auto;[\s\S]*?background:\s*#17283b;[\s\S]*?color:\s*#ffffff;[\s\S]*?text-align:\s*right/);
  assert.match(cleanStyles, /> \.broadcast\s*\{[\s\S]*?grid-row:\s*7[\s\S]*?align-self:\s*end[\s\S]*?justify-content:\s*flex-end[\s\S]*?width:\s*100%[\s\S]*?height:\s*19px[\s\S]*?padding:\s*0[\s\S]*?transform:\s*translateY\(-1px\)[\s\S]*?text-align:\s*right/);
  assert.match(cleanStyles, /\.teamNames \{\s*display:\s*contents/);
  assert.match(cleanStyles, /\.teamNames > \.teamName\s*\{[\s\S]*?grid-column:\s*2[\s\S]*?justify-self:\s*start[\s\S]*?width:\s*100%[\s\S]*?overflow:\s*hidden[\s\S]*?text-align:\s*left/);
  assert.match(cleanStyles, /\.teamNames > \.teamName:first-child\s*\{[\s\S]*?grid-row:\s*3/);
  assert.match(cleanStyles, /\.teamNames > \.teamName:nth-child\(2\)\s*\{[\s\S]*?grid-row:\s*5/);
  const trackRule = cleanStyles.match(/\.carouselViewport > \.row\s*\{([^}]*)\}/)?.[1] ?? "";
  const cleanCardRule = cleanStyles.match(/\.panel\[data-visual-variant="clean"\] \.row > \.card\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(trackRule, /flex-grow|flex:\s*1|\b1fr\b|space-between|space-around|%/);
  assert.doesNotMatch(cleanCardRule, /flex-grow|flex:\s*1|space-between|space-around|%/);
  assert.match(cleanCardRule, /grid-template-columns:\s*24px minmax\(0, 1fr\)/);
  assert.match(cleanCardRule, /grid-template-rows:\s*14px 8px 24px 2px 24px 1fr 19px/);
  assert.match(stylesSource, /\.panel\[data-visual-variant="clean"\] \.center \{\s*display:\s*none/);
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
  assert.match(componentSource, /const cleanTeamScores = visualVariant === "clean"\s*\? presentation\.finishedScore \?\? \(activeScore\s*\? \{ left: String\(match\.home_score\), right: String\(match\.away_score\) \}\s*: kind === "scheduled" && presentation\.center\.kind === "placeholder"\s*\? \{ left: "0", right: "0" \}\s*: null\)\s*: null/);
  assert.match(componentSource, /data-has-team-scores=\{cleanTeamScores \? "true" : undefined\}/);
  assert.match(componentSource, /\{cleanTeamScores \? \(\s*<>\s*<strong/);
  assert.doesNotMatch(componentSource, /cleanScoreContent|cleanFinishedScore|cleanActiveFooterWithoutBroadcast/);
  assert.doesNotMatch(componentSource, /cleanFinalScoreBox/);
  assert.match(componentSource, /data-public-match-team-score="home"[\s\S]*?\{cleanTeamScores\.left\}/);
  assert.match(componentSource, /data-public-match-team-score="away"[\s\S]*?\{cleanTeamScores\.right\}/);
  assert.match(componentSource, /visualVariant === "clean" && kind !== "finished" \? \(\s*<span className=\{cleanFooterClassName\}/);
  assert.match(componentSource, /\(kind === "live" \|\| kind === "halftime"\)\s*&&\s*presentation\.showChannel[\s\S]*?<PublicMatchMeta/);
  assert.match(stylesSource, /\.cleanStateBadgeLive\s*\{[\s\S]*?background:\s*#16a34a;[\s\S]*?animation:\s*public-match-now-fade 2\.6s/);
  assert.match(stylesSource, /\.cleanStateBadgeHalftime\s*\{[\s\S]*?background:\s*#15803d;[\s\S]*?color:\s*#ffffff/);
  assert.match(stylesSource, /\.cleanStateBadgeFinished\s*\{[\s\S]*?background:\s*#111820;[\s\S]*?color:\s*#ffffff/);
  assert.match(stylesSource, /\.cleanStatusLine\s*\{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?gap:\s*5px/);
  assert.match(stylesSource, /@keyframes public-match-now-fade[\s\S]*?opacity:\s*0\.52/);
  assert.match(stylesSource, /\.cleanActiveFooter\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*?column-gap:\s*8px/);
  assert.match(stylesSource, /\.broadcast\.cleanActiveFooter > :global\(\[data-public-match-meta\]\)\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*end/);
  assert.match(stylesSource, /\[data-carousel-layout="fluid-peek"\][\s\S]*?\.broadcast\.cleanActiveFooter\s*\{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%/);
  assert.match(stylesSource, /\.card\[data-has-team-scores="true"\]\s*\{[\s\S]*?grid-template-columns:\s*24px minmax\(0, 1fr\) max-content/);
  assert.match(stylesSource, /\.card:global\(\.public-matchday-mini-card-finished\)\s*\{[^}]*grid-template-rows:\s*14px 8px minmax\(0, 1fr\) 4px minmax\(0, 1fr\) 10px/);
  assert.match(stylesSource, /\.card:global\(\.public-matchday-mini-card-finished\) > \.team\s*\{[^}]*align-self:\s*center/);
  assert.match(stylesSource, /\.panel\[data-visual-variant="clean"\] \.row > \.card:global\(\.public-matchday-mini-card-finished\) > \.status > :global\(\.public-matchday-mini-time\)\s*\{[^}]*display:\s*inline-flex;[^}]*width:\s*max-content;[^}]*height:\s*18px;[^}]*padding:\s*0 5px;[^}]*border-radius:\s*3px;[^}]*background:\s*#111111;[^}]*color:\s*#ffffff;[^}]*font-weight:\s*700;[^}]*transform:\s*translateY\(-2px\)/);
  assert.match(stylesSource, /\.card:global\(\.public-matchday-mini-card-scheduled\)\s*\{[^}]*grid-template-rows:\s*14px 5px 24px 6px 24px 1fr 17px/);
  assert.doesNotMatch(stylesSource, /\.cleanFinalScoreBox\b/);
  assert.match(stylesSource, /\.cleanTeamScore\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*3;[^}]*align-self:\s*center;[^}]*justify-self:\s*end/);
  assert.match(stylesSource, /\.cleanTeamScore\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border:\s*1px solid #d9e0e8;[^}]*border-radius:\s*2px;[^}]*background:\s*#f1f4f8/);
  assert.match(stylesSource, /\.cleanTeamScore\[data-public-match-team-score="away"\]\s*\{\s*grid-row:\s*5/);
  assert.match(componentSource, /const hasCleanBroadcast = Boolean\(/);
  assert.match(componentSource, /<span className=\{cleanFooterClassName\}[\s\S]*?\{hasCleanBroadcast \? \(\s*<PublicMatchMeta/);
  assert.doesNotMatch(stylesSource, /\.cleanScore\b|\.cleanScoreActive\b|\.cleanActiveFooterWithoutBroadcast\b/);
  assert.match(stylesSource, /\.cleanStateBadgeLive\s*\{[^}]*margin-inline-start:\s*auto;[^}]*margin-inline-end:\s*13px/);
  assert.match(stylesSource, /\.card:global\(\.public-matchday-mini-card-live\),\s*\.panel\[data-visual-variant="clean"\] \.row > \.card:global\(\.public-matchday-mini-card-halftime\)\s*\{\s*padding-inline-end:\s*6px;/);
  assert.match(stylesSource, /\.panel\[data-visual-variant="clean"\] \.row > \.card:global\(\.public-matchday-mini-card-live\),\s*\.panel\[data-visual-variant="clean"\] \.row > \.card:global\(\.public-matchday-mini-card-halftime\)\s*\{\s*grid-template-rows:\s*14px 7px 24px 2px 24px 1fr 19px;/);
  assert.match(stylesSource, /\.card:global\(\.public-matchday-mini-card-live\) > \.broadcast,\s*\.panel\[data-visual-variant="clean"\] \.row > \.card:global\(\.public-matchday-mini-card-halftime\) > \.broadcast\s*\{\s*padding-inline-end:\s*6px;/);
  assert.match(stylesSource, /\.card:global\(\.public-matchday-mini-card-scheduled\),[^{}]*\.public-matchday-mini-card-halftime\)\s*\{\s*padding-inline-end:\s*6px;/);
  assert.match(stylesSource, /\.card:global\(\.public-matchday-mini-card-scheduled\) > \.status,[^{}]*\.card:global\(\.public-matchday-mini-card-scheduled\) > \.broadcast,[^{}]*\{\s*padding-inline-end:\s*6px;/);
  assert.match(stylesSource, /\.cleanStatusLead\s*\{[\s\S]*?color:\s*#15803d/);
  assert.match(stylesSource, /\.cleanTeamScore\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?font-weight:\s*700;[\s\S]*?letter-spacing:\s*0\.03em/);
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
