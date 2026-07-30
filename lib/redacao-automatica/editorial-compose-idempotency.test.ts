import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CompositionSubmitEnhancer, {
  installCompositionSubmitEnhancer,
} from "@/app/admin/editorial/redacao-automatica/_compositionSubmitEnhancer";

import {
  isEditorialComposeSubmissionId,
  normalizeEditorialComposeInput,
  runEditorialComposeGeneration,
  type EditorialComposeInput,
} from "./editorial-compose-idempotency-internal";

const SUBMISSION_ID = "30000000-0000-4000-8000-000000000001";
const ARTICLE_ONE_ID = "30000000-0000-4000-8000-000000000002";
const ARTICLE_TWO_ID = "30000000-0000-4000-8000-000000000003";
const SNAPSHOT_ONE_ID = "30000000-0000-4000-8000-000000000004";
const SNAPSHOT_TWO_ID = "30000000-0000-4000-8000-000000000005";

function input(overrides: Partial<EditorialComposeInput> = {}): EditorialComposeInput {
  return {
    submissionId: SUBMISSION_ID,
    workingTitle: "Synthetic acceptance draft",
    combineInstructions: "Lead with the first synthetic source.",
    highlightInstructions: "Highlight only synthetic facts.",
    contextInstructions: "Synthetic context.",
    avoidInstructions: "Avoid unsupported synthetic conclusions.",
    articleKind: "news",
    lengthMode: "standard",
    outputLanguage: "pt-PT",
    sources: [
      {
        newsroomArticleId: ARTICLE_TWO_ID,
        newsroomSnapshotId: SNAPSHOT_TWO_ID,
        priority: 2,
        sourceRole: "context",
        editorialNote: "",
      },
      {
        newsroomArticleId: ARTICLE_ONE_ID,
        newsroomSnapshotId: SNAPSHOT_ONE_ID,
        priority: 1,
        sourceRole: "primary",
        editorialNote: "Synthetic note",
      },
    ],
    ...overrides,
  };
}

test("fingerprint é determinístico após normalização e inclui snapshots e ordem", () => {
  const first = normalizeEditorialComposeInput(input());
  const repeated = normalizeEditorialComposeInput(input({
    workingTitle: "  Synthetic acceptance draft  ",
    combineInstructions: "Lead with the first synthetic source.\r\n",
    sources: input().sources.slice().reverse(),
  }));
  assert.ok(first);
  assert.ok(repeated);
  assert.equal(first.fingerprint, repeated.fingerprint);
  assert.deepEqual(
    first.sources.map((source) => [source.newsroomArticleId, source.newsroomSnapshotId, source.priority]),
    [
      [ARTICLE_ONE_ID, SNAPSHOT_ONE_ID, 1],
      [ARTICLE_TWO_ID, SNAPSHOT_TWO_ID, 2],
    ],
  );
});

test("mesma chave com payload editorial diferente produz fingerprint diferente", () => {
  const baseline = normalizeEditorialComposeInput(input());
  const changedSnapshot = normalizeEditorialComposeInput(input({
    sources: input().sources.map((source, index) => (
      index === 0 ? { ...source, newsroomSnapshotId: SNAPSHOT_ONE_ID } : source
    )),
  }));
  const changedInstruction = normalizeEditorialComposeInput(input({
    highlightInstructions: "Different synthetic highlight.",
  }));
  assert.ok(baseline && changedSnapshot && changedInstruction);
  assert.notEqual(baseline.fingerprint, changedSnapshot.fingerprint);
  assert.notEqual(baseline.fingerprint, changedInstruction.fingerprint);
});

test("chave ausente ou inválida e fontes sem snapshot são rejeitadas", () => {
  assert.equal(isEditorialComposeSubmissionId(""), false);
  assert.equal(isEditorialComposeSubmissionId("not-a-uuid"), false);
  assert.equal(isEditorialComposeSubmissionId(SUBMISSION_ID), true);
  assert.equal(normalizeEditorialComposeInput(input({ submissionId: "" })), null);
  assert.equal(normalizeEditorialComposeInput(input({
    sources: [{ ...input().sources[0], newsroomSnapshotId: "" }],
  })), null);
});

test("UI envia UUID e snapshot congelado, desativa apenas como proteção complementar", () => {
  const page = readFileSync("app/admin/editorial/redacao-automatica/page.tsx", "utf8");
  const enhancer = readFileSync(
    "app/admin/editorial/redacao-automatica/_compositionSubmitEnhancer.tsx",
    "utf8",
  );
  assert.match(page, /name="submission_id" value=\{compositionSubmissionId\}/);
  assert.match(page, /name=\{`source_snapshot_\$\{article\.id\}`\}/);
  assert.match(page, /value=\{article\.latestSnapshotId \?\? ""\}/);
  assert.match(page, /<CompositionSubmitEnhancer \/>/);
  assert.match(enhancer, /button\.disabled = true/);
  assert.match(page, /data-composition-submit-status/);
});

test("submit enhancer hidrata sem mutar HTML e bloqueia apenas repeticoes", () => {
  const page = readFileSync("app/admin/editorial/redacao-automatica/page.tsx", "utf8");
  const enhancer = readFileSync(
    "app/admin/editorial/redacao-automatica/_compositionSubmitEnhancer.tsx",
    "utf8",
  );
  const formListeners = new Map<string, EventListenerOrEventListenerObject>();
  const pageListeners = new Map<string, EventListenerOrEventListenerObject>();
  const button = {
    disabled: false,
    textContent: "Gerar primeira versao",
  };
  const status = { hidden: true };
  const form = {
    querySelector(selector: string) {
      if (selector === "[data-composition-submit]") {
        return button;
      }
      if (selector === "[data-composition-submit-status]") {
        return status;
      }
      return null;
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      formListeners.set(type, listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (formListeners.get(type) === listener) {
        formListeners.delete(type);
      }
    },
  } as unknown as HTMLFormElement;
  const pageLifecycle = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      pageListeners.set(type, listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (pageListeners.get(type) === listener) {
        pageListeners.delete(type);
      }
    },
  } as unknown as EventTarget;
  const invoke = (
    listener: EventListenerOrEventListenerObject | undefined,
    event: Event,
  ) => {
    assert.ok(listener);
    if (typeof listener === "function") {
      listener(event);
    } else {
      listener.handleEvent(event);
    }
  };

  assert.equal(
    renderToStaticMarkup(createElement(CompositionSubmitEnhancer)),
    "",
  );
  assert.match(enhancer, /^"use client";/);
  assert.match(enhancer, /useEffect\(\(\) => \{/);
  assert.match(enhancer, /return installCompositionSubmitEnhancer\(form\)/);
  assert.doesNotMatch(page, /compositionSubmitEnhancer\s*=\s*`/);
  assert.doesNotMatch(
    page,
    /dangerouslySetInnerHTML[\s\S]{0,120}compositionSubmitEnhancer/,
  );
  assert.doesNotMatch(
    `${page}\n${enhancer}`,
    /data-submit-enhanced|dataset\.submitEnhanced/,
  );
  assert.doesNotMatch(
    enhancer,
    /DOMContentLoaded|MutationObserver|setAttribute/,
  );

  const cleanup = installCompositionSubmitEnhancer(form, pageLifecycle);

  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Gerar primeira versao");
  assert.equal(status.hidden, true);

  let firstPrevented = 0;
  invoke(formListeners.get("submit"), {
    preventDefault() {
      firstPrevented += 1;
    },
  } as unknown as Event);
  assert.equal(firstPrevented, 0);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "A preparar a primeira versão…");
  assert.equal(status.hidden, false);

  let secondPrevented = 0;
  invoke(formListeners.get("submit"), {
    preventDefault() {
      secondPrevented += 1;
    },
  } as unknown as Event);
  assert.equal(secondPrevented, 1);

  invoke(pageListeners.get("pageshow"), new Event("pageshow"));
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Gerar primeira versão");
  assert.equal(status.hidden, true);

  cleanup();
  assert.equal(formListeners.has("submit"), false);
  assert.equal(pageListeners.has("pageshow"), false);
});

test("rota só chama a geração depois do claim e reutiliza o mesmo artigo", () => {
  const route = readFileSync(
    "app/api/admin/editorial/redacao-automatica/dossies/route.ts",
    "utf8",
  );
  const prepareIndex = route.indexOf("const composeResult = await prepareEditorialCompose");
  const orchestrationIndex = route.indexOf("const generationResult = await runEditorialComposeGeneration");
  assert.ok(prepareIndex >= 0 && prepareIndex < orchestrationIndex);
  assert.match(route, /claim: \(\) => claimEditorialComposeGeneration/);
  assert.match(route, /generate: \(\) => generateEditorialDossierArticlePlanDraftBody/);
  assert.match(route, /articleId: composition\.editorialArticleId/g);
  assert.match(route, /markEditorialComposeGenerationFailed/);
  assert.match(route, /markEditorialComposeGenerationCompleted/);
});

test("duas chamadas simuladas com a mesma chave só iniciam uma geração", async () => {
  let claimOwner = false;
  let generationCalls = 0;
  let completed = false;
  const dependencies = () => ({
    async claim() {
      if (completed) {
        return { action: "completed" as const, editorialArticleId: ARTICLE_ONE_ID };
      }
      if (claimOwner) {
        return { action: "in_progress" as const, editorialArticleId: ARTICLE_ONE_ID };
      }
      claimOwner = true;
      return { action: "claimed" as const, editorialArticleId: ARTICLE_ONE_ID };
    },
    async generate() {
      generationCalls += 1;
      await Promise.resolve();
      return {
        ok: true as const,
        value: { editorialArticleId: ARTICLE_ONE_ID, action: "generated" as const },
      };
    },
    async fail() {
      claimOwner = false;
    },
    async complete() {
      completed = true;
      claimOwner = false;
    },
  });
  const composition = {
    dossierId: SUBMISSION_ID,
    articlePlanId: SNAPSHOT_ONE_ID,
    editorialArticleId: ARTICLE_ONE_ID,
  };
  const [first, concurrent] = await Promise.all([
    runEditorialComposeGeneration(composition, dependencies()),
    runEditorialComposeGeneration(composition, dependencies()),
  ]);
  const repeated = await runEditorialComposeGeneration(composition, dependencies());

  assert.equal(generationCalls, 1);
  assert.equal(first.ok, true);
  assert.deepEqual(concurrent, {
    ok: true,
    editorialArticleId: ARTICLE_ONE_ID,
    action: "in_progress",
  });
  assert.deepEqual(repeated, {
    ok: true,
    editorialArticleId: ARTICLE_ONE_ID,
    action: "reused",
  });
});

test("SQL garante composição única, claim persistente, draft e zero publicação implícita", () => {
  const apply = readFileSync(
    "supabase/steps/31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql",
    "utf8",
  );
  assert.match(apply, /submission_id uuid primary key/);
  assert.match(apply, /request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(apply, /constraint newsroom_editorial_compose_requests_dossier_key unique/);
  assert.match(apply, /constraint newsroom_editorial_compose_requests_plan_key unique/);
  assert.match(apply, /constraint newsroom_editorial_compose_requests_article_key unique/);
  assert.match(apply, /for update/);
  assert.match(apply, /compose_payload_conflict/);
  assert.match(apply, /generation_status = 'in_progress'/);
  assert.match(apply, /interval '2 minutes'/);
  assert.match(apply, /'draft',[\s\S]*'general'/);
  assert.match(apply, /published_at,[\s\S]*null/);
  assert.doesNotMatch(apply, /https:\/\/api\.openai|responses/);
  assert.doesNotMatch(apply, /'published'/);
});

test("steps SQL obedecem a preflight/postflight read-only e smoke rollback sintético", () => {
  const preflight = readFileSync(
    "supabase/steps/30-redacao-automatica-compose-idempotencia-proveniencia-preflight.sql",
    "utf8",
  );
  const postflight = readFileSync(
    "supabase/steps/32-redacao-automatica-compose-idempotencia-proveniencia-postflight.sql",
    "utf8",
  );
  const smoke = readFileSync(
    "supabase/steps/33-redacao-automatica-compose-idempotencia-proveniencia-smoke-rollback.sql",
    "utf8",
  );
  for (const readOnly of [preflight, postflight]) {
    assert.doesNotMatch(readOnly, /^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    assert.match(readOnly, /'writes_performed', false/);
  }
  assert.match(smoke, /^begin;/m);
  assert.match(smoke, /^rollback;/m);
  assert.match(smoke, /compose_payload_conflict/);
  assert.match(smoke, /claim_action <> 'in_progress'/);
  assert.match(smoke, /v_frozen_snapshot_id <> v_persistence\.snapshot_id/);
  assert.match(smoke, /networkRequest', false/);
});

test("hotfix SQL elimina a resolucao ambigua e preserva o contrato de prepare", () => {
  const cleanInstall = readFileSync(
    "supabase/steps/31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql",
    "utf8",
  );
  const preflight = readFileSync(
    "supabase/steps/34-redacao-automatica-compose-idempotencia-ambiguidade-preflight.sql",
    "utf8",
  );
  const hotfix = readFileSync(
    "supabase/steps/35-redacao-automatica-compose-idempotencia-ambiguidade-apply.sql",
    "utf8",
  );
  const postflight = readFileSync(
    "supabase/steps/36-redacao-automatica-compose-idempotencia-ambiguidade-postflight.sql",
    "utf8",
  );
  const smoke = readFileSync(
    "supabase/steps/37-redacao-automatica-compose-idempotencia-ambiguidade-smoke-rollback.sql",
    "utf8",
  );
  const prepareBodyPattern =
    /(?:create|create or replace) function public\.newsroom_prepare_editorial_compose\([\s\S]*?\)\s*returns table[\s\S]*?as \$\$([\s\S]*?)\$\$;/i;
  const cleanBody = cleanInstall.match(prepareBodyPattern)?.[1];
  const hotfixBody = hotfix.match(prepareBodyPattern)?.[1];

  assert.ok(cleanBody);
  assert.ok(hotfixBody);
  assert.equal(hotfixBody, cleanBody);
  assert.doesNotMatch(
    cleanInstall,
    /on conflict\s*\(\s*submission_id\s*\)/i,
  );
  assert.doesNotMatch(hotfix, /on conflict\s*\(\s*submission_id\s*\)/i);
  assert.match(
    cleanInstall,
    /on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing/i,
  );
  assert.match(
    hotfix,
    /on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing/i,
  );
  assert.match(
    hotfix,
    /create or replace function public\.newsroom_prepare_editorial_compose\([\s\S]*uuid\[\],[\s\S]*integer\[\],[\s\S]*text\[\][\s\S]*returns table \([\s\S]*composition_action text,[\s\S]*generation_status text[\s\S]*language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(hotfix, /from public, anon, authenticated;/i);
  assert.match(hotfix, /to service_role;/i);
  assert.doesNotMatch(hotfix, /^\s*(alter table|create table|drop table|truncate)\b/im);

  for (const readOnly of [preflight, postflight]) {
    assert.doesNotMatch(
      readOnly,
      /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/im,
    );
    assert.match(readOnly, /'writes_performed', false/);
  }
  assert.match(preflight, /'defective'/);
  assert.match(preflight, /'already_corrected'/);
  assert.match(postflight, /ambiguous_conflict_clause_absent/);
  assert.match(postflight, /unqualified_collision_predicates_absent/);
  assert.match(smoke, /^begin;/m);
  assert.match(smoke, /^rollback;/m);
  assert.match(smoke, /synthetic_recoverable_failure/);
  assert.match(smoke, /compose_payload_conflict/);
  assert.match(smoke, /'smoke_passed', residue\.residue_count = 0/);
  assert.match(smoke, /'writes_committed', false/);
});

test("a evolução editorial preserva a assinatura idempotente e fixa o perfil no plano", () => {
  const apply = readFileSync(
    "supabase/steps/43-redacao-automatica-linha-editorial-persistente-apply.sql",
    "utf8",
  );

  assert.match(
    apply,
    /create or replace function public\.newsroom_prepare_editorial_compose\([\s\S]*p_newsroom_article_ids uuid\[\][\s\S]*p_source_notes text\[\][\s\S]*returns table \([\s\S]*composition_action text,[\s\S]*generation_status text/i,
  );
  assert.match(
    apply,
    /on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing/i,
  );
  assert.match(apply, /editorial_profile_version_id/);
  assert.match(apply, /editorial_profile_pinned_at/);
  assert.doesNotMatch(apply, /on conflict\s*\(\s*submission_id\s*\)/i);
  assert.doesNotMatch(apply, /https:\/\/api\.openai\.com|status\s*=\s*'published'/i);
});
