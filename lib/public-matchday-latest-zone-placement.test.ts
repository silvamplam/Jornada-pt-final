import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildPublicMatchdayEditorialVisibility } from "@/lib/public-matchday-editorial-visibility";

const baseVisibilityInput = {
  hasHeadline: true,
  hasSideBlock: true,
  highlightCount: 3,
  roundupCount: 0,
  hasComplementaryStory: false,
  latestNewsCount: 4,
  importantNewsCount: 0,
};

const publicPage = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);
const publicLoader = readFileSync("lib/public-matchday.ts", "utf8");
const adminPage = readFileSync("app/admin/editorial/jornada/[matchdayId]/page.tsx", "utf8");
const deskPage = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx",
  "utf8",
);
const gestorRoute = readFileSync("app/api/admin/gestor/route.ts", "utf8");
const newsFlow = readFileSync("lib/editorial-matchday-news-flow.ts", "utf8");

test("top mostra Últimas na capa; hidden e four_news retiram-na da posição superior", () => {
  const implicitTop = buildPublicMatchdayEditorialVisibility(baseVisibilityInput);
  const explicitTop = buildPublicMatchdayEditorialVisibility({
    ...baseVisibilityInput,
    latestZonePlacement: "top",
  });
  const hidden = buildPublicMatchdayEditorialVisibility({
    ...baseVisibilityInput,
    latestZonePlacement: "hidden",
  });
  const fourNews = buildPublicMatchdayEditorialVisibility({
    ...baseVisibilityInput,
    latestZonePlacement: "four_news",
  });

  assert.equal(implicitTop.showLatestZone, true);
  assert.equal(explicitTop.showLatestZone, true);
  assert.equal(explicitTop.coverLayout, "feature-main-news");
  assert.equal(hidden.showLatestZone, false);
  assert.equal(hidden.coverLayout, "feature-main");
  assert.equal(fourNews.showLatestZone, false);
  assert.equal(fourNews.coverLayout, "feature-main");
});

test("a migration base mantém default top e o delta acrescenta four_news", () => {
  const apply = readFileSync(
    "supabase/steps/97-jornada-ultimas-colocacao-zona-apply.sql",
    "utf8",
  );
  const delta = readFileSync(
    "supabase/steps/119-jornada-zona-4-noticias-ultimas-apply.sql",
    "utf8",
  );
  const postflight = readFileSync(
    "supabase/steps/98-jornada-ultimas-colocacao-zona-postflight.sql",
    "utf8",
  );
  const smoke = readFileSync(
    "supabase/steps/99-jornada-ultimas-colocacao-zona-smoke-rollback.sql",
    "utf8",
  );

  assert.match(apply, /add column if not exists latest_zone_placement text not null default 'top'/i);
  assert.match(apply, /check \(latest_zone_placement in \('top', 'hidden'\)\)/i);
  assert.match(delta, /latest_zone_placement in \('top', 'hidden', 'four_news'\)/i);
  assert.match(delta, /live_four_news:1[\s\S]*live_four_news:4/i);
  assert.doesNotMatch(apply, /alter column latest_zone_mode|drop column|delete from/i);
  assert.doesNotMatch(delta, /delete from|matchday_reference_compositions|matchday_hierarchical_composition_slots/i);
  assert.match(postflight, /latest_zone_placement not in \('top', 'hidden'\)/i);
  assert.match(smoke, /latest_zone_placement = 'hidden'/i);
  assert.match(smoke, /latest_zone_placement = 'top'/i);
  assert.match(smoke, /rollback;/i);
});

test("leitura pública aplica placement depois de montar dados vivos ou snapshots", () => {
  assert.match(publicLoader, /latest_zone_mode,latest_zone_placement,latest_zone_title/);
  assert.match(publicPage, /editorial\?\.latest_zone_placement === "four_news"/);
  assert.match(publicPage, /latestNewsCount: latestNewsItems\.length,\s*latestZonePlacement,/);
  assert.match(
    publicPage,
    /latestZonePlacement === "four_news"[\s\S]*liveFourNewsItems\.length === 4[\s\S]*<PublicFourNewsLatestLayout[\s\S]*items=\{liveFourNewsItems\}[\s\S]*latestNews=\{latestNewsItems\}/,
  );

  const referenceItemsIndex = publicPage.indexOf("referenceEditorialLineItems.map");
  const visibilityIndex = publicPage.indexOf("buildPublicMatchdayEditorialVisibility({");
  assert.ok(referenceItemsIndex >= 0);
  assert.ok(visibilityIndex > referenceItemsIndex);
  assert.doesNotMatch(publicPage, /referenceEditorialLineItems\.(?:splice|pop|shift)|matchday_reference_composition_items.*(?:DELETE|PATCH)/i);
});

test("a posição de Últimas é controlada na Mesa e já não no Editorial", () => {
  assert.doesNotMatch(adminPage, /name="action_type" value="set_matchday_latest_zone_placement"/);
  assert.doesNotMatch(adminPage, /<select[^>]*name="latest_zone_placement"/);
  assert.match(deskPage, /name="action_type" value="set_matchday_latest_zone_placement"/);
  assert.match(deskPage, /<option value="top">Ao lado da manchete<\/option>/);
  assert.match(deskPage, /<option value="four_news">Na zona de 4 notícias<\/option>/);
  assert.match(deskPage, /<option value="hidden">Ocultas<\/option>/);

  const actionStart = gestorRoute.indexOf("async function setMatchdayLatestZonePlacement");
  const actionEnd = gestorRoute.indexOf("async function saveMatchdayLatestNewsItem", actionStart);
  const action = gestorRoute.slice(actionStart, actionEnd);

  assert.match(action, /latestZonePlacement !== "top" && latestZonePlacement !== "hidden" && latestZonePlacement !== "four_news"/);
  assert.match(action, /matchday_editorials\?on_conflict=matchday_id/);
  assert.match(action, /latest_zone_placement: latestZonePlacement/);
  assert.doesNotMatch(action, /editorial_articles|matchday_latest_news|latest_zone_mode|status:/);
  assert.doesNotMatch(action, /syncLatestFourNewsProjection/);
});

test("transferências para Últimas não reativam a zona oculta", () => {
  const modeStart = newsFlow.indexOf("async function setLatestNewsMode");
  const modeEnd = newsFlow.indexOf("async function readLatestNewsRows", modeStart);
  const latestModeWrite = newsFlow.slice(modeStart, modeEnd);

  assert.match(latestModeWrite, /latest_zone_mode: "latest_news"/);
  assert.doesNotMatch(latestModeWrite, /latest_zone_placement/);
  assert.match(newsFlow, /await ensurePublishedArticleInLatest\(matchdayId, articleId\);/);
  assert.match(newsFlow, /status: "published"/);
  assert.match(newsFlow, /await normalizeLatestNewsOrder\(matchdayId\);/);
  assert.doesNotMatch(newsFlow, /latest_zone_placement/);
});
