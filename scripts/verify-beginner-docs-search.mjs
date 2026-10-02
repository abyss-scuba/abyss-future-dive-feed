/** Read-only Docs search smoke checks. This is NOT an AI Answers test. */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {makeClient} from '../src/helpscout-beginner-publish.mjs';
const SITE='5d0ed4d02c7d3a6ebd2268ed';
export const CASES=[
 ['N1-exact','6abf7099528fa6f4b198b51b','Suggested Pick'],
 ['N1-variant','6abf7099528fa6f4b198b51b','the calendar is empty'],
 ['N2-exact','6abf733d3be702ed269e3fa6','only four Open Water course dives'],
 ['N2-variant','6abf733d3be702ed269e3fa6','who guides my first certified dive'],
 ['N3-exact','6abf7841c3e570044c28921f','I use my air quickly'],
 ['N3-variant','6abf7841c3e570044c28921f','anxious about using my air before everyone else'],
 ['N4-exact','6abf76557cdaed3f1efa5fa0','full scuba equipment hire inclusions'],
 ['N4-variant','6abf76557cdaed3f1efa5fa0','does renting everything include a wetsuit and cylinders'],
 ['N5-exact','6abf7b9f3be702ed269e3faf','lost my diving certification card'],
 ['N5-variant','6abf7b9f3be702ed269e3faf','can I use an electronic dive certification card'],
 ['D1-exact','6abf6f632bd8064b0717cab1','beginner dive dates'],
 ['D1-variant','6abf6f632bd8064b0717cab1','next boat diving dates for Henry Head']
];
export async function searchChecks(request,cases=CASES){
 const result=[];
 for(const [caseId,expectedId,query] of cases){
  const params=new URLSearchParams({query,siteId:SITE,status:'published',visibility:'all',page:'1'});
  const data=(await request('GET','/search/articles?'+params)).articles;
  if(!data||!Array.isArray(data.items)||data.page!==1||!Number.isInteger(data.count))throw new Error('Invalid search envelope');
  const index=data.items.findIndex(a=>a.id===expectedId);
  // Never export preview, returned article text, or unrelated private metadata.
  result.push({caseId,query,expectedArticleId:expectedId,firstPageRank:index<0?null:index+1,foundOnFirstPage:index>=0,returnedCount:data.items.length,totalResults:data.count});
 }
 return result;
}
async function main(){
 const request=makeClient(process.env.HELP_SCOUT_DOCS_API_KEY);
 const report={checkedAt:new Date().toISOString(),type:'DOCS_SEARCH_NOT_AI_ANSWERS',results:await searchChecks(request)};
 report.found=report.results.filter(r=>r.foundOnFirstPage).length;
 report.tested=report.results.length;
 await fs.mkdir('diagnostics/beginner-keywords',{recursive:true});
 await fs.writeFile('diagnostics/beginner-keywords/docs-search.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({type:report.type,found:report.found,tested:report.tested,checkedAt:report.checkedAt}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Read-only Docs search check failed; no private content logged.');process.exitCode=1;});
