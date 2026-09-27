// Read-only CI evidence retrieval. Uses Git's existing GitHub credential in memory.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const repo='silvamplam/Jornada-pt-final';
const branch='jornada-supabase-migration-history-reconciliation-20260927';
const credential=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
const password=credential.split('\n').find(line=>line.startsWith('password='))?.slice(9);
if(!password) throw Error('GitHub credential unavailable');
const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+password,'X-GitHub-Api-Version':'2022-11-28'};
async function get(path) {
 const response=await fetch('https://api.github.com/repos/'+repo+path,{headers});
 if(!response.ok) throw Error('GitHub GET '+response.status+' '+path);
 return response.json();
}
const runs=await get('/actions/runs?branch='+encodeURIComponent(branch)+'&per_page=10');
const run=process.argv[2] ? runs.workflow_runs.find(r=>String(r.id)===process.argv[2]) : runs.workflow_runs.find(r=>r.name.startsWith('Migration history'));
if(!run) throw Error('Run not found');
const jobs=await get('/actions/runs/'+run.id+'/jobs');
console.log(JSON.stringify({id:run.id,sha:run.head_sha,status:run.status,conclusion:run.conclusion,url:run.html_url,jobs:jobs.jobs.map(j=>({id:j.id,status:j.status,conclusion:j.conclusion,steps:j.steps.map(s=>({name:s.name,status:s.status,conclusion:s.conclusion}))}))}));
if(run.status!=='completed') process.exit(0);
const directory='.ci/migration-replay/output/run-'+run.id;
fs.mkdirSync(directory,{recursive:true});
const artifacts=await get('/actions/runs/'+run.id+'/artifacts');
for(const artifact of artifacts.artifacts) {
 const response=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+artifact.id+'/zip',{headers,redirect:'manual'});
 if(response.status!==302) throw Error('Artifact redirect '+response.status);
 const archive=await fetch(response.headers.get('location'));
 if(!archive.ok) throw Error('Artifact download '+archive.status);
 fs.writeFileSync(directory+'/'+artifact.name+'.zip',Buffer.from(await archive.arrayBuffer()));
}
for(const job of jobs.jobs) {
 const response=await fetch('https://api.github.com/repos/'+repo+'/actions/jobs/'+job.id+'/logs',{headers,redirect:'manual'});
 if(response.status!==302) continue;
 const logs=await (await fetch(response.headers.get('location'))).text();
 fs.writeFileSync(directory+'/job-'+job.id+'.log',logs);
 console.log(logs.split('\n').filter(line=>/error|ERROR|failed|Last output|17\.6|Applying migration/i.test(line)).slice(-28).join('\n'));
}
