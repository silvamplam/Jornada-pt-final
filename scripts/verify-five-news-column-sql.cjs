// Schema-only baseline is exported read-only from pg_catalog; no production rows.
// Usage: node scripts/verify-five-news-column-sql.cjs <local-url> <schema-baseline.json>
// Requires an EMPTY disposable PostgreSQL 17 database; set PSQL_BIN if needed.
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const [connection, metadataFile] = process.argv.slice(2);
const url = new URL(connection);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  || !/^\/five_news_column_test(?:_\d+)?$/.test(url.pathname)) {
  throw new Error("Use an empty, isolated local five_news_column_test database");
}
function sql(input) {
  const temporaryFile = require("node:path").join(require("node:os").tmpdir(), `jornada-column-sql-${process.pid}.sql`);
  fs.writeFileSync(temporaryFile, input);
  const result = spawnSync(process.env.PSQL_BIN || "psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1", connection, "-f", temporaryFile], {
    encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  fs.unlinkSync(temporaryFile);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return result.stdout + result.stderr;
}
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const { tables, functions } = JSON.parse(fs.readFileSync(metadataFile, "utf8").replace(/^\uFEFF/, ""));
const qualified = (table) => `${quote(table.schema)}.${quote(table.name)}`;
const ddl = [
  "do $$ begin assert current_setting('server_version_num')::integer between 170000 and 179999; assert not exists(select 1 from pg_tables where schemaname not in ('pg_catalog','information_schema')); end $$;",
  "create schema jornada_private; set check_function_bodies=off;",
  ...["anon", "authenticated", "service_role"].map((role) => `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$;`),
  ...tables.map((table) => `create table ${qualified(table)} (\n${table.columns.map((column) =>
    `${quote(column.name)} ${column.type}${column.identity ? ` generated ${column.identity === "a" ? "always" : "by default"} as identity` : column.default ? column.generated ? ` generated always as (${column.default}) stored` : ` default ${column.default}` : ""}${column.notnull ? " not null" : ""}`,
  ).join(",\n")}\n);`),
  ...functions.map((fn) => `${fn.definition};`),
  ...functions.filter((fn) => fn.acl !== null).flatMap((fn) => [
    `revoke all on function ${fn.signature} from public, anon, authenticated, service_role;`,
    ...fn.acl.slice(1, -1).split(",").filter(Boolean).map((entry) => {
      const role = entry.split("=")[0];
      return `grant execute on function ${fn.signature} to ${role ? quote(role) : "public"};`;
    }),
  ]),
  ...tables.flatMap((table) => (table.constraints || []).filter((constraint) => constraint.type !== "f" && constraint.type !== "t").map((constraint) => `alter table ${qualified(table)} add constraint ${quote(constraint.name)} ${constraint.definition};`)),
  ...tables.flatMap((table) => (table.constraints || []).filter((constraint) => constraint.type === "f").map((constraint) => `alter table ${qualified(table)} add constraint ${quote(constraint.name)} ${constraint.definition};`)),
  ...tables.flatMap((table) => (table.indexes || []).map((index) => `${index};`)),
  ...tables.flatMap((table) => (table.triggers || []).map((trigger) => `${trigger.definition};`)),
];
// PostgreSQL requires comma syntax when substring is schema-qualified.
const fixture = fs.readFileSync("supabase/sql/test-matchday-live-layout-physical-crud-v20-pg17.sql", "utf8")
  .split("-- A-D plus rollback:")[0]
  .replaceAll("pg_catalog.substring(item_row.item_kind from 8)", "pg_catalog.substring(item_row.item_kind, 8)")
  // Seed identities before publication: the real publication trigger now
  // creates Bank rows itself, so the older fixture's double INSERT is invalid.
  .replace("  'published',\n  'matchday',", "  'draft',\n  'matchday',")
  .replace("  'published',\r\n  'matchday',", "  'draft',\r\n  'matchday',");
const publication = `update public.editorial_articles set status='published'
  where matchday_id='a0000000-0000-4000-8000-000000000001';\n`;
const tests = fs.readFileSync("supabase/sql/test-editorial-five-news-column.sql", "utf8");
if (process.argv.includes("--tests-only")) {
  console.log(sql(fixture + publication + tests));
} else {
  console.log(sql(ddl.join("\n")));
  const guardsBefore = `
    create temp table column_migration_function_baseline as
      select oid,proowner,proacl,proconfig,prosecdef from pg_proc
      where pronamespace in ('public'::regnamespace,'jornada_private'::regnamespace);
    create temp table column_null_hash_baseline as select
      jornada_private.matchday_live_layout_carryover_source_hash_v18('a0000000-0000-4000-8000-000000000001') as carryover,
      jornada_private.matchday_live_layout_physical_archive_hash_v19('a0000000-0000-4000-8000-000000000001') as archive,
      jornada_private.matchday_historical_physical_archive_components_v20('a0000000-0000-4000-8000-000000000001') as components;
    commit;
  `;
  const guardsAfter = `
    do $$ begin
      assert not exists(select 1 from column_migration_function_baseline b join pg_proc p using(oid)
        where b.proowner is distinct from p.proowner or b.proacl is distinct from p.proacl
        or b.proconfig is distinct from p.proconfig or b.prosecdef is distinct from p.prosecdef);
      assert (select
        carryover=jornada_private.matchday_live_layout_carryover_source_hash_v18('a0000000-0000-4000-8000-000000000001')
        and archive=jornada_private.matchday_live_layout_physical_archive_hash_v19('a0000000-0000-4000-8000-000000000001')
        and components=jornada_private.matchday_historical_physical_archive_components_v20('a0000000-0000-4000-8000-000000000001')
        from column_null_hash_baseline);
      raise notice 'PASS: migration preserves OIDs, ACLs, SECURITY, search_path and pre-existing null-colour hashes';
    end $$;
    begin;
  `;
  console.log(sql(fixture + publication + guardsBefore
    + fs.readFileSync("supabase/migrations/20260928190224_editorial_five_news_column.sql", "utf8")
    + guardsAfter + tests));
}
