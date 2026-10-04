#!/usr/bin/env node
/** READ-ONLY against Help Scout. Only public health metadata is written to GitHub. */
import fs from 'node:fs/promises';
import {DateTime} from 'luxon';
import {PIPELINES,ZONE,evaluatePipeline,summaryMarkdown} from '../src/helpscout-daily-health.mjs';
const REPO='abyss-scuba/abyss-future-dive-feed';
const RESULT='data/helpscout-daily-health.json';
const MARKER='<!-- ABYSS_DAILY_DOCS_HEALTH_V1 -->';
const ghToken=process.env.GITHUB_TOKEN,docsKey=process.env.HELP_SCOUT_DOCS_API_KEY;
const deliver=process.env.HEALTH_DELIVER==='true';
const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function request(url,{method='GET',headers={},body}={}){
 const attempts=method==='GET'?3:1;
 for(let i=0;i<attempts;i++){
  try{const r=await fetch(url,{method,headers,redirect:'error',signal:AbortSignal.timeout(30000),...(body?{body:JSON.stringify(body)}:{})});
   if(!r.ok){if(i+1<attempts&&(r.status===429||r.status>=500)){await new Promise(r=>setTimeout(r,1000*(i+1)));continue;}throw Error('HTTP '+r.status);}
   return r.status===204?null:await r.json();
  }catch(e){if(i+1===attempts)throw e;await new Promise(r=>setTimeout(r,1000*(i+1)));}
 }
}
const gh=(path,method='GET',body)=>request('https://api.github.com/repos/'+REPO+path,{method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+ghToken,'Content-Type':'application/json'},body});
async function docsArticle(spec){
 if(!docsKey)throw Error('Docs credentials unavailable');
 return (await request('https://docsapi.helpscout.net/v1/articles/'+spec.id,{headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from(docsKey+':X').toString('base64')}})).article;
}
function configErrors(text){
 const block=text.match(/^  schedule:\s*\n((?: {4,}.*\n)+)/m)?.[1]||'';
 const crons=[...block.matchAll(/cron:\s*["']([^"']+)["']/g)].map(m=>m[1]);
 return [...(!crons.length?['daily-schedule-missing']:[]),...(!crons.some(c=>/^\S+ \S+ \* \* \*$/.test(c))?['daily-cron-not-found']:[]),...(!/timezone:\s*["']?Australia\/Sydney/.test(block)?['Sydney-timezone-missing']:[])];
}
async function findIncident(){
 for(let page=1;page<=10;page++){const list=await gh('/issues?state=open&per_page=100&page='+page);const found=list.find(x=>!x.pull_request&&x.body?.includes(MARKER));if(found)return found;if(list.length<100)return null;}
 throw Error('Issue search pagination limit');
}
async function testDelivery(){
 const marker='ABYSS_DAILY_DOCS_ALERT_DELIVERY_TEST';
 const issue=await gh('/issues','POST',{title:'[TEST] Help Scout daily failure-alert delivery',body:marker+'\n\nAuthorised delivery test only. No live scrape failure is simulated in an article. This test issue is read back and closed automatically.'});
 const readback=await gh('/issues/'+issue.number);
 if(!readback.body?.includes(marker))throw Error('Test alert readback mismatch');
 const closed=await gh('/issues/'+issue.number,'PATCH',{state:'closed'});
 if(closed.state!=='closed')throw Error('Test alert closure failed');
 return {issue:issue.number,url:issue.html_url,createdReadBackAndClosed:true,emailReceiptVerified:false};
}
async function deliverIncident(report){
 const problems=report.monitorErrors.length>0||report.sources.some(s=>s.errors.length||s.warnings.some(w=>!w.includes('awaiting-todays-refresh')&&!w.startsWith('workflow-queued')&&!w.startsWith('workflow-in_progress')));
 const body=MARKER+'\n'+summaryMarkdown(report);let issue=await findIncident();
 if(problems){
  if(!issue){issue=await gh('/issues','POST',{title:'Help Scout daily refresh: attention required',body});const verify=await gh('/issues/'+issue.number);if(!verify.body?.includes(MARKER))throw Error('Failure alert readback mismatch');return {issue:issue.number,url:issue.html_url,action:'created-and-read-back'};}
  const day=DateTime.fromISO(report.checkedAt).setZone(ZONE).toISODate(),dailyMarker='<!-- DAILY_DOCS_REPORT:'+day+' -->';
  const comparable=r=>JSON.stringify(r.sources.map(s=>[s.key,s.state,s.errors,s.warnings]));
  const previous=await read(RESULT);const changed=!previous||comparable(previous)!==comparable(report)||JSON.stringify(previous.monitorErrors)!==JSON.stringify(report.monitorErrors);
  if(changed||!issue.body?.includes(dailyMarker)){
   await gh('/issues/'+issue.number,'PATCH',{body:body+'\n'+dailyMarker});
   await gh('/issues/'+issue.number+'/comments','POST',{body:dailyMarker+'\n'+summaryMarkdown(report)});
  }
  return {issue:issue.number,url:issue.html_url,action:changed?'updated':'daily-deduplicated'};
 }
 if(issue&&report.sources.every(s=>s.state==='PASS')){
  await gh('/issues/'+issue.number+'/comments','POST',{body:'Recovery verified by published-article checks at '+report.checkedAt+'.\n\n'+summaryMarkdown(report)});
  const closed=await gh('/issues/'+issue.number,'PATCH',{state:'closed'});if(closed.state!=='closed')throw Error('Recovery alert closure failed');
  return {issue:issue.number,url:issue.html_url,action:'recovered-and-closed'};
 }
 return {action:'no-new-failure',issue:issue?.number||null};
}
async function saveHeartbeat(report){
 // Compare-and-swap a single metadata file. Never push an old checkout or force-push.
 for(let attempt=0;attempt<3;attempt++){
  let remote;try{remote=await gh('/contents/'+RESULT+'?ref=main');}catch(e){if(e.message!=='HTTP 404')throw e;}
  if(remote?.content){const old=JSON.parse(Buffer.from(remote.content,'base64').toString('utf8'));if(Date.parse(old.checkedAt)>Date.parse(report.checkedAt))return 'newer-report-retained';}
  try{await gh('/contents/'+RESULT,'PUT',{message:'chore: record daily Help Scout publication health',branch:'main',content:Buffer.from(JSON.stringify(report,null,2)+'\n').toString('base64'),...(remote?{sha:remote.sha}:{})});return 'saved';}catch(e){if(attempt===2||!['HTTP 409','HTTP 422'].includes(e.message))throw e;}
 }
}
async function main(){
 if(!ghToken)throw Error('GitHub reporting credential unavailable');
 const now=DateTime.now().setZone(ZONE),previous=await read(RESULT);
 const report={schemaVersion:1,checkedAt:now.toISO(),localDate:now.toISODate(),repository:REPO,scope:'Seven maintained Help Scout date publishers, including derived date sections; separate website future-feed dependency.',sources:[],monitorErrors:[],agentAnswerTests:'not performed by this monitor'};
 for(const config of PIPELINES){
  try{
   const status=await read('data/'+config.statusFile);
   const [workflow,runList,articles,text]=await Promise.all([
    gh('/actions/workflows/'+config.workflow),
    gh('/actions/workflows/'+config.workflow+'/runs?branch=main&per_page=30'),
    Promise.all(config.articles.map(s=>docsArticle(s))),
    fs.readFile('.github/workflows/'+config.workflow,'utf8')]);
   const row=evaluatePipeline(config,{status,workflow,runs:runList.workflow_runs,articles,now,previous:previous?.sources?.find(s=>s.key===config.key)});
   row.errors.push(...configErrors(text));if(row.errors.length)row.state='FAIL';report.sources.push(row);
  }catch(e){report.sources.push({key:config.key,label:config.label,state:'FAIL',checkedAt:null,count:null,workflow:config.workflow,articles:[],errors:['verification-unavailable: '+e.message],warnings:[]});}
 }
 const files=await fs.readdir('.github/workflows');
 for(const name of files){if(/^sync-helpscout-.*\.ya?ml$/.test(name)&&!PIPELINES.some(x=>x.workflow===name)){const text=await fs.readFile('.github/workflows/'+name,'utf8');if(/^  schedule:/m.test(text))report.monitorErrors.push('unmonitored-scheduled-publisher: '+name);}}
 // An additional website feed is not a Help Scout article. Keep that distinction visible.
 const feed=await read('data/future-dives.json');const generated=Date.parse(feed?.generatedAt);
 report.websiteFutureFeed={generatedAt:feed?.generatedAt||null,state:Number.isFinite(generated)&&generated<=now.toMillis()&&now.toMillis()-generated<30*3600000?'PASS':'FAIL'};
 if(report.websiteFutureFeed.state==='FAIL')report.monitorErrors.push('website-future-feed-not-verified-within-30-hours');
 report.state=report.monitorErrors.length||report.sources.some(s=>s.state==='FAIL')?'FAIL':report.sources.some(s=>s.state==='WARN')?'WARN':'PASS';
 await fs.mkdir('diagnostics/daily-docs-health',{recursive:true});
 if(deliver){
  try{report.delivery=await deliverIncident(report);if(process.env.HEALTH_TEST_DELIVERY==='true')report.deliveryTest=await testDelivery();}
  catch(e){report.monitorErrors.push('notification-delivery-failed: '+e.message);report.state='FAIL';}
 }
 await fs.writeFile('diagnostics/daily-docs-health/report.json',JSON.stringify(report,null,2)+'\n');
 await fs.writeFile('diagnostics/daily-docs-health/report.md',summaryMarkdown(report)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summaryMarkdown(report)+'\n');
 if(deliver)await saveHeartbeat(report);
 console.log(JSON.stringify({checkedAt:report.checkedAt,state:report.state,sources:report.sources.map(s=>({source:s.label,state:s.state,count:s.count,errors:s.errors,warnings:s.warnings})),delivery:report.delivery,deliveryTest:report.deliveryTest,monitorErrors:report.monitorErrors}));
 if(report.state==='FAIL')process.exitCode=1;
}
main().catch(e=>{console.error('Daily Docs monitor failed: '+e.message);process.exitCode=1;});
