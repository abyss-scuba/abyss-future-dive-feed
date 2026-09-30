import fs from 'node:fs/promises';import {DateTime} from 'luxon';
import {scrapeAvelo,buildSnapshot,validateLinks,renderSnapshot,staleHtml,publishSnapshot,makeDocsClient,ZONE,hash,comparable,check} from '../src/helpscout-avelo.mjs';
const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
const now=DateTime.now().setZone(ZONE),dry=process.env.DRY_RUN!=='false',mode=process.env.AVELO_MODE||'refresh',previous=await read('data/helpscout-avelo-sync-status.json'),knowledge=await read('data/helpscout-avelo-knowledge-status.json');
const target=knowledge?.articles?.find(a=>a.schedule)?.id,request=dry?null:makeDocsClient(process.env.HELP_SCOUT_DOCS_API_KEY);await fs.mkdir('diagnostics',{recursive:true});
let report;
const save=async r=>{await fs.writeFile('diagnostics/helpscout-avelo-sync-summary.json',JSON.stringify(r,null,2));if(!dry)await fs.writeFile('data/helpscout-avelo-sync-status.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));};
try{
 if(!dry)check(target,'Avelo schedule article has not been published');
 if(mode==='watchdog'){
  const expired=!previous?.lastSuccessfulCheck||!previous?.validUntil||now>=DateTime.fromISO(previous.validUntil);
  if(expired){const publication=await publishSnapshot({request,id:target,text:staleHtml('The expected daily refresh did not complete before its expiry.')});await save({...previous,attemptedAt:now.toISO(),status:'stale-fallback-published',publication,agentVerification:'pending internal Test',error:'No current verified snapshot'});process.exitCode=1;}
  else {const a=(await request('GET',`/articles/${target}`)).article;check(hash(comparable(a.text))===previous.publication?.textHash,'Schedule content changed after last readback');await save({...previous,watchdogCheckedAt:now.toISO(),watchdog:'current article verified'});}
 }else if(!dry&&previous?.localDate===now.toISODate()&&previous?.status==='published-and-read-back'&&now<DateTime.fromISO(previous.validUntil)){
  const a=(await request('GET',`/articles/${target}`)).article;check(hash(comparable(a.text))===previous.publication.textHash,'Same-day schedule differs from verified snapshot');console.log('Avelo daily publication already completed; verified without duplicate update.');
 }else{
  const raw=await scrapeAvelo();await fs.writeFile('diagnostics/helpscout-avelo-raw.json',JSON.stringify(raw,null,2));const snapshot=buildSnapshot(raw,{now,previous});await validateLinks(snapshot);const text=renderSnapshot(snapshot);await fs.writeFile('diagnostics/helpscout-avelo-snapshot.json',JSON.stringify(snapshot,null,2));await fs.writeFile('diagnostics/helpscout-avelo-article.html',text);
  const publication=dry?{status:'dry-run'}:await publishSnapshot({request,id:target,text});
  report={attemptedAt:now.toISO(),status:publication.status,lastSuccessfulCheck:snapshot.checkedAt,validUntil:snapshot.validUntil,localDate:snapshot.localDate,futureCount:snapshot.rows.length,prices:Object.fromEntries(snapshot.rows.map(r=>[r.id,r.price])),coverage:snapshot.extraction,publication,agentVerification:'pending internal Test'};await save(report);
 }
}catch(e){const expired=!previous?.validUntil||now>=DateTime.fromISO(previous.validUntil);report={...previous,attemptedAt:now.toISO(),status:'failed-last-good-preserved',error:e.message,stale:expired,agentVerification:'not verified'};
 if(!dry&&expired&&target){try{report.fallback=await publishSnapshot({request,id:target,text:staleHtml()});}catch(err){report.fallbackError=err.message}}
 await save(report);process.exitCode=1;
}
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`Avelo ${mode}: ${report?.status||'watchdog/idempotency check completed'}. Schedule 07:00 Australia/Sydney; expiry 07:30 next local day. Agent retrieval requires the internal Test check.\n`);
