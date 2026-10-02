#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSnapshot,renderArticle,validateCountChange,sydneyParts } from '../src/helpscout-beginner-snapshot.mjs';
import { makeClient,readTarget,isDue,publishSnapshot } from '../src/helpscout-beginner-publish.mjs';
import { validateBookingLinks } from '../src/helpscout-beginner-links.mjs';
const TARGET='data/helpscout-beginner-target.json',LAST='data/helpscout-beginner-last-good.json';
const readJson=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const writeJson=async(p,v)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,JSON.stringify(v,null,2)+'\n');};
async function main(){
 const now=new Date().toISOString(),args=new Set(process.argv.slice(2));
 const bootstrap=process.env.BOOTSTRAP==='true',force=process.env.FORCE_REFRESH==='true',publish=process.env.PUBLISH==='true';
 const target=await readJson(TARGET);
 if(args.has('--due')){
  if(process.env.GITHUB_EVENT_NAME==='schedule'){
   const t=sydneyParts(now).time;if(t<'00:30'||t>'06:00')throw new Error('Scheduled run is outside 00:30–06:00 Sydney; no publication');
  }
  let due=true;
  if(target){const current=await readTarget(makeClient(process.env.HELP_SCOUT_DOCS_API_KEY),target);due=isDue(current,now,{force});}
  else if(!bootstrap)throw new Error('Fixed target missing; manual bootstrap is required');
  if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`due=${due}\n`);
  console.log(JSON.stringify({due,checkedAt:now,mode:'target-status-only'}));return;
 }
 const report=await readJson('diagnostics/beginner-widget/inspection.json');
 const snapshot=buildSnapshot(report,{now});const previous=await readJson(LAST);validateCountChange(snapshot,previous);
 await validateBookingLinks(snapshot);
 await writeJson('diagnostics/beginner-public/candidate.json',snapshot);
 await fs.writeFile('diagnostics/beginner-public/candidate.html',renderArticle(snapshot));
 if(!publish){console.log(JSON.stringify({status:'validated-candidate-not-published',counts:snapshot.counts,sourceCounts:snapshot.sourceCounts}));return;}
 const publication=await publishSnapshot({request:makeClient(process.env.HELP_SCOUT_DOCS_API_KEY),snapshot,target,bootstrap,dryRun:false,force,now,
  backup:async b=>{const p=path.join(process.env.RUNNER_TEMP||'/tmp','beginner-schedule-backup.json');await fs.writeFile(p,JSON.stringify(b),{mode:0o600});}});
 if(['created-and-verified','updated-and-verified'].includes(publication.status)){
  await writeJson(TARGET,publication.target);await writeJson(LAST,snapshot);
  await writeJson('data/helpscout-beginner-sync-status.json',{status:publication.status,checkedAt:snapshot.checkedAt,publishedAt:new Date().toISOString(),expiresAt:snapshot.expiresAt,counts:snapshot.counts,sourceCounts:snapshot.sourceCounts,coverage:snapshot.coverage,target:publication.target,textHash:publication.textHash,schedule:'03:30 Australia/Sydney',retry:'04:15 after failure only'});
 }
 const summary={status:publication.status,counts:snapshot.counts,target:publication.target,checkedAt:snapshot.checkedAt};
 console.log(JSON.stringify(summary));
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,JSON.stringify(summary,null,2)+'\n');
}
main().catch(e=>{console.error('Beginner snapshot: '+e.message);process.exitCode=1;});
