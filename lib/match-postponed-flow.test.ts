import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("fluxo de jogo adiado fica ligado de ponta a ponta", async () => {
  const [manager, route, strip, landing, schema, migration] = await Promise.all([
    readFile(new URL("../app/admin/gestor/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/gestor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/public/PublicMatchStrip.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/page.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/20260816160000_match_postponed_rollover_exclusion.sql",
        import.meta.url
      ),
      "utf8"
    )
  ]);

  assert.match(manager, /<option value="postponed">Adiado<\/option>/);
  assert.match(manager, /normalized === "postponed"\) return "Adiado"/);
  assert.match(route, /"scheduled", "live", "halftime", "finished", "postponed"/);
  assert.match(route, /rollover_excluded:\s*true/);
  assert.match(strip, /Nova data por definir/);
  assert.doesNotMatch(landing, /LIGA_PORTUGAL_PUBLIC_ENTRY_SLUG/);
  assert.match(landing, /if \(matchdays\.length > 0\)/);
  assert.match(landing, /selectPublicCompetitionEntryMatchday/);
  assert.match(schema, /rollover_excluded boolean not null default false/);
  assert.match(migration, /add column if not exists rollover_excluded boolean not null default false/);
});
