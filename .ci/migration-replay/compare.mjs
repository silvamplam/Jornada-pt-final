import fs from 'node:fs';
import { tokens } from './sql-tokens.mjs';
const expected = JSON.parse(fs.readFileSync('docs/migration-reconciliation/20260927/production-catalog.json','utf8'));
const actualText = fs.readFileSync(process.argv[2], 'utf8').split('\n').find(line=>line.startsWith('{'));
const actual = JSON.parse(actualText);
const baseline = JSON.parse(fs.readFileSync('docs/migration-reconciliation/20260927/baseline-provenance.json','utf8'));
const key = item => item.schema+'.'+item.name+(item.identity===undefined?'':'('+item.identity+')');
const normSql = value => value === null ? null : tokens(value);
const sort = items => [...(items||[])].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
function normalize(item) {
  if(item===null || typeof item!=='object') return item;
  if(Array.isArray(item)) return sort(item.map(normalize));
  return Object.fromEntries(Object.keys(item).sort().map(field=>{
    let value=item[field];
    if(['definition','default','using','check'].includes(field)) return [field,normSql(value)];
    if(field==='acl' && value===null) return [field,null];
    return [field,normalize(value)];
  }));
}
const differences=[], compared=[], excluded=[];
for(const kind of ['tables','functions']) {
  const wanted=new Map(expected[kind].map(item=>[key(item),item]));
  const found=new Map(actual[kind].map(item=>[key(item),item]));
  for(const [name,item] of wanted) {
    if(!found.has(name)) {
      if((kind==='tables' && baseline.excluded_tables.includes(name)) ||
         (kind==='functions' && baseline.excluded_functions.includes(name))) excluded.push({kind,name,reason:'outside dependency closure; neither defined, renamed nor referenced by the chain/baseline'});
      else differences.push({kind,name,issue:'missing'});
      continue;
    }
    compared.push({kind,name});
    const before=normalize(item),after=normalize(found.get(name));
    const fields=Object.keys(before).filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field]));
    if(fields.length) differences.push({kind,name,fields,production:Object.fromEntries(fields.map(f=>[f,item[f]])),replay:Object.fromEntries(fields.map(f=>[f,found.get(name)[f]]))});
  }
  for(const name of found.keys()) if(!wanted.has(name)) differences.push({kind,name,issue:'unexpected'});
}
const cronExpected=(expected.cron_jobs||[]).map(j=>({...j,database:'<replay-database>'}));
const cronActual=(actual.cron_jobs||[]).map(j=>({...j,database:'<replay-database>'}));
if(JSON.stringify(normalize(cronExpected))!==JSON.stringify(normalize(cronActual))) differences.push({kind:'cron',production:cronExpected,replay:cronActual});
for(const schema of expected.schemas||[]) {
  const found=actual.schemas.find(s=>s.name===schema.name);
  if(JSON.stringify(normalize(schema))!==JSON.stringify(normalize(found))) differences.push({kind:'schema',name:schema.name,production:schema,replay:found});
}
const report={compared_count:compared.length,difference_count:differences.length,excluded,compared,differences,normalization:['SQL whitespace and comments; quoted values preserved','physical column order; named columns are compared','cron database name differs intentionally; commands/schedule/active/user compared']};
fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({compared:compared.length,differences:differences.map(d=>({kind:d.kind,name:d.name,issue:d.issue,fields:d.fields})),excluded:excluded.length}));
if(differences.length) process.exitCode=1;
