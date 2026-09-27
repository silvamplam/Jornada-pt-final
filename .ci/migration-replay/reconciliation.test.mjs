import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { tokens } from './sql-tokens.mjs';

const directory='docs/migration-reconciliation/20260927';
const history=JSON.parse(fs.readFileSync(directory+'/remote-history.json','utf8')).entries;
const manifest=JSON.parse(fs.readFileSync(directory+'/manifest.json','utf8'));
const decisions=JSON.parse(fs.readFileSync(directory+'/decisions.json','utf8'));
const catalog=JSON.parse(fs.readFileSync(directory+'/production-catalog.json','utf8'));
const hash=(algorithm,value)=>createHash(algorithm).update(value).digest('hex');

test('143 remote records retain their database checksum and individual statement hashes',()=>{
 assert.equal(history.length,143);
 for(const entry of history) {
  const recorded=manifest.decisions.find(d=>d.version===entry.version);
  assert.ok(recorded);
  assert.equal(hash('md5',entry.statements.join('\n')),entry.sql_md5,entry.version);
  assert.deepEqual(entry.statements.map(s=>hash('sha256',s)),recorded.statement_sha256,entry.version);
  assert.equal(hash('sha256',fs.readFileSync('supabase/migrations/'+recorded.filename)),recorded.rendered_file_sha256,entry.version);
 }
});
test('74 renamed versions have explicit E/S/D decisions and preserve remote identities',()=>{
 const renamed=decisions.filter(d=>d.original_local_file&&d.original_local_file!==d.version+'_'+d.name+'.sql');
 assert.equal(renamed.length,74);
 assert.deepEqual(['E','S','D'].map(c=>renamed.filter(d=>d.classification===c).length),[42,29,3]);
 for(const entry of renamed) {
  assert.equal(fs.existsSync('supabase/migrations/'+entry.original_local_file),false);
  assert.ok(fs.existsSync('supabase/migrations/'+entry.version+'_'+entry.name+'.sql'));
 }
});
test('operational source references do not retain obsolete migration filenames',()=>{
 const renamed=decisions.filter(d=>d.original_local_file&&d.original_local_file!==d.version+'_'+d.name+'.sql');
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of files) {
  if(!/\.(?:ts|tsx|py|mjs|sh|yml|yaml|sql)$/.test(file)||file.startsWith('supabase/migrations/')) continue;
  const source=fs.readFileSync(file,'utf8');
  for(const entry of renamed) assert.equal(source.includes(entry.original_local_file),false,file+': '+entry.original_local_file);
 }
});
test('historical v17 leaves the two ambiguity fixes for v27 to execute',()=>{
 const v17=fs.readFileSync('supabase/migrations/20260905132044_matchday_live_layout_physical_topology_constructor_v17.sql','utf8');
 const v27=fs.readFileSync('supabase/migrations/20260907203518_matchday_live_layout_physical_topology_ambiguity_v27.sql','utf8');
 for(const table of ['jornada_private.matchday_live_layout_physical_topology_transitions','public.matchday_editorial_continuity_transitions']) {
  const original='from '+table+' where source_matchday_id=p_source_matchday_id or target_matchday_id=p_target_matchday_id';
  assert.ok(v17.includes(original));
  assert.ok(v27.includes(original));
 }
 assert.ok(v27.includes('matchday-live-layout-topology-v27-no-change'));
});
test('unrecorded v18 validations are explicit and production execution is guarded',()=>{
 const historical=fs.readFileSync('supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql','utf8');
 const corrective=fs.readFileSync('supabase/migrations/20260927134943_replay_preserve_production_carryover_v18_validations.sql','utf8');
 assert.ok(!historical.includes('matchday-live-layout-carryover-v18-latest-provenance-invalid'));
 assert.ok(corrective.includes("current_database() <> 'jornada_migration_replay'"));
 for(const name of ['assert_matchday_live_layout_physical_carryover_v18','materialize_matchday_live_layout_physical_carryover_v18']) {
  assert.ok(corrective.includes(catalog.functions.find(f=>f.name===name).definition),name);
 }
});
test('replay uses a new network-less PostgreSQL container and stops on errors',()=>{
 const runner=fs.readFileSync('.ci/migration-replay/run.sh','utf8');
 assert.match(runner,/set -euo pipefail/);
 assert.match(runner,/docker run --detach --network none/);
 assert.match(runner,/--network "container:\$CID"/);
 assert.match(runner,/migration up --workdir \/project/);
 assert.doesNotMatch(runner,/--linked|migration repair|mztkeurmeadwbgebmuvv/);
 assert.match(fs.readFileSync('.ci/migration-replay/container-entrypoint.sh','utf8'),/cron.launch_active_jobs=off/);
});
test('v28 prerequisite changes three whitespace-only occurrences without anticipating its functional patch',()=>{
 const prerequisite=fs.readFileSync('.ci/migration-replay/fixtures/v28-format-prerequisite.sql','utf8');
 const historical=fs.readFileSync('supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql','utf8');
 let formatted=historical,occurrences=0;
 const replacements=[...prerequisite.matchAll(/formatted := replace\((?:original|formatted),\s*'([^']*)',\s*'([^']*)'\);/g)];
 assert.equal(replacements.length,2);
 for(const [,before,after] of replacements) {
  assert.deepEqual(tokens(before),tokens(after));
  occurrences+=formatted.split(before).length-1;
  formatted=formatted.replaceAll(before,after);
 }
 assert.equal(occurrences,3);
 assert.deepEqual(tokens(formatted),tokens(historical));
 assert.ok(!formatted.includes('v_roundup_count := 0;'));
 assert.ok(prerequisite.includes("current_database() <> 'jornada_migration_replay'"));
});
