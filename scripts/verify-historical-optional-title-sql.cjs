// Tests the candidate FUNCTION in pg_temp using an empty, disposable local PG17 database.
// The migration file is read as text, never submitted to PostgreSQL or migration history.
// Usage: node scripts/verify-historical-optional-title-sql.cjs <local-url> <readonly-function-snapshot.json>
// Snapshot shape: {definition: pg_get_functiondef(...)}. Set PSQL_BIN to the local psql executable.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const [connection, snapshotFile] = process.argv.slice(2);
const url = new URL(connection);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/historical_optional_title_test") {
  throw new Error("An empty, disposable local historical_optional_title_test database is required");
}
const migration = fs.readFileSync("supabase/migrations/20260930190226_historical_activation_optional_public_title.sql", "utf8");
const { definition } = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
const guard = migration.match(/v_guard constant text := \$guard\$([^$]+)\$guard\$/)?.[1];
assert.equal(guard, "or nullif(btrim(public_title), '') is null");
assert.match(migration, /execute pg_catalog\.replace\(v_definition, v_guard, ''\);/);
assert.equal(definition.split(guard).length - 1, 1);
const candidate = definition.replace(guard, "");
assert.equal(candidate.length, definition.length - guard.length);
const name = "public.activate_matchday_reference_composition";
assert.ok(definition.startsWith(`CREATE OR REPLACE FUNCTION ${name}(`));
const beforeFunction = definition.replace(name, "pg_temp.activation_before");
const candidateFunction = candidate.replace(name, "pg_temp.activation_candidate");
const quote = value => "'" + value.replaceAll("'", "''") + "'";

const negativeCases = [
  ["missing item", "historical_dynamic_zones_incomplete", "delete from public.matchday_historical_composition_zone_items where position=6"],
  ["duplicate position", "historical_dynamic_zones_incomplete", "update public.matchday_historical_composition_zone_items set position=1 where position=2"],
  ["position zero", "historical_dynamic_zones_incomplete", "update public.matchday_historical_composition_zone_items set position=0 where position=1"],
  ["position beyond capacity", "historical_dynamic_zones_incomplete", "update public.matchday_historical_composition_zone_items set position=7 where position=6"],
  ["invalid family", "historical_dynamic_zones_incomplete", "update public.matchday_historical_composition_zones set visual_family='invalid'"],
  ["invalid order", "historical_dynamic_zones_incomplete", "update public.matchday_historical_composition_zones set sort_order=2"],
  ["title over 120", "historical_dynamic_zones_incomplete", "update public.matchday_historical_composition_zones set public_title=repeat('x',121)", false],
  ["more than 24 zones", "historical_dynamic_zones_incomplete", "insert into public.matchday_historical_composition_zones select gen_random_uuid(),composition_id,n,public_title,public_title_color,visual_family from public.matchday_historical_composition_zones cross join generate_series(2,25) n"],
  ["missing opening", "historical_dynamic_opening_incomplete", "delete from public.matchday_hierarchical_composition_slots where slot_key='dominant_main'"],
  ...["label_snapshot", "title_snapshot", "subtitle_snapshot", "image_url_snapshot", "link_url_snapshot"].flatMap(field => [
    [`empty ${field}`, "historical_dynamic_zones_incomplete", `update public.matchday_historical_composition_zone_items set ${field}=' ' where position=1`],
    [`null ${field}`, "historical_dynamic_zones_incomplete", `update public.matchday_historical_composition_zone_items set ${field}=null where position=1`],
    [`opening ${field}`, "historical_dynamic_opening_incomplete", `update public.matchday_hierarchical_composition_slots set ${field}=null where slot_key='dominant_main'`],
  ]),
  ...["null", "-1", "2"].map(value => [`video position ${value}`, "historical_dynamic_body_order_invalid", `update public.matchday_reference_compositions set hierarchical_video_position=${value}`]),
  ...["title", "excerpt", "text", "author"].map(field => [`editorial ${field}`, "historical_dynamic_editorial_incomplete", `update public.matchday_reference_compositions set hierarchical_editorial_${field}=''`]),
  ["invalid composition status", "composition_not_published", "update public.matchday_reference_compositions set status='archived'"],
  ["column group assertion", "fixture_column_groups_invalid", "update pg_temp.group_guard set reject=true"],
  ["legacy incomplete slots", "hierarchical_composition_incomplete", "delete from public.matchday_historical_composition_zones"],
];

const sql = `begin;
do $$ begin
  assert current_database()='historical_optional_title_test';
  assert inet_server_addr()='127.0.0.1'::inet;
  assert current_setting('server_version_num')::integer between 170000 and 179999;
  assert not exists(select 1 from pg_tables where schemaname not in ('pg_catalog','information_schema'));
end $$;
create temp table results(label text primary key);
create temp table group_guard(reject boolean); insert into group_guard values(false);
create schema jornada_private;
create function jornada_private.assert_historical_column_groups(uuid) returns void language plpgsql as $$ begin
  if (select reject from pg_temp.group_guard) then raise exception 'fixture_column_groups_invalid'; end if;
end $$;
create table public.matchday_reference_compositions(id uuid primary key,matchday_id uuid,status text,presentation_mode text,
  hierarchical_video_position integer,hierarchical_editorial_title text,hierarchical_editorial_excerpt text,
  hierarchical_editorial_text text,hierarchical_editorial_author text,is_current boolean default false,updated_at timestamptz,published_at timestamptz);
create table public.matchday_historical_composition_zones(id uuid,composition_id uuid,sort_order integer,public_title text,public_title_color text,visual_family text);
create table public.matchday_historical_composition_zone_items(id uuid,composition_id uuid,zone_id uuid,position integer,
  label_snapshot text,title_snapshot text,subtitle_snapshot text,image_url_snapshot text,link_url_snapshot text);
create table public.matchday_hierarchical_composition_slots(composition_id uuid,slot_key text,label_snapshot text,title_snapshot text,
  subtitle_snapshot text,image_url_snapshot text,link_url_snapshot text,media_kind_snapshot text,media_embed_url_snapshot text,media_video_url_snapshot text);
create table public.matchday_reference_composition_items(composition_id uuid,slot_type text,sort_order integer,
  label_snapshot text,title_snapshot text,subtitle_snapshot text,image_url_snapshot text,link_url_snapshot text);
${beforeFunction};
${candidateFunction};
do $$ declare before_row pg_proc; after_row pg_proc; begin
  select * into before_row from pg_proc where oid='pg_temp.activation_before(uuid,uuid,boolean)'::regprocedure;
  select * into after_row from pg_proc where oid='pg_temp.activation_candidate(uuid,uuid,boolean)'::regprocedure;
  assert after_row.prosrc=replace(before_row.prosrc,${quote(guard)},'');
  assert (to_jsonb(before_row)-array['oid','proname','prosrc'])=(to_jsonb(after_row)-array['oid','proname','prosrc']);
  insert into results values('all remaining guards, arguments, SECURITY, owner, ACL and search_path identical');
end $$;

create function pg_temp.reset_fixture(family text default 'six_news') returns void language plpgsql as $$
declare c uuid:='a0000000-0000-4000-8000-000000000001'; z uuid:='b0000000-0000-4000-8000-000000000001'; begin
  truncate public.matchday_reference_compositions,public.matchday_historical_composition_zones,
    public.matchday_historical_composition_zone_items,public.matchday_hierarchical_composition_slots,public.matchday_reference_composition_items;
  update pg_temp.group_guard set reject=false;
  insert into public.matchday_reference_compositions values(c,c,'draft','hierarchical',0,'Title','Excerpt','Text','Author',false,null,null);
  insert into public.matchday_reference_compositions values('a0000000-0000-4000-8000-000000000002',c,'published','standard',null,null,null,null,null,true,null,now());
  insert into public.matchday_historical_composition_zones values(z,c,1,'Control title','#008A44',family);
  insert into public.matchday_historical_composition_zone_items
    select gen_random_uuid(),c,z,n,'Label','Title','Subtitle','/image.jpg','/news/item' from generate_series(1,case when family like 'five_%' then 5 else 6 end) n;
  insert into public.matchday_hierarchical_composition_slots(composition_id,slot_key,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot)
    select c,k,'Label','Title','Subtitle','/opening.jpg','/opening' from unnest(array['dominant_main','other_chronicle_1','other_chronicle_2','other_chronicle_3']) k;
end $$;
create function pg_temp.outcome(candidate boolean, c uuid default 'a0000000-0000-4000-8000-000000000001', publish boolean default true,
  m uuid default 'a0000000-0000-4000-8000-000000000001') returns text language plpgsql as $$ begin
  if candidate then perform pg_temp.activation_candidate(m,c,publish); else perform pg_temp.activation_before(m,c,publish); end if;
  return 'ok'; exception when others then return sqlerrm;
end $$;
create function pg_temp.compositions_hash() returns text language sql as $$
  select md5(string_agg(to_jsonb(c)::text,',' order by id)) from public.matchday_reference_compositions c;
$$;
create function pg_temp.assert_rejected(label text,expected text,mutation text,blank_title boolean default true) returns void language plpgsql as $$
declare baseline_hash text; actual text; begin
  perform pg_temp.reset_fixture(); execute mutation;
  baseline_hash:=pg_temp.compositions_hash();
  actual:=pg_temp.outcome(false); assert actual=expected, label||': baseline '||actual;
  if blank_title then update public.matchday_historical_composition_zones set public_title=''; end if;
  actual:=pg_temp.outcome(true); assert actual=expected, label||': candidate '||actual;
  assert baseline_hash=pg_temp.compositions_hash(),label||': partial publication';
  insert into results values(label);
end $$;
${negativeCases.map(([label, expected, mutation, blank = true]) => `select pg_temp.assert_rejected(${quote(label)},${quote(expected)},${quote(mutation)},${blank});`).join("\n")}

do $$ declare family text; c uuid:='a0000000-0000-4000-8000-000000000001'; begin
  foreach family in array array['six_news','six_news_1_2_3','five_news_balanced','five_news_secondary','five_news_column'] loop
    perform pg_temp.reset_fixture(family);
    update public.matchday_historical_composition_zones set public_title='';
    assert pg_temp.outcome(false)='historical_dynamic_zones_incomplete';
    assert pg_temp.outcome(true)='ok';
    assert exists(select 1 from public.matchday_reference_compositions where id=c and status='published' and is_current and published_at is not null);
    assert not exists(select 1 from public.matchday_reference_compositions where id<>c and is_current);
    assert exists(select 1 from public.matchday_historical_composition_zones where public_title='' and public_title_color='#008A44');
    assert pg_temp.outcome(true,c,false)='ok';
    insert into results values('empty title publishes and reactivates '||family);
  end loop;
  perform pg_temp.reset_fixture('five_news_column');
  delete from public.matchday_historical_composition_zone_items where position not in (2,5);
  assert pg_temp.outcome(false)='ok';
  update public.matchday_historical_composition_zones set public_title='';
  assert pg_temp.outcome(true)='ok';
  insert into results values('sparse column publication contract unchanged');
  perform pg_temp.reset_fixture();
  assert pg_temp.outcome(false)='ok';
  assert pg_temp.outcome(true)='ok';
  insert into results values('nonempty title publication unchanged');
  perform pg_temp.reset_fixture();
  assert pg_temp.outcome(false,c,false)='composition_not_published';
  assert pg_temp.outcome(true,c,false)='composition_not_published';
  assert pg_temp.outcome(false,null)='composition_invalid';
  assert pg_temp.outcome(true,null)='composition_invalid';
  assert pg_temp.outcome(false,c,true,null)='composition_invalid';
  assert pg_temp.outcome(true,c,true,null)='composition_invalid';
  assert pg_temp.outcome(false,'a0000000-0000-4000-8000-000000000099')='composition_not_found';
  assert pg_temp.outcome(true,'a0000000-0000-4000-8000-000000000099')='composition_not_found';
  insert into results values('identity and publication consent guards unchanged');

  -- Legacy path still requires 15 slots and 5 complete posterior stories.
  delete from public.matchday_historical_composition_zones;
  insert into public.matchday_hierarchical_composition_slots(composition_id,slot_key,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot)
    select c,'legacy_'||n,'Label','Title','Subtitle','/image.jpg' from generate_series(1,11) n;
  insert into public.matchday_reference_composition_items
    select c,'beyond_matchday',n,'Label','Title','Subtitle','/image.jpg','/news/item' from generate_series(1,5) n;
  assert pg_temp.outcome(false)='ok'; assert pg_temp.outcome(true)='ok';
  delete from public.matchday_reference_composition_items where sort_order=5;
  assert pg_temp.outcome(false)='hierarchical_beyond_matchday_incomplete';
  assert pg_temp.outcome(true)='hierarchical_beyond_matchday_incomplete';
  insert into results values('legacy activation and posterior completeness unchanged');
end $$;
select 'PASS: '||label from results order by label;
select 'TOTAL PASS: '||count(*) from results;
rollback;
do $$ begin assert not exists(select 1 from pg_tables where schemaname not in ('pg_catalog','information_schema','pg_temp_3'));
  assert to_regprocedure('public.activate_matchday_reference_composition(uuid,uuid,boolean)') is null;
  raise notice 'PASS: rolled back; project function and migration history were never installed';
end $$;
`;
const testFile = path.resolve("out/historical-contract-legacy/activation-candidate-test.sql");
fs.mkdirSync(path.dirname(testFile), { recursive: true });
fs.writeFileSync(testFile, sql);
const result = spawnSync(process.env.PSQL_BIN || "psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1", connection, "-f", testFile],
  { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
if (result.error) throw result.error;
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
