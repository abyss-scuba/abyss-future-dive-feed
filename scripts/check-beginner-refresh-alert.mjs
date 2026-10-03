// Reads public status only. Never edits Help Scout, schedules, source articles or secrets.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const MARKER='<!-- abyss-beginner-refresh-health-v1 -->';
const date=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
export function assess(snapshot,{now=new Date().toISOString(),run=null,deadline=false}={}){
 const n=Date.parse(now),c=Date.parse(snapshot?.checkedAt),e=Date.parse(snapshot?.expiresAt);
 if(!Number.isFinite(n))throw Error('Invalid assessment time');
 if(!Number.isFinite(c)||!Number.isFinite(e)||c>n||e<=c||e-c>36*3600000)return {healthy:false,reason:'Missing or invalid verified snapshot times'};
 if(n>=e)return {healthy:false,reason:'Last verified beginner snapshot has expired'};
 if(run&&['failure','cancelled','timed_out','action_required'].includes(run.conclusion))return {healthy:false,reason:'Beginner updater completed with '+run.conclusion};
 if(deadline&&date(c)!==date(n))return {healthy:false,reason:'No verified refresh for the current Sydney day by the watchdog check'};
 return {healthy:true,reason:'Verified snapshot is fresh'+(date(c)===date(n)?' and checked on the current Sydney day':'')};
}
async function main(){
 const repo=process.env.GITHUB_REPOSITORY;if(repo!=='abyss-scuba/abyss-future-dive-feed')throw Error('Wrong repository');
 const token=process.env.GITHUB_TOKEN;if(!token)throw Error('Missing normal workflow token');
 const api=async(method,path,body)=>{const r=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('GitHub '+method+' status '+r.status);return r.status===204?null:r.json();};
 const now=new Date().toISOString(),test=process.env.ALERT_TEST==='true',dry=process.env.ALERT_DRY_RUN==='true';
 const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
 const wr=event.workflow_run;
 if(wr&&(wr.name!=='Beginner dive schedule Help Scout snapshot'||wr.head_branch!=='main'||!['schedule','push','workflow_dispatch'].includes(wr.event))){console.log('Unrelated workflow run ignored');return;}
 const statusFile=await api('GET','/contents/data/helpscout-beginner-sync-status.json?ref=main');
 const snapshot=JSON.parse(Buffer.from(statusFile.content,'base64').toString('utf8'));
 const check=assess(snapshot,{now,run:wr,deadline:process.env.GITHUB_EVENT_NAME==='schedule'});
 const marker=test?MARKER.replace('-v1','-delivery-test-v1'):MARKER;
 const title=test?'[TEST] Beginner schedule alert delivery':'Beginner dive schedule refresh needs attention';
 const issues=await api('GET','/issues?state=open&per_page=100');
 const matches=issues.filter(i=>!i.pull_request&&i.body?.includes(marker));if(matches.length>1)throw Error('Multiple matching health issues; refusing ambiguous update');
 let issue=matches[0];const summary={checkedAt:now,test,dryRun:dry,...check,lastVerifiedCheck:snapshot.checkedAt,expiresAt:snapshot.expiresAt,issueNumber:issue?.number||null};
 const body=marker+'\n\n'+(test?'**TEST — no production failure has been induced.** This verifies repository alert creation, readback and closure.\n\n':'@abyss-scuba — the existing beginner updater needs review.\n\n')+
  'Assessment: '+check.reason+'\n\nChecked (UTC): '+now+'\nLast verified schedule check: '+snapshot.checkedAt+'\nExpiry: '+snapshot.expiresAt+'\n\n'+
  (wr?'Updater run: '+wr.html_url+'\n\n':'')+'Expected refresh: 03:30 Australia/Sydney, guarded retry at 04:15, permitted publication window 00:30–06:00. A late or failed run must not be relabelled as a successful overnight refresh. This alert does not alter last-known-good data or its timestamps.\n\n'+
  'Delivery here verifies the repository issue channel only; email/push notification receipt depends on account notification settings and is not asserted.';
 if(dry){console.log(JSON.stringify(summary));return;}
 if(test||!check.healthy){
  issue=issue?await api('PATCH','/issues/'+issue.number,{title,body}):await api('POST','/issues',{title,body,assignees:['abyss-scuba']});
  const read=await api('GET','/issues/'+issue.number);if(read.body!==body||read.state!=='open')throw Error('Alert readback mismatch');
  summary.issueNumber=read.number;summary.issueUrl=read.html_url;summary.repositoryDeliveryVerified=true;
  if(test){await api('PATCH','/issues/'+read.number,{state:'closed',state_reason:'completed'});const closed=await api('GET','/issues/'+read.number);if(closed.state!=='closed')throw Error('Test issue closure not verified');summary.testIssueClosed=true;}
 }else if(issue){
  await api('POST','/issues/'+issue.number+'/comments',{body:'Refresh recovered. '+check.reason+'. Verified check '+snapshot.checkedAt+'. Assessment '+now+'.'});
  await api('PATCH','/issues/'+issue.number,{state:'closed',state_reason:'completed'});summary.recoveryClosed=true;
 }
 await fs.mkdir('diagnostics/beginner-health',{recursive:true});await fs.writeFile('diagnostics/beginner-health/result.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
