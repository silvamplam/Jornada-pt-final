// A dependency baseline for disposable replay, NOT an alleged dated migration.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const evidence = 'docs/migration-reconciliation/20260927';
const catalog = JSON.parse(fs.readFileSync(evidence + '/production-catalog.json', 'utf8'));
const auxiliary = JSON.parse(fs.readFileSync(evidence + '/platform-catalog.json', 'utf8'));
const migrations = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
const chain = migrations.filter(f => !f.includes('_replay_preserve_')).map(f => fs.readFileSync('supabase/migrations/' + f, 'utf8')).join('\n');
const createdTables = new Set([...chain.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(public|jornada_private)\.)?([a-z_]\w*)/gi)].map(m => (m[1] || 'public') + '.' + m[2]));
const createdFunctions = new Set([...chain.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(public|jornada_private)\.([a-z_]\w*)/gi)].map(m => m[1] + '.' + m[2]));
const renameTargets = new Set([...chain.matchAll(/\brename\s+to\s+([a-z_]\w*)/gi)].map(m => m[1]));
const addedConstraints = new Set([...chain.matchAll(/\badd\s+constraint\s+([a-z_]\w*)/gi)].map(m => m[1]));
const createdIndexes = new Set([...chain.matchAll(/\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z_]\w*)/gi)].map(m => m[1]));
const createdTriggers = new Set([...chain.matchAll(/\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+([a-z_]\w*)/gi)].map(m => m[1]));
const addedColumns = new Map();
for (const m of chain.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(public|jornada_private)\.([a-z_]\w*)([^;]*);/gi)) {
  const key = m[1] + '.' + m[2];
  const columns = addedColumns.get(key) || new Set();
  for (const add of m[3].matchAll(/add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([a-z_]\w*)\s+(?:uuid|text|jsonb|boolean|integer|bigint|smallint|timestamptz|timestamp|numeric|date|time)\b/gi)) columns.add(add[1]);
  addedColumns.set(key, columns);
}
const q = name => '"' + name.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const qualified = item => q(item.schema) + '.' + q(item.name);
const key = item => item.schema + '.' + item.name;
const references = (text, item) => new RegExp('\\b' + item.schema + '\\.' + item.name + '\\b', 'i').test(text);
const tables = new Map(), functions = new Map();
let referenceText = chain;
let changed = true;
while (changed) {
  changed = false;
  for (const table of catalog.tables) {
    if (createdTables.has(key(table)) || tables.has(key(table)) || !references(referenceText, table)) continue;
    tables.set(key(table), table);
    referenceText += '\n' + JSON.stringify(table);
    for (const constraint of table.constraints || []) {
      const target = constraint.definition.match(/REFERENCES\s+(?:([a-z_]\w*)\.)?([a-z_]\w*)\s*\(/i);
      if (target) referenceText += '\n' + (target[1] || 'public') + '.' + target[2];
    }
    changed = true;
  }
  for (const fn of catalog.functions) {
    if (createdFunctions.has(key(fn)) || renameTargets.has(fn.name) || functions.has(key(fn)) ||
        (!references(referenceText, fn) && !new RegExp('\\b'+fn.name+'\\s*\\(', 'i').test(referenceText))) continue;
    functions.set(key(fn), fn);
    referenceText += '\n' + fn.definition;
    changed = true;
  }
}
// Trace each baseline table to its original repository DDL, when present.
// The snapshot supplies later untracked columns/ACL; it is not backdated SQL.
const sourceFiles = execFileSync('git', ['ls-files', 'supabase/*.sql', 'supabase/steps/*.sql', 'supabase/sql/*.sql'], {encoding:'utf8'}).trim().split(/\r?\n/).filter(f => !/preflight|postflight|smoke|test-|validate-|candidate-|audit-|rollback/.test(f));
const sources = sourceFiles.filter(file => !file.startsWith('supabase/migrations/')).map(file => ({file, sql:fs.readFileSync(file,'utf8')}));
const provenance = [];
const sql = [
 '-- REPLAY ONLY. Dependency snapshot captured on 2026-09-27; not a historical migration.',
 '-- No INSERT/COPY or production rows. Never apply to an existing database.',
 "do $guard$ begin if current_database() <> 'jornada_migration_replay' or current_setting('jornada.replay',true) is distinct from 'on' then raise exception 'isolated replay required'; end if; end $guard$;",
 'set check_function_bodies = off;',
];
const post = [];
function acl(kind, target, entries, owner) {
  if (!entries) return [];
  const privileges = {a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',X:'EXECUTE',U:'USAGE',C:'CREATE'};
  const result = ['revoke all on ' + kind + ' ' + target + ' from public, anon, authenticated, service_role;'];
  for (const entry of entries) {
    const match = entry.match(/^([^=]*)=([^/]+)\/(.+)$/);
    if (!match) throw Error('Invalid ACL');
    const grantee = match[1] ? q(match[1].replaceAll('"','')) : 'public';
    if (match[1] === owner) continue;
    const grants = [...match[2]].filter(c => c !== '*').map(c => privileges[c]);
    if (grants.some(x => !x)) throw Error('Unknown ACL privilege');
    result.push('grant ' + grants.join(', ') + ' on ' + kind + ' ' + target + ' to ' + grantee + (match[2].includes('*') ? ' with grant option' : '') + ';');
  }
  return result;
}
// CHECK expressions and expression indexes may call unqualified foundation helpers.
sql.push(...[...functions.values()].map(fn => fn.definition+';'));
for (const table of tables.values()) {
  const excluded = addedColumns.get(key(table)) || new Set();
  const columns = table.columns.filter(c => !excluded.has(c.name));
  const used = text => [...excluded].some(name => new RegExp('\\b'+name+'\\b').test(text));
  const constraints = (table.constraints || []).filter(c => c.type !== 't' && !addedConstraints.has(c.name) && !used(c.definition));
  const origin = sources.filter(s => new RegExp('create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?' + table.name + '\\s*\\(', 'i').test(s.sql));
  provenance.push({table:key(table), snapshot:true, source_files:origin.map(s => ({file:s.file,sha256:crypto.createHash('sha256').update(s.sql).digest('hex')})), omitted_columns:[...excluded].filter(n => table.columns.some(c=>c.name===n))});
  sql.push('\n-- ' + key(table) + '; original DDL: ' + (origin.map(x=>x.file).join(', ') || 'production catalogue; no original CREATE found'));
  sql.push('create table ' + qualified(table) + ' (\n' + columns.map(c => '  '+q(c.name)+' '+c.type+(c.default?' default '+c.default:'')+(c.not_null?' not null':'')).concat(constraints.filter(c=>c.type!=='f').map(c=>'  constraint '+q(c.name)+' '+c.definition)).join(',\n') + '\n);');
  for (const c of constraints.filter(c=>c.type==='f')) {
    const target = c.definition.match(/REFERENCES\s+(?:([a-z_]\w*)\.)?([a-z_]\w*)\s*\(/i);
    const targetKey = target && (target[1] || 'public') + '.' + target[2];
    if (targetKey && createdTables.has(targetKey)) {
      provenance.at(-1).deferred_fk = [...(provenance.at(-1).deferred_fk||[]),c.name];
      continue;
    }
    post.push('alter table '+qualified(table)+' add constraint '+q(c.name)+' '+c.definition+';');
  }
  for(const index of table.indexes||[]) {
    if (constraints.some(c=>c.name===index.name) || createdIndexes.has(index.name) || used(index.definition)) continue;
    post.push(index.definition+';');
  }
  if(table.rls) post.push('alter table '+qualified(table)+' enable row level security;');
  if(table.force_rls) post.push('alter table '+qualified(table)+' force row level security;');
  post.push('alter table '+qualified(table)+' owner to '+q(table.owner)+';');
  post.push(...acl('table',qualified(table),table.acl,table.owner));
  if(table.comment) post.push('comment on table '+qualified(table)+' is '+literal(table.comment)+';');
  for(const column of columns) if(column.comment) post.push('comment on column '+qualified(table)+'.'+q(column.name)+' is '+literal(column.comment)+';');
}
for(const fn of functions.values()) {
  const target = qualified(fn)+'('+fn.identity+')';
  post.push('alter function '+target+' owner to '+q(fn.owner)+';');
  post.push(...acl('function',target,fn.acl,fn.owner));
  if(fn.comment) post.push('comment on function '+target+' is '+literal(fn.comment)+';');
}
for(const table of tables.values()) {
  for(const trigger of table.triggers||[]) if(!createdTriggers.has(trigger.name)) post.push(trigger.definition+';');
  for(const policy of table.policies||[]) {
    if(new RegExp('create\\s+policy\\s+"?'+policy.name+'"?\\b','i').test(chain)) continue;
    const command = {r:'select',a:'insert',w:'update',d:'delete','*':'all'}[policy.cmd];
    post.push('create policy '+q(policy.name)+' on '+qualified(table)+' as '+(policy.permissive?'permissive':'restrictive')+' for '+command+' to '+policy.roles.map(r=>r==='public'?'public':q(r)).join(', ')+(policy.using?' using ('+policy.using+')':'')+(policy.check?' with check ('+policy.check+')':'')+';');
  }
}
sql.push(...post, 'set check_function_bodies = on;', '');
fs.writeFileSync('.ci/migration-replay/baseline.sql',sql.join('\n'));
fs.writeFileSync(evidence+'/baseline-provenance.json',JSON.stringify({nature:'Dependency snapshot for replay only, not a backdated migration',tables:provenance,functions:[...functions.values()].map(f=>({schema:f.schema,name:f.name,identity:f.identity,source:'production-catalog.json'})),excluded_tables:catalog.tables.filter(t=>!createdTables.has(key(t))&&!tables.has(key(t))).map(key)},null,2)+'\n');
const platform = [
 '-- Minimal Supabase platform surface for a data-free isolated PostgreSQL replay.',
 "do $guard$ begin if current_database() <> 'jornada_migration_replay' then raise exception 'isolated replay required'; end if; end $guard$;",
 "alter database jornada_migration_replay set jornada.replay = 'on';",
 'create schema if not exists extensions;',
 'create schema if not exists auth;',
 'create schema if not exists vault;',
 'create table auth.users (id uuid primary key);',
 ...auxiliary.roles.filter(r=>r.name!=='postgres').map(r=>'create role '+q(r.name)+' nologin '+(r.bypass_rls?'bypassrls':'nobypassrls')+';'),
 'grant usage on schema public to anon, authenticated, service_role;',
 'grant usage on schema auth to anon, authenticated, service_role;',
 'create extension if not exists pgcrypto with schema extensions;',
 'create extension if not exists "uuid-ossp" with schema extensions;',
 'create extension if not exists supabase_vault with schema vault;',
 ...auxiliary.platform_functions.map(s=>s+';'),
 // Recorded defaults, applied before historical DDL. Object-specific ACLs are compared later.
 'alter default privileges for role postgres in schema public grant all on tables to service_role;',
 'alter default privileges for role postgres in schema public grant truncate, references, trigger, maintain on tables to anon, authenticated;',
 '',
];
fs.writeFileSync('.ci/migration-replay/platform.sql',platform.join('\n').replace(/[ \t]+$/gm, '').trimEnd()+'\n');
console.log(JSON.stringify({baseline_tables:tables.size,baseline_functions:functions.size,excluded_tables:catalog.tables.length-createdTables.size-tables.size}));
