import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260904013000_matchday_contextual_classification_manual_correction.sql",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/classificacao/route.ts",
  "utf8",
);

const panel = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayContextualClassificationCorrectionPanel.tsx",
  "utf8",
);

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

test("7D: RPC estabelece autoridade manual sem tocar em placements", () => {
  assert.match(
    migration,
    /apply_matchday_editorial_bank_manual_classification_v1/u,
  );

  assert.match(
    migration,
    /classification_source = 'manual'/u,
  );

  assert.match(
    migration,
    /authorize_matchday_editorial_bank_classification_writes/u,
  );

  assert.match(
    migration,
    /revoke_matchday_editorial_bank_classification_writes/u,
  );

  assert.match(
    migration,
    /refresh_matchday_editorial_profile_distribution/u,
  );

  assert.match(
    migration,
    /grant execute[\s\S]*to service_role/u,
  );

  assert.doesNotMatch(
    migration,
    /matchday_live_layout_placements|matchday_live_layout_items/u,
  );

  assert.doesNotMatch(
    migration,
    /apply_matchday_agenda_tv_sync/u,
  );
});

test("7D: classificação anterior pode passar a autoridade manual", () => {
  assert.match(
    migration,
    /classification_source[\s\S]*is distinct from 'manual'/u,
  );

  assert.doesNotMatch(
    migration,
    /classification_source = 'continuity_assisted'[\s\S]{0,150}return false/u,
  );
});

test("7D: endpoint é administrativo e limitado à Mesa viva", () => {
  assert.match(
    route,
    /ADMIN_SESSION_COOKIE[\s\S]*verifyAdminSession/u,
  );

  assert.match(
    route,
    /matchday_editorial_desk_control/u,
  );

  assert.match(
    route,
    /is_managed=eq\.true/u,
  );

  assert.match(
    route,
    /rpc\/apply_matchday_editorial_bank_manual_classification_v1/u,
  );

  assert.doesNotMatch(
    route,
    /apply_matchday_editorial_profile_workspace/u,
  );

  assert.doesNotMatch(
    route,
    /apply_matchday_agenda_tv_sync|agenda-tv/u,
  );
});

test("7D: painel não participa no draft editorial", () => {
  assert.match(
    panel,
    /organizar\/classificacao/u,
  );

  assert.match(
    panel,
    /classificationKey/u,
  );

  assert.match(
    panel,
    /router\.refresh\(\)/u,
  );

  assert.doesNotMatch(
    panel,
    /commitDraft|currentDraft|applyChanges|setEditorState/u,
  );

  assert.doesNotMatch(
    panel,
    /runAgendaTvAction|agenda-tv/u,
  );
});

test("7D: UI e mensagem usam o label canónico da classificação", () => {
  assert.match(panel, /articleClassificationLabel\(zone\.key\)/u);
  assert.match(panel, /articleClassificationLabel\(currentZone\.key\)/u);
  assert.doesNotMatch(panel, /\{zone\.label\}|currentZone\?\.label/u);
  assert.match(route, /articleClassificationLabel\(classificationKey\)/u);
  assert.doesNotMatch(route, /targetZone\.label/u);
});

test("7D: os cinco menus ficam consecutivos antes da coluna flexível do Modo foco", () => {
  assert.match(
    client,
    /\.thematic-global-tools \{[^}]*grid-template-columns: repeat\(4, max-content\) minmax\(0, 1fr\)/u,
  );

  const tools =
    client.indexOf(
      'className="thematic-global-tools"',
    );

  const page =
    client.indexOf(
      'className="thematic-global-tool" ref={pageStructureRef}',
      tools,
    );

  const video =
    client.indexOf(
      "<summary>Vídeos</summary>",
      tools,
    );

  const agenda =
    client.indexOf(
      "<summary>Agenda e TV</summary>",
      tools,
    );

  const actions =
    client.indexOf(
      'className="thematic-global-actions"',
      agenda,
    );

  const classification =
    client.indexOf(
      "<summary>Corrigir classificação</summary>",
      actions,
    );

  const latest =
    client.indexOf(
      "<summary>A acontecer agora</summary>",
      classification,
    );

  const focus =
    client.indexOf(
      'className="thematic-focus-toggle thematic-focus-entry"',
      latest,
    );

  const workspace =
    client.indexOf(
      'className={`thematic-desk-grid',
      focus,
    );

  assert.ok(
    tools >= 0
      && page > tools
      && video > page
      && agenda > video
      && actions > agenda
      && classification > actions
      && latest > classification
      && focus > latest
      && workspace > focus,
  );

  const toolbar = client.slice(tools, workspace);
  assert.doesNotMatch(toolbar, /Controlos de seleção|Selecionar candidatas|Limpar marcação/u);

  assert.match(
    client,
    /\.thematic-global-actions \{[^}]*display: flex;[^}]*justify-content: flex-start/u,
  );
});
test("7D: pesquisa contextual exige escolha explícita", () => {
  assert.match(
    panel,
    /aria-label="Pesquisar notícias para corrigir classificação"/u,
  );

  assert.match(
    panel,
    /\.normalize\("NFD"\)/u,
  );

  assert.match(
    panel,
    /filteredItems/u,
  );

  assert.match(
    panel,
    /item\.label \?\? ""[\s\S]*item\.title/u,
  );

  assert.match(
    panel,
    /filteredItems\.map\(\(item\)/u,
  );

  assert.match(
    panel,
    /const \[\s*bankItemId,\s*setBankItemId,\s*\] = useState\(""\);/u,
  );

  assert.match(
    panel,
    /setBankItemId\(""\)/u,
  );

  assert.match(
    panel,
    /state === "saving"[\s\S]*\|\| !selectedItem/u,
  );
});
