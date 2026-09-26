import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicMatchdayHeaderModel, type PublicMatchdayHeaderContext } from "./public-matchday-header";

function context(slug = "liga-portugal", participants = 18, number = 7): PublicMatchdayHeaderContext {
  return {
    competition: { slug, name: slug, logo_url: null },
    season: { label: "2026/27" },
    seasons: [{ id: "season", label: "2026/27" }, { id: "old-season", label: "2025/26" }],
    matchday: { id: `j${number}`, number, starts_on: "2026-09-19", ends_on: "2026-09-20" },
    matchdays: Array.from({ length: (participants - 1) * 2 }, (_, i) => ({ id: `j${i + 1}`, number: i + 1 })),
    activeParticipantCount: participants,
    matchesForMatchday: [],
  };
}

test("the shared header keeps competition, season and leg links on the corresponding matchday", () => {
  for (const [slug, participants] of [["liga-portugal", 18], ["la-liga", 20], ["premier-league", 20]] as const) {
    const source = context(slug, participants);
    const menu = [{ slug, label: "Current competition", href: "/wrong-season", logoUrl: null }, { slug: "another", label: "Other", href: "/other", logoUrl: null }];
    const before = JSON.stringify({ source, menu });
    const header = buildPublicMatchdayHeaderModel(source, menu);
    const base = `/competicoes/${slug}/2026-27/jornadas`;
    assert.equal(header.currentCompetitionMenuItem.href, `${base}/7`);
    assert.equal(header.publicCompetitionMenu[0].href, `${base}/7`);
    assert.equal(header.publicCompetitionMenu[1].href, "/other");
    assert.equal(header.firstLegHref, `${base}/7`);
    assert.equal(header.secondLegHref, `${base}/${participants}`);
    assert.equal(header.activeMatchdayLeg, "first");
    assert.equal(header.visibleMatchdays.length, participants - 1);
    assert.equal(header.seasonOptions[1].href, `/competicoes/${slug}/2025-26/jornadas/1`);
    assert.ok(header.competitionLogo?.logoUrl);
    assert.equal(header.selectedMatchdayDateContext, "19–20 de setembro de 2026");
    assert.equal(JSON.stringify({ source, menu }), before);
  }
});

test("second-leg navigation retains the selected jornada and tolerates an unavailable competition menu", () => {
  const header = buildPublicMatchdayHeaderModel(context("la-liga", 20, 23), []);
  assert.equal(header.publicCompetitionMenu.length, 1);
  assert.equal(header.activeMatchdayLeg, "second");
  assert.equal(header.visibleMatchdays[0].number, 20);
  assert.equal(header.firstLegHref, "/competicoes/la-liga/2026-27/jornadas/1");
  assert.equal(header.secondLegHref, "/competicoes/la-liga/2026-27/jornadas/23");
});

test("header dates prefer the jornada interval, then valid match dates, then the compact pending label", () => {
  const source = context();
  source.matchesForMatchday = [{ scheduled_date: "2026-09-30" }, { scheduled_date: "2026-10-02" }];
  assert.equal(buildPublicMatchdayHeaderModel(source, []).selectedMatchdayDateContext, "19–20 de setembro de 2026");
  source.matchday.starts_on = null;
  source.matchday.ends_on = null;
  assert.equal(buildPublicMatchdayHeaderModel(source, []).selectedMatchdayDateContext, "30 de setembro – 2 de outubro de 2026");
  source.matchesForMatchday = [{ scheduled_date: "2026-02-30" }, { scheduled_date: null }];
  assert.equal(buildPublicMatchdayHeaderModel(source, []).selectedMatchdayDateContext, "Data por definir");
});
