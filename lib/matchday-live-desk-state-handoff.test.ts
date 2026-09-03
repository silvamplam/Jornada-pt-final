import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260902155805_matchday_live_desk_state_handoff.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-desk-state-handoff-pg17.sql";
const migration = readFileSync(migrationPath, "utf8");
const retirement = readFileSync(
  "supabase/migrations/20260901211957_matchday_live_layout_source_retirement.sql",
  "utf8",
);
const cutoverBridge = readFileSync(
  "supabase/migrations/20260901201453_matchday_live_layout_cutover_bridge.sql",
  "utf8",
);

const protectedMigrations = [
  "supabase/migrations/20260901201453_matchday_live_layout_cutover_bridge.sql",
  "supabase/migrations/20260901201455_matchday_live_layout_authoritative_activation.sql",
  "supabase/migrations/20260901211957_matchday_live_layout_source_retirement.sql",
  "supabase/migrations/20260902053337_matchday_historical_republish_independence.sql",
  "supabase/migrations/20260902095825_matchday_faixa_bank_atomic_apply_fix.sql",
  "supabase/migrations/20260902110327_matchday_live_desk_aggregate_tracking_reader.sql",
  "supabase/migrations/20260902130518_matchday_explicit_bank_displaced_semantics.sql",
  "supabase/migrations/20260902141655_matchday_preview_movement_without_cascade.sql",
];

function section(startNeedle: string, endNeedle: string) {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `inicio ausente: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `fim ausente: ${endNeedle}`);
  return migration.slice(start, end);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function handoffFencePattern(table: string) {
  return new RegExp(
    [
      "create trigger matchday_live_desk_handoff_writer_fence",
      "before insert or update or delete",
      `on public\\.${escapeRegExp(table)}`,
      "for each statement",
      "execute function jornada_private\\.fence_matchday_live_layout_legacy_writer\\(\\);",
    ].join("\\s+"),
    "gi",
  );
}

const materializer = section(
  "create or replace function jornada_private.materialize_matchday_live_layout_continuity(",
  "revoke all on function\n  jornada_private.materialize_matchday_live_layout_continuity(",
);

test("migration 7B is forward-only and leaves every applied migration untouched", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.ok(
    migrationPath >
      "supabase/migrations/20260902141655_matchday_preview_movement_without_cascade.sql",
  );
  assert.equal(
    execFileSync("git", ["diff", "--name-only", "--", ...protectedMigrations], {
      encoding: "utf8",
    }).trim(),
    "",
  );
});

test("active contextual Bank is the handoff universe instead of placements", () => {
  for (const blockStart of [
    "  with source_bank as materialized (",
    "  select pg_catalog.count(*)::integer\n  into v_bank_count",
  ]) {
    const offset = materializer.indexOf(blockStart);
    assert.ok(offset >= 0, `bloco de Bank ausente: ${blockStart}`);
    const block = materializer.slice(offset, offset + 1_600);
    assert.match(block, /from public\.matchday_editorial_bank_items as bank_row/);
    assert.match(block, /btrim\(bank_row\.status\)\) = 'active'/);
  }
  assert.match(materializer, /matchday-live-continuity-source-placement-inactive/);
  assert.match(materializer, /matchday-live-continuity-active-bank-incomplete/);
});

test("historical composition is only trigger and provenance", () => {
  const firstBankCopy = materializer.indexOf("  with source_bank as materialized (");
  const placementPlan = materializer.indexOf(
    "  select coalesce(\n    pg_catalog.jsonb_agg(",
  );
  const bankCopy = materializer.slice(firstBankCopy, placementPlan);
  assert.doesNotMatch(
    bankCopy,
    /matchday_reference_composition_items|matchday_hierarchical_composition_slots|matchday_historical_composition_zones|matchday_historical_composition_zone_items/,
  );
  assert.match(
    materializer,
    /continuity_source_composition_id[\s\S]*p_source_composition_id/,
  );
  assert.match(materializer, /continuity_version[\s\S]*6/);
});

test("NOVA needs no persistence while Banco and memory are remapped", () => {
  assert.match(
    materializer,
    /insert into public\.matchday_editorial_profile_manual_overrides[\s\S]*'bank'/,
  );
  assert.match(
    materializer,
    /insert into public\.matchday_live_layout_bank_item_state_memory[\s\S]*target_bank\.id[\s\S]*source_memory\.memory_kind/,
  );
  assert.match(
    materializer,
    /matchday-live-continuity-new-state-incomplete/,
  );
  assert.doesNotMatch(materializer, /memory_kind[\s\S]{0,80}'new'/i);
});

test("placements retain exact slots and semantic zone mapping without compaction", () => {
  assert.match(
    materializer,
    /'slot_position', placement_row\.slot_position/,
  );
  assert.match(
    materializer,
    /target_projection\.legacy_zone_key\s*=\s*source_projection\.legacy_zone_key/,
  );
  assert.doesNotMatch(materializer, /row_number\(\)[\s\S]*placement|dense_rank\(\)[\s\S]*placement/i);
  assert.match(materializer, /matchday-live-continuity-placement-incomplete/);
});

test("classification key is materialized from provenance and never recalculated here", () => {
  assert.match(materializer, /automatic_eligible = false/);
  assert.match(
    materializer,
    /target_bank\.classification_key is distinct from\s+source_bank\.classification_key/,
  );
  assert.doesNotMatch(
    materializer,
    /matchday_editorial_profile_classification_plan\(/,
  );
});

test("source state conflicts fail closed", () => {
  for (const error of [
    "matchday-live-continuity-source-transversal-conflict",
    "matchday-live-continuity-source-placement-memory-conflict",
    "matchday-live-continuity-source-explicit-bank-conflict",
    "matchday-live-continuity-target-state-conflict",
  ]) {
    assert.match(materializer, new RegExp(error));
  }
});

test("A) Handoff lock is exclusive advisory xact (6026,2)", () => {
  assert.match(
    migration,
    /create function jornada_private\.acquire_matchday_live_desk_handoff_lock\([\s\S]*pg_catalog\.pg_advisory_xact_lock\(6026,\s*2\);/m,
  );
  assert.match(
    migration,
    /revoke all on function\s+jornada_private\.acquire_matchday_live_desk_handoff_lock\(\)\s*from public, anon, authenticated, service_role;/m,
  );
});

test("B) shared writer lock continues a usar shared advisory lock", () => {
  assert.match(
    cutoverBridge,
    /acquire_matchday_live_layout_cutover_writer_lock\(\)[\s\S]*pg_advisory_xact_lock_shared\(6026,\s*2\);/m,
  );
});

test("C) lock order: handoff lock antes do core lock nos entry points", () => {
  const publishWithContinuity = section(
    "create or replace function\n  public.publish_matchday_reference_composition_with_continuity(",
    "revoke all on function\n  public.publish_matchday_reference_composition_with_continuity(",
  );
  const recover = section(
    "create or replace function public.recover_matchday_live_layout_continuity(",
    "revoke all on function public.recover_matchday_live_layout_continuity(",
  );
  const publish = section(
    "create or replace function public.publish_matchday_reference_composition(",
    "revoke all on function\n  public.publish_matchday_reference_composition(",
  );

  for (const definition of [
    publishWithContinuity,
    recover,
    publish,
  ]) {
    const handoff = definition.indexOf(
      "perform jornada_private.acquire_matchday_live_desk_handoff_lock();",
    );
    const core = definition.indexOf(
      "perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();",
    );
    assert.ok(handoff >= 0);
    assert.ok(core >= 0);
    assert.ok(handoff < core);
  }
});

test("D) materializer: handoff lock antes do lock da Matchday", () => {
  const handoff = materializer.indexOf(
    "perform jornada_private.acquire_matchday_live_desk_handoff_lock();",
  );
  const matchday = materializer.indexOf(
    "perform 1\n  from public.matchdays as matchday_row",
  );
  assert.ok(handoff >= 0);
  assert.ok(matchday >= 0);
  assert.ok(handoff < matchday);
});

test("E) superfices extra recebem fence before-statement", () => {
  const fenced = [
    "matchday_editorial_bank_items",
    "matchday_live_layout_placements",
    "matchday_editorial_profile_manual_overrides",
    "matchday_live_layout_bank_item_state_memory",
    "matchday_latest_news",
    "matchday_roundup_items",
    "matchday_editorial_desk_control",
    "matchday_editorial_profile_reconcile_control",
    "matchday_editorial_profile_assignments",
    "matchday_live_layout_zones",
    "matchday_live_layout_blocks",
  ];

  for (const table of fenced) {
    const matches = migration.match(handoffFencePattern(table));
    assert.equal(matches?.length ?? 0, 1);
  }
});
test("F) artigos e conteudos publicados sao fenceados", () => {
  for (const table of ["editorial_articles", "editorial_contents"]) {
    const matches = migration.match(handoffFencePattern(table));
    assert.equal(matches?.length ?? 0, 1);
  }
});
test("G) as 5 superficies legacy nao recebem fence duplicada", () => {
  const legacy = [
    "matchday_editorials",
    "matchday_highlights",
    "matchday_horizontal_news",
    "matchday_live_layout_items",
    "matchday_editorial_profile_zone_items",
  ];

  for (const table of legacy) {
    const matches = migration.match(handoffFencePattern(table));
    assert.equal(matches?.length ?? 0, 0);
  }
});
test("H) sem LOCK TABLE row exclusive como barreira atomica", () => {
  assert.doesNotMatch(migration, /lock table[\s\S]*row exclusive mode/);
});

test("normal publication and recovery use the same central materializer", () => {
  const calls = retirement.match(
    /jornada_private\.materialize_matchday_live_layout_continuity\(/g,
  );
  assert.equal(calls?.length, 2);
  assert.match(
    retirement,
    /publish_matchday_reference_composition_with_continuity[\s\S]*materialize_matchday_live_layout_continuity/,
  );
  assert.match(
    retirement,
    /recover_matchday_live_layout_continuity[\s\S]*materialize_matchday_live_layout_continuity/,
  );
});

function sqlFunctionDefinition(name: string) {
  const startMatch = new RegExp(
    `create(?:\\s+or\\s+replace)? function\\s+${escapeRegExp(name)}\\s*\\(`,
    "i",
  ).exec(migration);

  if (!startMatch) {
    assert.fail(`definicao ausente: ${name}`);
  }

  const endNeedle = "$function$;";
  const end = migration.indexOf(endNeedle, startMatch.index);

  if (end <= startMatch.index) {
    assert.fail(`fim da definicao ausente: ${name}`);
  }

  return migration.slice(startMatch.index, end + endNeedle.length);
}

function sqlFunctionSignaturePattern(
  prefix: string,
  name: string,
  args: readonly string[],
  suffix: string,
) {
  const signature = args.map(escapeRegExp).join("\\s*,\\s*");

  return new RegExp(
    `${prefix}\\s+${escapeRegExp(name)}\\s*\\(\\s*${signature}\\s*\\)\\s+${suffix}`,
    "i",
  );
}

test("7B defines only the handoff boundary and the three active writer wrappers", () => {
  const definedFunctions = Array.from(
    migration.matchAll(
      /create(?:\s+or\s+replace)? function\s+((?:public|jornada_private)\.[a-z0-9_]+)/gi,
    ),
    (match) => match[1],
  );

  assert.deepEqual(definedFunctions, [
    "jornada_private.acquire_matchday_live_desk_handoff_lock",
    "jornada_private.materialize_matchday_live_layout_continuity",
    "public.apply_matchday_editorial_profile_workspace_v11",
    "public.apply_matchday_editorial_desk_state_v2",
    "public.set_matchday_editorial_profile_assignment",
    "public.publish_matchday_reference_composition_with_continuity",
    "public.recover_matchday_live_layout_continuity",
    "public.publish_matchday_reference_composition",
  ]);

  for (const name of [
    "public.apply_matchday_editorial_profile_workspace_v9",
    "public.apply_matchday_editorial_profile_workspace_v10",
    "public.read_matchday_live_desk_aggregate_tracking",
    "jornada_private.retire_matchday_live_layout_source",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(
        `create(?:\\s+or\\s+replace)? function\\s+${escapeRegExp(name)}\\s*\\(`,
        "i",
      ),
    );
  }
});

test("active writer wrappers acquire the shared fence before delegating", () => {
  const wrappers = [
    {
      publicName: "public.apply_matchday_editorial_profile_workspace_v11",
      privateName:
        "apply_matchday_editorial_profile_workspace_v11_pre_handoff",
      args: [
        "uuid",
        "text",
        "bigint",
        "text",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
      ],
    },
    {
      publicName: "public.apply_matchday_editorial_desk_state_v2",
      privateName: "apply_matchday_editorial_desk_state_v2_pre_handoff",
      args: ["uuid", "bigint", "text", "boolean", "jsonb"],
    },
    {
      publicName: "public.set_matchday_editorial_profile_assignment",
      privateName: "set_matchday_editorial_profile_assignment_pre_handoff",
      args: ["uuid", "text"],
    },
  ] as const;

  const writerLock =
    "perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();";

  for (const wrapper of wrappers) {
    assert.match(
      migration,
      sqlFunctionSignaturePattern(
        "alter\\s+function",
        wrapper.publicName,
        wrapper.args,
        `rename\\s+to\\s+${escapeRegExp(wrapper.privateName)};`,
      ),
    );

    assert.match(
      migration,
      sqlFunctionSignaturePattern(
        "alter\\s+function",
        `public.${wrapper.privateName}`,
        wrapper.args,
        "set\\s+schema\\s+jornada_private;",
      ),
    );

    const definition = sqlFunctionDefinition(wrapper.publicName);
    const lockPosition = definition.indexOf(writerLock);
    const delegatePosition = definition.indexOf(
      `jornada_private.${wrapper.privateName}(`,
    );

    assert.equal(
      definition.match(
        /perform jornada_private\.acquire_matchday_live_layout_cutover_writer_lock\(\);/g,
      )?.length ?? 0,
      1,
    );

    assert.ok(lockPosition >= 0);
    assert.ok(delegatePosition >= 0);
    assert.ok(lockPosition < delegatePosition);

    assert.match(
      migration,
      sqlFunctionSignaturePattern(
        "revoke\\s+all\\s+on\\s+function",
        `jornada_private.${wrapper.privateName}`,
        wrapper.args,
        "from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role;",
      ),
    );

    assert.match(
      migration,
      sqlFunctionSignaturePattern(
        "revoke\\s+all\\s+on\\s+function",
        wrapper.publicName,
        wrapper.args,
        "from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role;",
      ),
    );

    assert.match(
      migration,
      sqlFunctionSignaturePattern(
        "grant\\s+execute\\s+on\\s+function",
        wrapper.publicName,
        wrapper.args,
        "to\\s+service_role;",
      ),
    );
  }
});

test("legacy RPC bypasses are revoked from service_role", () => {
  const revoked = [
    {
      name: "public.apply_matchday_editorial_desk_state",
      args: ["uuid", "bigint", "text", "boolean", "jsonb"],
    },
    {
      name: "public.apply_matchday_editorial_profile_reconcile",
      args: [
        "uuid",
        "text",
        "bigint",
        "text",
        "jsonb",
        "jsonb",
        "jsonb",
      ],
    },
    {
      name: "public.apply_matchday_editorial_profile_reconcile_v2",
      args: [
        "uuid",
        "text",
        "bigint",
        "text",
        "jsonb",
        "jsonb",
        "jsonb",
      ],
    },
    {
      name: "public.apply_matchday_editorial_profile_workspace",
      args: [
        "uuid",
        "text",
        "bigint",
        "text",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
      ],
    },
    {
      name: "public.apply_matchday_editorial_profile_workspace_v9",
      args: [
        "uuid",
        "text",
        "bigint",
        "text",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
      ],
    },
    {
      name: "public.apply_matchday_editorial_profile_workspace_v10",
      args: [
        "uuid",
        "text",
        "bigint",
        "text",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb",
      ],
    },
    {
      name: "public.refresh_matchday_editorial_profile_distribution",
      args: ["uuid"],
    },
  ] as const;

  for (const entry of revoked) {
    assert.match(
      migration,
      sqlFunctionSignaturePattern(
        "revoke\\s+all\\s+on\\s+function",
        entry.name,
        entry.args,
        "from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role;",
      ),
    );
  }
});

test("PG17 fixture covers complete handoff and historical republish isolation", () => {
  const fixture = readFileSync(fixturePath, "utf8");
  for (const state of [
    "NOVA",
    "FAIXA",
    "DESALOJADA",
    "BANCO",
    "OPENING",
    "ZONE",
    "SELECTION",
    "VIDEO_HIGHLIGHT",
    "LEGACY_UNKNOWN",
  ]) {
    assert.match(fixture, new RegExp(state));
  }
  assert.match(fixture, /HISTORICAL-ONLY/);
  assert.match(fixture, /status = 'archived'/);
  assert.match(fixture, /historical_republish/);
  assert.match(fixture, /rollback;\s*$/);
});
