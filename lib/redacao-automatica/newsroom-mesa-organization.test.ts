import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMesaOrganization, filterMesaOrganization, sourceIsUnassigned, suggestedThemeClassification, visibleMesaItems,
  type MesaOrganizationRecords } from "@/lib/redacao-automatica/newsroom-mesa-organization-internal";
import { createOperationalDeskReadModel, type OperationalDeskReadTransport, type OperationalDeskSourceItem } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";
import { compareSourceParagraphs } from "@/lib/redacao-automatica/newsroom-source-comparison";
import { EMPTY_MESA_PREPARATION_BUFFER, selectMesaMaterial, observeMesaMaterial, changeMesaPreparationTheme, mesaPreparationPayload,
  readMesaPreparationBuffer, writeMesaPreparationBuffer } from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";
import { prepareEditorialDossierWorkspaceService, type EditorialDossierProductionWorkspaceTransport } from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const when = "2026-09-10T12:00:00Z";
const source = (n = 1): OperationalDeskSourceItem => ({
  newsroomArticleId: id(n), lifecycle: "new", sourceCode: "record", sourceName: "Record", title: `Fonte ${n}`,
  subtitle: null, summary: null, imageCandidateUrl: null, publishedAt: when, firstDetectedAt: when, lastDetectedAt: when, url: null,
  snapshot: { id: id(100 + n), body: [{ type: "paragraph", text: "Informação" }], sourceMetadata: {}, contentHash: "hash", createdAt: when, extractedAt: when },
  classification: { status: "classified", classificationKey: "sporting", classificationSource: "automatic", classifiedAt: when, updatedAt: when },
  themeMembership: { status: "none", themeIds: [] }, dossierMembership: [], publishedContributions: [], sourceUpdated: false,
});
const records = (): MesaOrganizationRecords => ({
  themes: [{ id: id(10), title: "Jogo do Sporting", classification_key: "sporting", status: "open", updated_at: when }],
  dossiers: [{ id: id(20), title: "Cobertura", status: "draft", created_at: when, updated_at: when }],
  themeDossiers: [], themeSources: [], dossierSources: [], publishedLinks: [], themeArticles: [],
});
function transport(overrides: Partial<OperationalDeskReadTransport> = {}): OperationalDeskReadTransport {
  return {
    isConfigured: () => true,
    listCycleArticles: async () => [{ id: id(1), title: "Fonte", source_code: "record", source_name: "Record", original_url: null,
      normalized_url: null, subtitle: null, summary: null, image_url: null, published_at: when, first_detected_at: when, last_detected_at: when, processing_status: "ready_for_review" }],
    readLatestSnapshots: async () => [{ id: id(101), article_id: id(1), content_hash: "hash", body: [], source_metadata: {}, created_at: when, extracted_at: when, has_usable_snapshot: true }],
    readReviewStates: async () => [], readClassifications: async () => [], readThemeSources: async () => [], readLegacyUsage: async () => [],
    readDossierSources: async () => [], readPlanAssignments: async () => [], readPlans: async () => [], readDossiers: async () => [], readPublishedArticles: async () => [],
    ...overrides,
  };
}

test("associar a Tema retira de NOVAS sem falsificar publicação", async () => {
  const result = await createOperationalDeskReadModel(transport({ readThemeSources: async () => [{ theme_id: id(10), newsroom_article_id: id(1) }] }))();
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.value.novas.items.length, 0);
  assert.equal(result.value.sources[0].lifecycle, "new");
  assert.equal(result.value.publicadas.items.length, 0);
  assert.deepEqual(result.value.sources[0].themeMembership.themeIds, [id(10)]);
});

test("preparation_key não apaga um Dossiê editorial histórico legítimo", async () => {
  const result = await createOperationalDeskReadModel(transport({
    readDossierSources: async () => [{ id: id(40), dossier_id: id(20), newsroom_article_id: id(1), newsroom_snapshot_id: id(101), included: true }],
    readDossiers: async () => [{ id: id(20), title: "Cobertura", preparation_key: id(90) }],
  }))();
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.value.novas.items.length, 0); assert.equal(result.value.sources[0].lifecycle, "new");
  assert.deepEqual(result.value.sources[0].dossierMembership, [id(20)]);
});

test("workspace técnico ativo não retira a fonte de NOVAS nem conta como Dossiê", async () => {
  const result = await createOperationalDeskReadModel(transport({
    readDossierSources: async () => [{ id: id(40), dossier_id: id(20), newsroom_article_id: id(1), newsroom_snapshot_id: id(101), included: true }],
    readDossiers: async () => [{ id: id(20), title: "Contentor", preparation_key: id(90) }],
    readProductionContexts: async () => [{
      dossier_id: id(20),
      theme_id: null,
      source_refs: [{ newsroomArticleId: id(1), newsroomSnapshotId: id(101) }],
      created_at: when,
      workspace_role: "technical",
      workspace_contract_version: 2,
      workspace_state: "active",
    }],
  }))();
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.value.novas.items.length, 1);
  assert.equal(result.value.sources[0].lifecycle, "new");
  assert.deepEqual(result.value.sources[0].dossierMembership, []);
});

test("efeito lateral antigo de PREPARAR no Tema é ignorado, sem apagar a relação", async () => {
  const result = await createOperationalDeskReadModel(transport({
    readThemeSources: async () => [{
      theme_id: id(10),
      newsroom_article_id: id(1),
      reference_snapshot_id: id(101),
      added_at: when,
    }],
    readDossierSources: async () => [{ id: id(40), dossier_id: id(20), newsroom_article_id: id(1), newsroom_snapshot_id: id(101), included: true }],
    readDossiers: async () => [{ id: id(20), title: "Contentor", preparation_key: id(90) }],
    readProductionContexts: async () => [{
      dossier_id: id(20),
      theme_id: id(10),
      source_refs: [{ newsroomArticleId: id(1), newsroomSnapshotId: id(101) }],
      created_at: when,
      workspace_role: "technical",
      workspace_contract_version: 2,
      workspace_state: "active",
    }],
  }))();
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.value.novas.items.length, 1);
  assert.deepEqual(result.value.sources[0].themeMembership, { status: "none", themeIds: [] });
});

test("relação de Tema anterior a PREPARAR é preservada exatamente", async () => {
  const result = await createOperationalDeskReadModel(transport({
    readThemeSources: async () => [{
      theme_id: id(10),
      newsroom_article_id: id(1),
      reference_snapshot_id: id(101),
      added_at: "2026-09-09T12:00:00Z",
    }],
    readDossierSources: async () => [{ id: id(40), dossier_id: id(20), newsroom_article_id: id(1), newsroom_snapshot_id: id(101), included: true }],
    readDossiers: async () => [{ id: id(20), title: "Contentor", preparation_key: id(90) }],
    readProductionContexts: async () => [{
      dossier_id: id(20),
      theme_id: id(10),
      source_refs: [{ newsroomArticleId: id(1), newsroomSnapshotId: id(101) }],
      created_at: when,
      workspace_role: "technical",
      workspace_contract_version: 2,
      workspace_state: "active",
    }],
  }))();
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.value.novas.items.length, 0);
  assert.deepEqual(result.value.sources[0].themeMembership.themeIds, [id(10)]);
});

test("assignments técnicos não publicam fontes; só a proveniência final usada muda o ciclo", async () => {
  const baseArticles = [1, 2].map((n) => ({
    id: id(n),
    title: `Fonte ${n}`,
    source_code: "record",
    source_name: "Record",
    original_url: null,
    normalized_url: null,
    subtitle: null,
    summary: null,
    image_url: null,
    published_at: when,
    first_detected_at: when,
    last_detected_at: when,
    processing_status: "ready_for_review",
  }));
  const result = await createOperationalDeskReadModel(transport({
    listCycleArticles: async () => baseArticles,
    readLatestSnapshots: async () => [1, 2].map((n) => ({
      id: id(100 + n),
      article_id: id(n),
      content_hash: `hash-${n}`,
      body: [],
      source_metadata: {},
      created_at: when,
      extracted_at: when,
      has_usable_snapshot: true,
    })),
    readDossierSources: async () => [1, 2].map((n) => ({
      id: id(39 + n),
      dossier_id: id(20),
      newsroom_article_id: id(n),
      newsroom_snapshot_id: id(100 + n),
      included: true,
    })),
    readPlanAssignments: async () => [1, 2].map((n) => ({
      dossier_id: id(20),
      article_plan_id: id(50),
      dossier_source_id: id(39 + n),
    })),
    readFinalUsage: async () => [{
      dossier_id: id(20),
      article_plan_id: id(50),
      dossier_source_id: id(40),
      editorial_article_id: id(201),
    }],
    readProductionContexts: async () => [{
      dossier_id: id(20),
      theme_id: null,
      source_refs: [1, 2].map((n) => ({ newsroomArticleId: id(n), newsroomSnapshotId: id(100 + n) })),
      created_at: when,
      workspace_role: "technical",
      workspace_contract_version: 2,
      workspace_state: "consolidated",
    }],
    readPlans: async () => [{ id: id(50), dossier_id: id(20), editorial_article_id: id(201) }],
    readDossiers: async () => [{ id: id(20), title: "Contentor", preparation_key: id(90) }],
    readPublishedArticles: async () => [{
      id: id(201),
      slug: "artigo-publicado",
      title: "Artigo publicado",
      status: "published",
      published_at: when,
    }],
  }))();
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.value.sources.find((item) => item.newsroomArticleId === id(1))?.lifecycle, "published");
  assert.equal(result.value.sources.find((item) => item.newsroomArticleId === id(2))?.lifecycle, "new");
  assert.deepEqual(result.value.publicadas.items.map((item) => item.newsroomArticleId), [id(1)]);
  assert.deepEqual(result.value.novas.items.map((item) => item.newsroomArticleId), [id(2)]);
});

test("fonte retirada de todos os contextos e sem publicação volta a ficar por encaminhar", () => {
  assert.equal(sourceIsUnassigned(source()), true);
  assert.equal(sourceIsUnassigned({ ...source(), dossierMembership: [id(20)] }), false);
  assert.equal(sourceIsUnassigned({ ...source(), themeMembership: { status: "associated", themeIds: [id(10)] } }), false);
  assert.equal(sourceIsUnassigned({ ...source(), lifecycle: "published" }), false);
});

test("fonte com Tema não desaparece do contexto por um descarte geral anterior", async () => {
  const result = await createOperationalDeskReadModel(transport({
    readThemeSources: async () => [{ theme_id: id(10), newsroom_article_id: id(1) }],
    readReviewStates: async () => [{ newsroom_article_id: id(1), decision: "dismissed", reviewed_snapshot_id: id(101), reviewed_at: when }],
  }))();
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.value.sources.length, 1); assert.equal(result.value.novas.items.length, 0);
});

test("estado de Tema conta apenas IDs publicados provados e não duplica o Dossiê", () => {
  const data = { ...records(), themeDossiers: [{ theme_id: id(10), dossier_id: id(20) }],
    themeSources: [{ theme_id: id(10), newsroom_article_id: id(1), reference_snapshot_id: id(101) }],
    dossierSources: [{ dossier_id: id(20), newsroom_article_id: id(1), newsroom_snapshot_id: id(101), included: true }],
    publishedLinks: [1, 2, 3].map((n) => ({ dossier_id: id(20), editorial_article_id: id(200 + n) })),
    themeArticles: [{ theme_id: id(10), editorial_article_id: id(201) }],
  };
  const organization = buildMesaOrganization(data, [source()]);
  assert.equal(organization.themes[0].articleCount, 3); assert.equal(organization.themes[0].dossiers.length, 0); // Uma fonte, mesmo com três artigos, não é Dossiê.
  assert.equal(organization.unlinkedDossiers.length, 0); assert.equal(organization.themes[0].sourceCount, 1);
});

test("fontes num contentor técnico não inventam Tema, Dossiê ou Produção editorial", () => {
  const data = { ...records(), themeSources: [{ theme_id: id(10), newsroom_article_id: id(1), reference_snapshot_id: null }],
    dossierSources: [{ dossier_id: id(20), newsroom_article_id: id(1), newsroom_snapshot_id: id(101), included: true }] };
  const organization = buildMesaOrganization(data, [source()]);
  assert.equal(organization.themes[0].dossiers.length, 0); assert.equal(organization.unlinkedDossiers.length, 0);
  assert.equal("preparedProductions" in organization, false);
});

test("visto no Tema usa apenas a revisão editorial do Tema", () => {
  const data = { ...records(), themeDossiers: [{ theme_id: id(10), dossier_id: id(20) }],
    themeSources: [{ theme_id: id(10), newsroom_article_id: id(1), reference_snapshot_id: id(101) }],
    dossierSources: [{ dossier_id: id(20), newsroom_article_id: id(1), newsroom_snapshot_id: id(99), included: true }] };
  const organization = buildMesaOrganization(data, [source()]);
  assert.equal(organization.themes[0].updatedSourceCount, 0);
  assert.equal("preparedProductions" in organization, false);
});

test("sem referência anterior não inventa aviso de alteração", () => {
  const data = { ...records(), themeSources: [{ theme_id: id(10), newsroom_article_id: id(1), reference_snapshot_id: null }] };
  assert.equal(buildMesaOrganization(data, [source()]).themes[0].updatedSourceCount, 0);
});

test("uso isolado de uma fonte não promove o Source Package inteiro a Dossiê", () => {
  const item: OperationalDeskSourceItem = { ...source(), lifecycle: "published", publishedContributions: [{
    origin: "legacy_source_package", editorialArticleId: id(201), title: "Crónica", slug: "cronica", publishedAt: when,
    packageId: id(30), packageYear: "2026", packageMonth: "09", usedAt: when, newsroomSnapshotId: id(101),
  }] };
  const organization = buildMesaOrganization({ ...records(), dossiers: [] }, [item]);
  assert.equal(organization.unlinkedDossiers.length, 0);
  assert.equal(item.publishedContributions[0].origin, "legacy_source_package");
});

test("leitura da Mesa não transfere corpo integral das fontes", () => {
  const server = readFileSync("lib/redacao-automatica/newsroom-operational-desk-read-model.ts", "utf8");
  assert.match(server, /has_usable_snapshot/);
  assert.doesNotMatch(server, /select=id,article_id,content_hash,body,source_metadata/);
});

test("atualização recebida não troca snapshot nem key da seleção", () => {
  const item = { kind: "source" as const, lifecycle: "new" as const, newsroomArticleId: id(1), newsroomSnapshotId: id(101),
    title: "Original", sourceLabel: "Record", imageUrl: null, classificationKey: "sporting" as const };
  const selected = selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER, item, () => id(90));
  const newer = { ...item, newsroomSnapshotId: id(102), title: "Atualizada", classificationKey: "benfica" as const };
  const observed = observeMesaMaterial(selected, newer);
  assert.equal(observed.sources[0].newsroomSnapshotId, id(101)); assert.equal(observed.preparationKey, id(90));
  assert.equal(observed.sources[0].title, "Original"); assert.equal(observed.sources[0].classificationKey, "benfica");
  const explicit = selectMesaMaterial(observed, newer, () => id(91));
  assert.equal(explicit.sources[0].newsroomSnapshotId, id(102)); assert.equal(explicit.preparationKey, id(91));
});

test("reabrir seleção conserva Tema, título, versões e chave", () => {
  const item = { kind: "source" as const, lifecycle: "new" as const, newsroomArticleId: id(1), newsroomSnapshotId: id(101),
    title: "Original", sourceLabel: "Record", imageUrl: null, classificationKey: "sporting" as const };
  const buffer = changeMesaPreparationTheme(selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER, item, () => id(90)), id(10), "Jogo", () => id(91));
  const restored = readMesaPreparationBuffer(writeMesaPreparationBuffer(buffer));
  assert.deepEqual(restored, buffer); assert.equal(mesaPreparationPayload(restored)?.themeId, id(10));
});

test("mais material num painel não desloca nem limita o outro", () => {
  const a = Array.from({ length: 101 }, (_, n) => n), b = [1, 2, 3];
  assert.equal(visibleMesaItems(a, 24).length, 24); assert.equal(visibleMesaItems(a, 120).length, 101);
  assert.deepEqual(visibleMesaItems(b, 24), b); assert.equal(a.length, 101);
  const ui = readFileSync("app/admin/editorial/redacao-automatica/mesa/_mesa-organization-client.tsx", "utf8");
  const window = ui.slice(ui.indexOf("export function MesaSourceWindow"), ui.indexOf("export function MesaDossierCardView"));
  assert.doesNotMatch(window, /router\.(push|replace)|mesaHref|offset/);
});

test("classificação do Tema só é sugerida se todo o conjunto concordar", () => {
  assert.equal(suggestedThemeClassification([{ classificationKey: "sporting" }]), "sporting");
  assert.equal(suggestedThemeClassification([{ classificationKey: "sporting" }, { classificationKey: null }]), null);
  assert.equal(suggestedThemeClassification([{ classificationKey: "sporting" }, { classificationKey: "benfica" }]), null);
});

test("filtros não eliminam contexto persistido", () => {
  const organization = buildMesaOrganization(records(), [source()]);
  assert.equal(filterMesaOrganization(organization, "benfica").themes.length, 0);
  assert.equal(filterMesaOrganization(organization, "sporting").themes.length, 1);
  assert.equal(organization.themes.length, 1);
});

test("comparação distingue acrescentos, remoções e texto inalterado", () => {
  const blocks = (...texts: string[]) => texts.map((text) => ({ type: "paragraph", text }));
  const diff = compareSourceParagraphs(blocks("Resultado", "Declaração antiga", "Final"), blocks("Resultado", "Correção", "Final", "Reação nova"));
  assert.deepEqual(diff.before.map((item) => item.changed), [false, true, false]);
  assert.deepEqual(diff.after.map((item) => item.changed), [false, true, false, true]);
  assert.equal(diff.exactAlignment, true);
});

test("comparação não executa HTML e suporta parágrafos repetidos", () => {
  const body = [{ text: "<script>alert(1)</script>" }, { text: "Repetido" }, { text: "Repetido" }];
  const diff = compareSourceParagraphs(body, body.slice(0, 2));
  assert.equal(diff.after[0].text, "<script>alert(1)</script>");
  assert.equal(diff.before.filter((item) => item.changed).length, 1);
  assert.doesNotMatch(readFileSync("app/admin/editorial/redacao-automatica/mesa/_mesa-source-changes.tsx", "utf8"), /dangerouslySetInnerHTML/);
});

test("fontes muito extensas usam comparação limitada sem perder os textos", () => {
  const body = Array.from({ length: 510 }, (_, n) => ({ text: `${n}` }));
  const diff = compareSourceParagraphs(body, body);
  assert.equal(diff.exactAlignment, false); assert.equal(diff.before.length, 510); assert.equal(diff.after.length, 510);
});

test("preparar no Tema encaminha a relação ao writer e mantém compatibilidade sem Tema", async () => {
  const requests: unknown[] = [];
  const runtime: EditorialDossierProductionWorkspaceTransport = {
    configuration: () => ({ supabaseUrl: "https://example.invalid" }),
    prepareWorkspace: async (input) => { requests.push(input); return { dossierId: id(20), preparationAction: "created", sourceCount: 1, imageCount: 0, publishedContextCount: 0 }; },
    saveArticlePlanState: async () => null, addUploadImage: async () => null,
  };
  const prepare = prepareEditorialDossierWorkspaceService(runtime);
  const input = { preparationKey: id(90), title: "Cobertura", sources: [{ newsroomArticleId: id(1), newsroomSnapshotId: id(101) }], publishedContextArticleIds: [] };
  assert.equal((await prepare(input)).ok, true);
  assert.equal((await prepare({ ...input, themeId: id(10) })).ok, true);
  assert.equal("p_theme_id" in (requests[0] as object), false);
  assert.equal((requests[1] as { p_theme_id: string }).p_theme_id, id(10));
  assert.equal((await prepare({ ...input, themeId: "invalid" })).ok, false);
  assert.equal(requests.length, 2);
});

test("SQL aditivo conserva authorities e não publica nem reescreve produções", () => {
  const sql = readFileSync("supabase/migrations/20260910223000_newsroom_mesa_theme_organization_v1.sql", "utf8");
  assert.match(sql, /dossier_id uuid primary key references public\.newsroom_editorial_dossiers/);
  assert.match(sql, /newsroom_prepare_editorial_dossier_workspace_v1\(/);
  assert.match(sql, /newsroom_set_editorial_theme_source_membership_v1\(/);
  assert.match(sql, /request-conflict/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /source-in-dossier/);
  assert.doesNotMatch(sql, /(?:update|insert into|delete from)\s+public\.editorial_articles/i);
  assert.doesNotMatch(sql, /update\s+public\.newsroom_editorial_dossier_sources/i);
});

test("a seleção geral não fica contaminada pela seleção de um Tema", () => {
  const client = readFileSync("app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx", "utf8");
  assert.match(client, /mesaPreparationStorageKey\(themeContext\?\.id\)/);
  assert.match(client, /destination\.sources\.length \+ \(destination\.dossiers\?\.length \?\? 0\) === 0/);
  assert.match(client, /mesaPreparationStorageKey\(id\) === storageKey/);
  assert.match(client, /current\.sources\.filter\(\(source\) => !requested\.has/);
});

test("relação de Dossiê no SQL não usa o conflito de coluna ambígua", () => {
  const sql = readFileSync("supabase/migrations/20260910223000_newsroom_mesa_theme_organization_v1.sql", "utf8");
  assert.match(sql, /on conflict on constraint newsroom_editorial_theme_dossiers_pkey/);
  assert.doesNotMatch(sql, /on conflict \(dossier_id\)/);
});


test("contadores acompanham explicitamente o universo NOVAS ou PUBLICADAS visível", () => {
  const page = readFileSync("app/admin/editorial/redacao-automatica/mesa/page.tsx", "utf8");
  const count = page.slice(page.indexOf("function sumVisibleCount("), page.indexOf("function fixtureClassification("));
  const visibleUniverse = page.slice(page.indexOf("const groupedSourceIds"), page.indexOf("const activeLifecycle"));
  assert.match(count, /lifecycle === "published" \? counts\.publicadas : counts\.novas/);
  assert.match(count, /return universe\.total/);
  assert.match(visibleUniverse, /const looseNewItems = [\s\S]*?filter\(sourceIsUnassigned\)/);
  assert.match(visibleUniverse, /const loosePublishedItems = [\s\S]*?item\.lifecycle === "published"[\s\S]*?themeIds\.length === 0[\s\S]*?!groupedSourceIds\.has/);
  assert.match(visibleUniverse, /novas: countFor\(looseNewItems\)/);
  assert.match(visibleUniverse, /publicadas: countFor\(loosePublishedItems\)/);
  assert.doesNotMatch(visibleUniverse, /sourceResult\.value\.counts/);
  assert.match(page, /activeLifecycle === "published"/);
  assert.match(page, /activeLifecycle === "published" \? counts\?\.publicadas\.total/);
  assert.match(page, /activeLifecycle === "published" \? "publicadas" : "novas"/);
});
