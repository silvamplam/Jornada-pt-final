import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  editorialProfileContentHash,
  normalizeEditorialProfileDocument,
  validateActivateEditorialProfileVersionInput,
  validateCreateEditorialProfileVersionInput,
} from "@/lib/redacao-automatica/editorial-profile-internal";

const PROFILE_ID = "42000000-0000-4000-8000-000000000001";
const VERSION_ID = "42000000-0000-4000-8000-000000000002";
const DOCUMENT =
  "A Jornada.pt parte dos factos para identificar os problemas que condicionam a sociedade e acompanha, com espírito crítico e construtivo, as pessoas, ideias e experiências que procuram torná-la mais justa, eficiente, organizada e próspera para todos.";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("normaliza o documento e produz um hash SHA-256 determinístico", () => {
  const normalized = normalizeEditorialProfileDocument(`\r\n${DOCUMENT}\r\n`);

  assert.equal(normalized, DOCUMENT);
  assert.equal(editorialProfileContentHash(normalized).length, 64);
  assert.equal(
    editorialProfileContentHash(normalized),
    editorialProfileContentHash(DOCUMENT),
  );
});

test("valida criação explícita sem ativação implícita", () => {
  const result = validateCreateEditorialProfileVersionInput({
    profileId: PROFILE_ID,
    basedOnVersionId: VERSION_ID,
    expectedLatestVersionNumber: 1,
    documentText: DOCUMENT,
    changeSummary: "Clarifica o percurso editorial.",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.documentText, DOCUMENT);
  assert.equal(result.value.contentHash, editorialProfileContentHash(DOCUMENT));
});

test("rejeita UUIDs, documentos, resumos e expectativas inválidos", () => {
  assert.deepEqual(
    validateCreateEditorialProfileVersionInput({
      profileId: "invalid",
      basedOnVersionId: VERSION_ID,
      expectedLatestVersionNumber: 1,
      documentText: DOCUMENT,
      changeSummary: "Resumo.",
    }),
    { ok: false, error: "invalid_profile_id" },
  );
  assert.equal(
    validateCreateEditorialProfileVersionInput({
      profileId: PROFILE_ID,
      basedOnVersionId: VERSION_ID,
      expectedLatestVersionNumber: 0,
      documentText: DOCUMENT,
      changeSummary: "Resumo.",
    }).ok,
    false,
  );
  assert.equal(
    validateCreateEditorialProfileVersionInput({
      profileId: PROFILE_ID,
      basedOnVersionId: VERSION_ID,
      expectedLatestVersionNumber: 1,
      documentText: " ",
      changeSummary: "Resumo.",
    }).ok,
    false,
  );
});

test("ativação e rollback exigem IDs e evento explícito", () => {
  const activation = validateActivateEditorialProfileVersionInput({
    profileId: PROFILE_ID,
    versionId: VERSION_ID,
    expectedActiveVersionId: "42000000-0000-4000-8000-000000000003",
    eventType: "rollback",
    reason: "Retomar a versão aprovada anterior.",
  });

  assert.equal(activation.ok, true);
  assert.equal(
    validateActivateEditorialProfileVersionInput({
      profileId: PROFILE_ID,
      versionId: VERSION_ID,
      expectedActiveVersionId: VERSION_ID,
      eventType: "automatic",
      reason: null,
    }).ok,
    false,
  );
});

test("o SQL semeia o texto canónico e separa criação, ativação e pin", () => {
  const apply = read(
    "supabase/steps/43-redacao-automatica-linha-editorial-persistente-apply.sql",
  );

  assert.match(apply, new RegExp(DOCUMENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(apply, /create table public\.newsroom_editorial_profiles/i);
  assert.match(apply, /create table public\.newsroom_editorial_profile_versions/i);
  assert.match(
    apply,
    /create table public\.newsroom_editorial_profile_activation_events/i,
  );
  assert.match(
    apply,
    /create function public\.newsroom_create_editorial_profile_version/i,
  );
  assert.match(
    apply,
    /create function public\.newsroom_activate_editorial_profile_version/i,
  );
  assert.match(
    apply,
    /create function public\.newsroom_pin_editorial_profile_version_for_plan/i,
  );
  assert.match(apply, /for update/i);
  assert.match(apply, /editorial_profile_active_conflict/i);
  assert.match(apply, /editorial_profile_plan_pin_immutable/i);
  assert.match(apply, /editorial_generation_immutable/i);
  assert.match(
    apply,
    /on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing/i,
  );
  assert.doesNotMatch(apply, /on conflict\s*\(\s*submission_id\s*\)/i);
});

test("segurança SQL restringe as RPCs ao service_role", () => {
  const apply = read(
    "supabase/steps/43-redacao-automatica-linha-editorial-persistente-apply.sql",
  );

  assert.match(apply, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    apply,
    /revoke all on function public\.newsroom_create_editorial_profile_version[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    apply,
    /grant execute on function public\.newsroom_activate_editorial_profile_version[\s\S]*to service_role/i,
  );
  assert.match(apply, /force row level security/i);
  assert.doesNotMatch(apply, /grant execute[\s\S]{0,300}to (?:anon|authenticated)/i);
});

test("preflight e postflight declaram zero writes; smoke termina em rollback", () => {
  const preflight = read(
    "supabase/steps/42-redacao-automatica-linha-editorial-persistente-preflight.sql",
  );
  const postflight = read(
    "supabase/steps/44-redacao-automatica-linha-editorial-persistente-postflight.sql",
  );
  const smoke = read(
    "supabase/steps/45-redacao-automatica-linha-editorial-persistente-smoke-rollback.sql",
  );

  assert.match(preflight, /ready_to_apply/);
  assert.match(preflight, /false as writes_performed/);
  assert.match(postflight, /ready_for_smoke/);
  assert.match(postflight, /false as writes_performed/);
  assert.match(smoke, /^\s*begin;/im);
  assert.match(smoke, /smoke_passed/);
  assert.match(smoke, /writes_committed/);
  assert.match(smoke, /residue_count/);
  assert.match(smoke, /rollback;\s*$/i);
});

test("a apresentação HTML preserva o documento e evita mismatch de hidratação", () => {
  const page = read(
    "app/admin/editorial/redacao-automatica/linha-editorial/page.tsx",
  );
  const sourceValue = "\r\n  A Jornada.pt...\rLinha seguinte\r\n  ";
  const expectedValue = "\n  A Jornada.pt...\nLinha seguinte\n  ";
  const presentationValue = sourceValue.replace(/\r\n?/g, "\n");

  assert.equal(presentationValue, expectedValue);
  assert.ok(presentationValue.startsWith("\n  "));
  assert.ok(presentationValue.endsWith("\n  "));
  assert.match(
    page,
    /function normalizeEditorialProfileDocumentForHtml\(value: string\): string \{[\s\S]*return value\.replace\(\/\\r\\n\?\/g, "\\n"\);[\s\S]*\}/,
  );
  assert.match(
    page,
    /<pre><span>\{normalizeEditorialProfileDocumentForHtml\(profileResult\.profile\.activeVersion\.documentText\)\}<\/span><\/pre>/,
  );
  assert.match(
    page,
    /<pre><span>\{normalizeEditorialProfileDocumentForHtml\(version\.documentText\)\}<\/span><\/pre>/,
  );
  assert.match(
    page,
    /defaultValue=\{normalizeEditorialProfileDocumentForHtml\([\s\S]*profileResult\.profile\.activeVersion\.documentText,[\s\S]*\)\}/,
  );
  assert.doesNotMatch(page, /<pre>\{profileResult\.profile\.activeVersion\.documentText\}<\/pre>/);
  assert.doesNotMatch(page, /<pre>\{version\.documentText\}<\/pre>/);
  assert.doesNotMatch(page, /suppressHydrationWarning/);
  assert.doesNotMatch(page, /["']use client["']/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(page, /normalizeEditorialProfileDocumentForHtml[\s\S]{0,200}\.trim(?:Start|End)?\(/);
  assert.doesNotMatch(page, /editorial-profile-service/);
});

test("a interface não edita versões existentes nem ativa ao criar", () => {
  const page = read(
    "app/admin/editorial/redacao-automatica/linha-editorial/page.tsx",
  );
  const route = read(
    "app/api/admin/editorial/redacao-automatica/linha-editorial/route.ts",
  );

  assert.match(page, /name="action" value="create_version"/);
  assert.match(page, /name="action"[\s\S]*value=\{isRollback \? "rollback" : "activate"\}/);
  assert.match(page, /Guardar nova versão/);
  assert.match(page, /Ativar versão/);
  assert.match(page, /Fazer rollback/);
  assert.doesNotMatch(page, /Editar versão existente/);
  assert.match(route, /status:\s*303/);
  assert.doesNotMatch(route, /openai|publish|recolha|fetch\(/i);
});
