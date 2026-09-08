import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loadNewsroomArticleClassificationEvidenceWithReader,
  loadNewsroomClassificationSeasonContextWithReader,
  readAllDeterministicClassifierPages,
  type NewsroomDeterministicClassifierReader,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-loaders";

const SEASON_ID = "96000000-0000-4000-8000-000000000001";
const COMPETITION_ID = "96000000-0000-4000-8000-000000000002";
const BENFICA_ID = "96000000-0000-4000-8000-000000000003";
const BRAGA_ID = "96000000-0000-4000-8000-000000000004";
const ARTICLE_ONE_ID = "96000000-0000-4000-8000-000000000005";
const ARTICLE_TWO_ID = "96000000-0000-4000-8000-000000000006";

function table(path: string): string {
  return path.split("?")[0]!;
}

function offset(path: string): number {
  return Number(new URLSearchParams(path.split("?")[1]).get("offset") ?? 0);
}

function limit(path: string): number {
  return Number(new URLSearchParams(path.split("?")[1]).get("limit") ?? 0);
}

function page<T>(path: string, rows: readonly T[]): T[] {
  const start = offset(path);
  const size = limit(path) || rows.length;
  return rows.slice(start, start + size);
}

test("reader pagina integralmente sem truncamento silencioso", async () => {
  const values = Array.from({ length: 1_003 }, (_, index) => index);
  const calls: Array<readonly [number, number]> = [];
  const result = await readAllDeterministicClassifierPages(
    async (pageOffset, pageLimit) => {
      calls.push([pageOffset, pageLimit]);
      return values.slice(pageOffset, pageOffset + pageLimit);
    },
    500,
  );

  assert.deepEqual(result, values);
  assert.deepEqual(calls, [[0, 500], [500, 500], [1_000, 500]]);
});

test("loader exige seasonId explícito e não infere época atual", async () => {
  let calls = 0;
  const reader: NewsroomDeterministicClassifierReader = {
    async read<T>() {
      calls += 1;
      return [] as T[];
    },
  };

  const result = await loadNewsroomClassificationSeasonContextWithReader(
    reader,
    "current",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_request");
  assert.equal(calls, 0);
});

test("contexto carrega season, participantes, teams e aliases sem N+1", async () => {
  const paths: string[] = [];
  const rowsByTable: Record<string, readonly unknown[]> = {
    seasons: [{ id: SEASON_ID, competition_id: COMPETITION_ID }],
    season_teams: [
      { id: "96000000-0000-4000-8000-000000000011", team_id: BENFICA_ID },
      { id: "96000000-0000-4000-8000-000000000012", team_id: BRAGA_ID },
    ],
    teams: [
      {
        id: BENFICA_ID,
        name: "Sport Lisboa e Benfica",
        public_name: "Benfica",
        short_name: "Benfica",
        slug: "benfica",
        code: "SLB",
      },
      {
        id: BRAGA_ID,
        name: "Sporting Clube de Braga",
        public_name: "SC Braga",
        short_name: "Braga",
        slug: "braga",
        code: "SCB",
      },
    ],
    team_aliases: [
      {
        id: "96000000-0000-4000-8000-000000000021",
        team_id: BENFICA_ID,
        alias: "SL Benfica",
        normalized_alias: "sl-benfica",
      },
      {
        id: "96000000-0000-4000-8000-000000000022",
        team_id: BRAGA_ID,
        alias: "SC Braga",
        normalized_alias: "sc-braga",
      },
    ],
  };
  const reader: NewsroomDeterministicClassifierReader = {
    async read<T>(path: string) {
      paths.push(path);
      const rows = rowsByTable[table(path)] ?? [];
      return page(path, rows) as T[];
    },
  };

  const result = await loadNewsroomClassificationSeasonContextWithReader(
    reader,
    SEASON_ID,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.seasonId, SEASON_ID);
  assert.equal(result.value.competitionId, COMPETITION_ID);
  assert.deepEqual(
    result.value.teams.map((team) => [team.id, team.classificationKey]),
    [[BENFICA_ID, "benfica"], [BRAGA_ID, "other_liga_clubs"]],
  );
  assert.equal(paths.filter((path) => table(path) === "seasons").length, 1);
  assert.equal(paths.filter((path) => table(path) === "season_teams").length, 1);
  assert.equal(paths.filter((path) => table(path) === "teams").length, 1);
  assert.equal(paths.filter((path) => table(path) === "team_aliases").length, 1);
  assert.match(paths.find((path) => table(path) === "season_teams")!, /season_id=eq\./);
  assert.doesNotMatch(paths.join("\n"), /current|published_at|now\(\)/i);
});

test("loader rejeita participante que não existe na autoridade teams", async () => {
  const reader: NewsroomDeterministicClassifierReader = {
    async read<T>(path: string) {
      const rowsByTable: Record<string, readonly unknown[]> = {
        seasons: [{ id: SEASON_ID, competition_id: COMPETITION_ID }],
        season_teams: [{
          id: "96000000-0000-4000-8000-000000000011",
          team_id: BRAGA_ID,
        }],
        teams: [{
          id: BENFICA_ID,
          name: "Sport Lisboa e Benfica",
          public_name: "Benfica",
          short_name: "Benfica",
          slug: "benfica",
          code: "SLB",
        }],
        team_aliases: [],
      };
      return page(path, rowsByTable[table(path)] ?? []) as T[];
    },
  };
  const result = await loadNewsroomClassificationSeasonContextWithReader(
    reader,
    SEASON_ID,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "context_invalid");
});

test("evidência batch usa uma query de artigos e uma de snapshots", async () => {
  const paths: string[] = [];
  const articleRows = [
    {
      id: ARTICLE_ONE_ID,
      title: "Benfica prepara jogo",
      subtitle: null,
      summary: "Resumo",
    },
    {
      id: ARTICLE_TWO_ID,
      title: "Braga renova contrato",
      subtitle: "Subtítulo",
      summary: null,
    },
  ];
  const snapshotRows = [
    {
      id: "96000000-0000-4000-8000-000000000031",
      article_id: ARTICLE_ONE_ID,
      body: [{ type: "paragraph", text: "Corpo mais recente" }],
      extracted_at: "2026-09-08T12:00:00.000Z",
      created_at: "2026-09-08T12:00:00.000Z",
    },
    {
      id: "96000000-0000-4000-8000-000000000032",
      article_id: ARTICLE_ONE_ID,
      body: [{ type: "paragraph", text: "Corpo anterior" }],
      extracted_at: "2026-09-07T12:00:00.000Z",
      created_at: "2026-09-07T12:00:00.000Z",
    },
  ];
  const reader: NewsroomDeterministicClassifierReader = {
    async read<T>(path: string) {
      paths.push(path);
      if (table(path) === "newsroom_articles") return articleRows as T[];
      if (table(path) === "newsroom_article_snapshots") {
        return page(path, snapshotRows) as T[];
      }
      return [];
    },
  };

  const result = await loadNewsroomArticleClassificationEvidenceWithReader(
    reader,
    [ARTICLE_TWO_ID, ARTICLE_ONE_ID],
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.value.map((item) => item.newsroomArticleId),
    [ARTICLE_TWO_ID, ARTICLE_ONE_ID],
  );
  assert.equal(result.value[0]!.body, null);
  assert.equal(result.value[1]!.body, "Corpo mais recente");
  assert.equal(paths.filter((path) => table(path) === "newsroom_articles").length, 1);
  assert.equal(paths.filter((path) => table(path) === "newsroom_article_snapshots").length, 1);
  const articlePath = paths.find((path) => table(path) === "newsroom_articles")!;
  assert.match(articlePath, /select=id,title,subtitle,summary/);
  assert.doesNotMatch(articlePath, /url|image|source/i);
  assert.match(paths.join("\n"), /order=article_id\.asc,extracted_at\.desc,created_at\.desc,id\.desc/);
});

test("body aceita apenas blocos textuais reais e não é obrigatório", async () => {
  const reader: NewsroomDeterministicClassifierReader = {
    async read<T>(path: string) {
      if (table(path) === "newsroom_articles") {
        return [{
          id: ARTICLE_ONE_ID,
          title: "Título",
          subtitle: null,
          summary: null,
        }] as T[];
      }
      return [{
        id: "96000000-0000-4000-8000-000000000031",
        article_id: ARTICLE_ONE_ID,
        body: [
          { type: "image", text: "ignorar" },
          { type: "heading", text: "Cabeçalho" },
          { type: "paragraph", text: "Parágrafo" },
        ],
        extracted_at: "2026-09-08T12:00:00.000Z",
        created_at: "2026-09-08T12:00:00.000Z",
      }] as T[];
    },
  };
  const result = await loadNewsroomArticleClassificationEvidenceWithReader(
    reader,
    [ARTICLE_ONE_ID],
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value[0]!.body, "Cabeçalho\nParágrafo");
});

test("loader rejeita batch duplicado antes de consultar", async () => {
  let calls = 0;
  const reader: NewsroomDeterministicClassifierReader = {
    async read<T>() {
      calls += 1;
      return [] as T[];
    },
  };
  const result = await loadNewsroomArticleClassificationEvidenceWithReader(
    reader,
    [ARTICLE_ONE_ID, ARTICLE_ONE_ID],
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_request");
  assert.equal(calls, 0);
});

test("repository do classificador é server-only e estritamente read-only", () => {
  const source = readFileSync(
    "lib/redacao-automatica/newsroom-deterministic-classifier-repository.ts",
    "utf8",
  );
  assert.match(source, /^import "server-only";/);
  assert.match(source, /fetchSupabaseAdminTable/);
  assert.doesNotMatch(
    source,
    /writeSupabase|insert\s+into|update\s+public|delete\s+from|rpc\//i,
  );
});
