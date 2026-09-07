import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath =
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts";
const clientPath =
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx";
const legacyAdapterPath =
  "lib/editorial-matchday-live-layout-legacy-apply-adapter.ts";
const route = readFileSync(routePath, "utf8");
const client = readFileSync(clientPath, "utf8");
const post = route.slice(route.indexOf("export async function POST("));

test("POST físico chama uma única RPC v22 e não contém fallback v14", () => {
  assert.equal(
    (post.match(/writeSupabaseAdminReturning</g) ?? []).length,
    1,
  );
  assert.equal(
    (post.match(/rpc\/apply_matchday_live_layout_physical_v22/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(post, /apply_matchday_live_layout_physical_workspace_v14/);
  assert.doesNotMatch(post, /apply_matchday_editorial_profile_workspace_v12/);
  assert.doesNotMatch(post, /apply_matchday_editorial_profile_workspace_v11/);
  assert.doesNotMatch(post, /apply_matchday_editorial_desk_state_v2/);
  assert.doesNotMatch(post, /reconcileMatchday|compatibilityReconcile/);
  assert.doesNotMatch(post, /retry/i);
});

test("route valida o payload físico sem reler nem substituir o token recebido", () => {
  assert.match(post, /parsePhysicalDeskApplyPayload\(rawBody\)/);
  assert.match(post, /physicalDeskApplyRpcArguments\(matchdayId, payload\)/);
  assert.doesNotMatch(post, /readMatchdayEditorialProfileDesk/);
  assert.doesNotMatch(post, /expectedRevision|expectedStateToken|vacantZoneSlots/);
  assert.match(route, /matchday-live-layout-physical-v20-concurrent-write/);
  assert.match(
    route,
    /matchday-live-layout-latest-companion-v22-concurrent-write/,
  );
  assert.match(
    route,
    /thematic-physical-concurrent-write[\s\S]*?409/,
  );
  assert.match(route, /matchday-live-layout-physical-v20-video-required/);
  assert.match(route, /matchday-live-layout-physical-v20-highlight-required/);
  assert.doesNotMatch(route, /matchday-live-layout-physical-v14-/);
});

test("route devolve state_token final e cliente reconstrói pelo reader", () => {
  assert.match(post, /stateToken: row\.state_token/);
  assert.match(client, /buildPhysicalDeskApplyPayload\(desk\.profileKey, physicalDesk\)/);
  assert.match(client, /setAwaitedPhysicalStateToken\(result\.stateToken\)/);
  assert.match(client, /setApplyState\("refreshing"\)/);
  assert.match(client, /router\.refresh\(\)/);
  assert.match(
    client,
    /awaitedPhysicalStateToken === desk\.physicalWorkspace\.stateToken/,
  );
  assert.doesNotMatch(client, /buildPhysicalDeskLegacyApplyProjection/);
  assert.doesNotMatch(client, /physicalDeskLegacyApplyBlockReason/);
  assert.doesNotMatch(client, /legacyApplyBlockReason/);
});

test("zonas adicionais não são bloqueadas pela compatibilidade legacy", () => {
  assert.match(
    client,
    /const mutationBlocked = applyState === "saving" \|\| applyState === "refreshing"/,
  );
  assert.doesNotMatch(client, /data-legacy-apply-blocked/);
  assert.doesNotMatch(client, /Apply v12 bloqueado/);
});

test("5B1 preserva o caminho legacy e Agenda/TV", () => {
  const protectedDiff = execFileSync(
    "git",
    ["diff", "--name-only", "--", legacyAdapterPath],
    { encoding: "utf8" },
  ).trim();
  assert.equal(protectedDiff, "");

  const changed = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  assert.deepEqual(
    changed.filter((path) => /(?:^|\/)(?:agenda|tv)(?:\/|$)/i.test(path)),
    [],
  );
});
