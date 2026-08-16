import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

const model = source("lib/editorial-matchday-desk-model.ts");
const reader = source("lib/editorial-matchday-desk.ts");
const resolution = source("lib/editorial-matchday-desk-resolution.ts");
const client = source(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialDeskClient.tsx",
);
const resolveRoute = source(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/resolve/route.ts",
);

test("a Mesa distingue as causas reais dos bloqueios", () => {
  assert.match(model, /"inactive"/);
  assert.match(model, /"canonical_missing"/);
  assert.match(model, /"canonical_conflict"/);
  assert.match(model, /"incomplete_article"/);

  assert.match(reader, /kind: "inactive"/);
  assert.match(reader, /kind: "canonical_conflict"/);
  assert.match(reader, /kind: "canonical_missing"/);
  assert.match(reader, /kind: "incomplete_article"/);
});

test("o reader da Mesa continua estritamente read-only", () => {
  assert.doesNotMatch(reader, /writeSupabaseAdmin/);
});

test("conteúdo canónico inativo pode ser ativado ou retirado sem libertar o Apply silenciosamente", () => {
  assert.match(resolution, /resolveMatchdayEditorialDeskInactivePlacement/);
  assert.match(resolution, /complementary_status: "published"/);
  assert.match(resolution, /matchday_latest_news\?matchday_id=/);
  assert.match(resolution, /removePlacement/);

  assert.match(resolveRoute, /blocked\.kind !== "inactive"/);
  assert.match(resolveRoute, /blocked\.canActivate/);
  assert.match(resolveRoute, /blocked\.canRemove/);
  assert.match(resolveRoute, /readMatchdayEditorialDesk/);
});

test("a Mesa carrega a biblioteca canónica publicada sem misturá-la com a lista corrente da Jornada", () => {
  assert.match(model, /MatchdayDeskCanonicalCandidate/);
  assert.match(model, /canonicalCandidates: MatchdayDeskCanonicalCandidate\[\]/);
  assert.match(model, /suggestedArticleIds: string\[\]/);
  assert.match(model, /canAssociate: boolean/);

  assert.match(reader, /allPublishedArticles/);
  assert.match(
    reader,
    /editorial_articles\?select=\$\{ARTICLE_SELECT\}&status=eq\.published/,
  );
  assert.match(reader, /canonicalCandidateIdsByTitle/);
  assert.match(reader, /suggestedCanonicalArticleIds/);
  assert.doesNotMatch(
    reader,
    /allPublishedArticles\.forEach\(\(article\) => articleMap\.set/,
  );
});

test("identidade em falta ou contraditória pode ser associada explicitamente", () => {
  assert.match(
    resolution,
    /resolveMatchdayEditorialDeskCanonicalPlacement/,
  );
  assert.match(resolution, /associatePlacement/);
  assert.match(resolution, /article_id: articleId/);
  assert.match(resolution, /link_url: linkUrl/);
  assert.match(resolution, /slot_type=eq\.\$\{encodeURIComponent\(placementKey\)\}/);

  assert.match(resolveRoute, /body\.action !== "associate"/);
  assert.match(resolveRoute, /snapshot\.canonicalCandidates\.find/);
  assert.match(resolveRoute, /blocked\.canAssociate/);

  assert.match(client, /Associar artigo canónico/);
  assert.match(client, /Escolher artigo canónico…/);
  assert.match(client, /canonicalChoiceByPlacement/);
  assert.match(client, /suggestedArticleIds/);
});

test("a retirada explícita de uma posição canónica preserva uma Faixa contínua", () => {
  assert.match(resolution, /normalizeHorizontalNewsOrder/);
  assert.match(
    resolution,
    /matchday_horizontal_news\?select=id,sort_order/,
  );
  assert.match(
    resolution,
    /body: JSON\.stringify\(\{ sort_order: expectedOrder \}\)/,
  );
});

test("a própria Mesa continua a resolver também conteúdo inativo", () => {
  assert.match(client, /Ativar nesta zona/);
  assert.match(client, /Retirar da zona/);
  assert.match(client, /resolveBlockedPlacement/);
  assert.match(
    client,
    /Resolve primeiro as situações assinaladas na própria Mesa/,
  );
  assert.doesNotMatch(
    client,
    /conteúdos atuais não associados a artigos canónicos/,
  );
});