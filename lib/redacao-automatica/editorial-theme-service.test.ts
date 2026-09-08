import assert from "node:assert/strict";
import test from "node:test";

import {
  createEditorialThemeService,
  setEditorialThemeArticleMembershipService,
  setEditorialThemeSourceMembershipService,
  setEditorialThemeStatusService,
  updateEditorialThemeService,
  type EditorialTheme,
  type EditorialThemeErrorCode,
  type EditorialThemeMembershipChange,
  type EditorialThemeStatus,
  type EditorialThemeTransport,
  type EditorialThemeWrite,
} from "@/lib/redacao-automatica/editorial-theme-service-internal";

const THEME_ONE_ID = "10000000-0000-4000-8000-000000000001";
const THEME_TWO_ID = "10000000-0000-4000-8000-000000000002";
const SOURCE_ONE_ID = "10000000-0000-4000-8000-000000000011";
const ARTICLE_ONE_ID = "10000000-0000-4000-8000-000000000021";
const COMPETITION_ID = "10000000-0000-4000-8000-000000000031";
const SEASON_ID = "10000000-0000-4000-8000-000000000032";
const MATCHDAY_ID = "10000000-0000-4000-8000-000000000033";
const MATCH_ID = "10000000-0000-4000-8000-000000000034";
const NOW = "2026-09-08T10:30:00.000Z";

type MutableTheme = {
  id: string;
  title: string;
  classificationKey: EditorialTheme["classificationKey"];
  status: EditorialThemeStatus;
  context: {
    contextText: string | null;
    competitionId: string | null;
    seasonId: string | null;
    matchdayId: string | null;
    matchId: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

function fakeTransport() {
  const themeIds = [THEME_ONE_ID, THEME_TWO_ID];
  const themes = new Map<string, MutableTheme>();
  const sourceRelations = new Map<string, string>();
  const articleRelations = new Map<string, string>();
  const newsroomArticles = new Map([
    [SOURCE_ONE_ID, { reviewState: "new", used: false }],
  ]);
  const editorialArticles = new Map([
    [ARTICLE_ONE_ID, {
      title: "Artigo canónico",
      slug: "artigo-canonico",
      status: "published",
    }],
  ]);

  function themeValue(theme: MutableTheme): EditorialTheme {
    return {
      ...theme,
      context: { ...theme.context },
    };
  }

  function existingTheme(themeId: string): MutableTheme {
    const theme = themes.get(themeId);
    if (!theme) {
      throw new Error("editorial_theme_not_found");
    }
    return theme;
  }

  function membership(
    relation: Map<string, string>,
    themeId: string,
    memberId: string,
    associated: boolean,
  ): EditorialThemeMembershipChange {
    existingTheme(themeId);
    const key = `${themeId}:${memberId}`;
    const existingAddedAt = relation.get(key) ?? null;

    if (associated && existingAddedAt === null) {
      relation.set(key, NOW);
      return {
        themeId,
        memberId,
        associated: true,
        changed: true,
        addedAt: NOW,
      };
    }
    if (!associated && existingAddedAt !== null) {
      relation.delete(key);
      return {
        themeId,
        memberId,
        associated: false,
        changed: true,
        addedAt: null,
      };
    }

    return {
      themeId,
      memberId,
      associated,
      changed: false,
      addedAt: associated ? existingAddedAt : null,
    };
  }

  const transport: EditorialThemeTransport = {
    isConfigured: () => true,
    async createTheme(input: EditorialThemeWrite) {
      const id = themeIds[themes.size];
      if (!id) {
        throw new Error("persistence_failed");
      }
      const theme: MutableTheme = {
        id,
        title: input.title,
        classificationKey: input.classificationKey,
        status: "open",
        context: {
          contextText: input.contextText,
          competitionId: input.competitionId,
          seasonId: input.seasonId,
          matchdayId: input.matchdayId,
          matchId: input.matchId,
        },
        createdAt: NOW,
        updatedAt: NOW,
      };
      themes.set(id, theme);
      return themeValue(theme);
    },
    async updateTheme(themeId, input) {
      const theme = existingTheme(themeId);
      theme.title = input.title;
      theme.classificationKey = input.classificationKey;
      theme.context = {
        contextText: input.contextText,
        competitionId: input.competitionId,
        seasonId: input.seasonId,
        matchdayId: input.matchdayId,
        matchId: input.matchId,
      };
      return themeValue(theme);
    },
    async setThemeStatus(themeId, status) {
      const theme = existingTheme(themeId);
      theme.status = status;
      return themeValue(theme);
    },
    async setSourceMembership(themeId, newsroomArticleId, associated) {
      if (!newsroomArticles.has(newsroomArticleId)) {
        throw new Error("editorial_theme_source_not_found");
      }
      return membership(
        sourceRelations,
        themeId,
        newsroomArticleId,
        associated,
      );
    },
    async setArticleMembership(themeId, editorialArticleId, associated) {
      if (!editorialArticles.has(editorialArticleId)) {
        throw new Error("editorial_theme_article_not_found");
      }
      return membership(
        articleRelations,
        themeId,
        editorialArticleId,
        associated,
      );
    },
    classifyError(error): EditorialThemeErrorCode {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("theme_not_found")) return "theme_not_found";
      if (message.includes("source_not_found")) return "source_not_found";
      if (message.includes("article_not_found")) return "article_not_found";
      return "persistence_failed";
    },
  };

  return {
    transport,
    themes,
    sourceRelations,
    articleRelations,
    newsroomArticles,
    editorialArticles,
  };
}

async function createTheme(
  fake: ReturnType<typeof fakeTransport>,
  title = "Tema um",
) {
  return createEditorialThemeService(fake.transport)({
    title,
    classificationKey: "benfica",
  });
}

test("cria um Tema aberto válido sem exigir fontes, artigos ou Dossiê", async () => {
  const fake = fakeTransport();
  const result = await createEditorialThemeService(fake.transport)({
    title: "  Estoril x Rio Ave  ",
    classificationKey: "other_liga_clubs",
    contextText: "  Liga Portugal  ",
    competitionId: COMPETITION_ID,
    seasonId: SEASON_ID,
    matchdayId: MATCHDAY_ID,
    matchId: MATCH_ID,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    id: THEME_ONE_ID,
    title: "Estoril x Rio Ave",
    classificationKey: "other_liga_clubs",
    status: "open",
    context: {
      contextText: "Liga Portugal",
      competitionId: COMPETITION_ID,
      seasonId: SEASON_ID,
      matchdayId: MATCHDAY_ID,
      matchId: MATCH_ID,
    },
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(fake.sourceRelations.size, 0);
  assert.equal(fake.articleRelations.size, 0);
});

test("rejeita classificação fora das cinco chaves canónicas", async () => {
  const fake = fakeTransport();
  const result = await createEditorialThemeService(fake.transport)({
    title: "Tema inválido",
    classificationKey: "primeira_liga",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "invalid_request");
  }
  assert.equal(fake.themes.size, 0);
});

test("Tema com fonte e zero artigos é válido e a associação é idempotente", async () => {
  const fake = fakeTransport();
  const created = await createTheme(fake);
  assert.equal(created.ok, true);

  const setMembership = setEditorialThemeSourceMembershipService(
    fake.transport,
  );
  const first = await setMembership({
    themeId: THEME_ONE_ID,
    newsroomArticleId: SOURCE_ONE_ID,
    associated: true,
  });
  const duplicate = await setMembership({
    themeId: THEME_ONE_ID,
    newsroomArticleId: SOURCE_ONE_ID,
    associated: true,
  });

  assert.equal(first.ok && first.value.changed, true);
  assert.equal(duplicate.ok && duplicate.value.changed, false);
  assert.equal(fake.sourceRelations.size, 1);
  assert.equal(fake.articleRelations.size, 0);
});

test("Tema com artigo e zero fontes é válido e não duplica o canónico", async () => {
  const fake = fakeTransport();
  await createTheme(fake);
  const setMembership = setEditorialThemeArticleMembershipService(
    fake.transport,
  );

  const first = await setMembership({
    themeId: THEME_ONE_ID,
    editorialArticleId: ARTICLE_ONE_ID,
    associated: true,
  });
  const duplicate = await setMembership({
    themeId: THEME_ONE_ID,
    editorialArticleId: ARTICLE_ONE_ID,
    associated: true,
  });

  assert.equal(first.ok && first.value.changed, true);
  assert.equal(duplicate.ok && duplicate.value.changed, false);
  assert.equal(fake.articleRelations.size, 1);
  assert.equal(fake.sourceRelations.size, 0);
  assert.equal(fake.editorialArticles.size, 1);
});

test("a mesma fonte e o mesmo artigo podem pertencer a vários Temas", async () => {
  const fake = fakeTransport();
  await createTheme(fake, "Tema um");
  await createTheme(fake, "Tema dois");
  const setSource = setEditorialThemeSourceMembershipService(fake.transport);
  const setArticle = setEditorialThemeArticleMembershipService(fake.transport);

  for (const themeId of [THEME_ONE_ID, THEME_TWO_ID]) {
    assert.equal((await setSource({
      themeId,
      newsroomArticleId: SOURCE_ONE_ID,
      associated: true,
    })).ok, true);
    assert.equal((await setArticle({
      themeId,
      editorialArticleId: ARTICLE_ONE_ID,
      associated: true,
    })).ok, true);
  }

  assert.equal(fake.sourceRelations.size, 2);
  assert.equal(fake.articleRelations.size, 2);
  assert.equal(fake.newsroomArticles.size, 1);
  assert.equal(fake.editorialArticles.size, 1);
});

test("arquivar e reativar preserva todas as relações", async () => {
  const fake = fakeTransport();
  await createTheme(fake);
  await setEditorialThemeSourceMembershipService(fake.transport)({
    themeId: THEME_ONE_ID,
    newsroomArticleId: SOURCE_ONE_ID,
    associated: true,
  });
  await setEditorialThemeArticleMembershipService(fake.transport)({
    themeId: THEME_ONE_ID,
    editorialArticleId: ARTICLE_ONE_ID,
    associated: true,
  });
  const setStatus = setEditorialThemeStatusService(fake.transport);

  const archived = await setStatus({
    themeId: THEME_ONE_ID,
    status: "archived",
  });
  assert.equal(archived.ok && archived.value.status, "archived");
  assert.equal(fake.sourceRelations.size, 1);
  assert.equal(fake.articleRelations.size, 1);

  const reopened = await setStatus({
    themeId: THEME_ONE_ID,
    status: "open",
  });
  assert.equal(reopened.ok && reopened.value.status, "open");
  assert.equal(fake.sourceRelations.size, 1);
  assert.equal(fake.articleRelations.size, 1);
});

test("desassociar é explícito e repetível", async () => {
  const fake = fakeTransport();
  await createTheme(fake);
  const setSource = setEditorialThemeSourceMembershipService(fake.transport);
  await setSource({
    themeId: THEME_ONE_ID,
    newsroomArticleId: SOURCE_ONE_ID,
    associated: true,
  });

  const removed = await setSource({
    themeId: THEME_ONE_ID,
    newsroomArticleId: SOURCE_ONE_ID,
    associated: false,
  });
  const absent = await setSource({
    themeId: THEME_ONE_ID,
    newsroomArticleId: SOURCE_ONE_ID,
    associated: false,
  });

  assert.equal(removed.ok && removed.value.changed, true);
  assert.equal(absent.ok && absent.value.changed, false);
  assert.equal(fake.sourceRelations.size, 0);
});

test("associar fonte não muda revisão/uso e associar artigo não o altera", async () => {
  const fake = fakeTransport();
  await createTheme(fake);
  const newsroomBefore = structuredClone(
    fake.newsroomArticles.get(SOURCE_ONE_ID),
  );
  const articleBefore = structuredClone(
    fake.editorialArticles.get(ARTICLE_ONE_ID),
  );

  await setEditorialThemeSourceMembershipService(fake.transport)({
    themeId: THEME_ONE_ID,
    newsroomArticleId: SOURCE_ONE_ID,
    associated: true,
  });
  await setEditorialThemeArticleMembershipService(fake.transport)({
    themeId: THEME_ONE_ID,
    editorialArticleId: ARTICLE_ONE_ID,
    associated: true,
  });

  assert.deepEqual(fake.newsroomArticles.get(SOURCE_ONE_ID), newsroomBefore);
  assert.deepEqual(fake.editorialArticles.get(ARTICLE_ONE_ID), articleBefore);
});

test("edita apenas os campos próprios do Tema e mantém o estado", async () => {
  const fake = fakeTransport();
  await createTheme(fake);
  await setEditorialThemeStatusService(fake.transport)({
    themeId: THEME_ONE_ID,
    status: "archived",
  });

  const result = await updateEditorialThemeService(fake.transport)({
    themeId: THEME_ONE_ID,
    title: "  Renovação de Pote  ",
    classificationKey: "sporting",
    contextText: "  Negociação em curso  ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.title, "Renovação de Pote");
  assert.equal(result.value.classificationKey, "sporting");
  assert.equal(result.value.context.contextText, "Negociação em curso");
  assert.equal(result.value.status, "archived");
});
