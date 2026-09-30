import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {buildTravelSnapshot,renderTravelSnapshot,updateTravelSnapshot,SOURCE_URL,WIDGET_ID,ZONE} from '../src/helpscout-travel.mjs';
const DRY_RUN=process.env.DRY_RUN!=='false';
async function stable(root){
 let before='',count=0;
 for(let i=0;i<90;i++){
  const current=await root.locator('tr.main-row').allTextContents();
  const signature=JSON.stringify(current);
  if(current.length&&signature===before)count++;else count=0;
  if(count>=3)return;
  before=signature;await new Promise(r=>setTimeout(r,750));
 }
 throw new Error('Travel widget did not produce stable rows');
}
async function scrape(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({locale:'en-AU',timezoneId:ZONE});
  await page.route('**/*',r=>['image','font','media'].includes(r.request().resourceType())?r.abort():r.continue());
  await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded',timeout:120000});
  const root=page.locator(`#widget${WIDGET_ID}`);await root.waitFor({state:'attached',timeout:90000});await stable(root);
  const rows=[],signatures=new Set();
  for(let n=1;n<=30;n++){
   const headings=await root.locator('thead th').allTextContents();
   if(JSON.stringify(headings.map(t=>t.trim()).filter(Boolean))!==JSON.stringify(['Start date','End date','Travel','Max. Places','Places Available','Price']))throw new Error('Travel table columns changed');
   const batch=await root.locator('tbody tr.main-row').evaluateAll(rs=>rs.map(r=>{const c=Array.from(r.querySelectorAll(':scope > td'));return {startDate:c[1].textContent.trim(),endDate:c[2].textContent.trim(),name:c[3].textContent.trim(),maxPlaces:c[4].textContent.trim(),available:c[5].textContent.trim(),price:c[6].textContent.trim(),bookingUrl:r.querySelector('a[href*="?q="]').href,description:r.nextElementSibling?.querySelector('p[style]')?.textContent.trim()??''}}));
   const signature=JSON.stringify(batch);if(signatures.has(signature))throw new Error('Repeated travel page; no publication');signatures.add(signature);rows.push(...batch);
   const next=root.locator(`.pagination .page-link[data-page="${n+1}"]`);
   if(!await next.count())return rows;
   if(n===30)throw new Error('Travel pagination exceeds 30 pages');
   await next.first().click();await stable(root);
  }
 }finally{await browser.close()}
}
async function main(){
 await fs.mkdir('diagnostics',{recursive:true});
 const rows=await scrape(),snapshot=buildTravelSnapshot(rows);
 await fs.writeFile('diagnostics/helpscout-travel-candidate.html',renderTravelSnapshot(snapshot));
 await fs.writeFile('diagnostics/helpscout-travel-rows.json',JSON.stringify(rows,null,2));
 const target=JSON.parse(await fs.readFile('data/helpscout-travel-target.json','utf8'));
 const publication=await updateTravelSnapshot(snapshot,target,process.env.HELP_SCOUT_DOCS_API_KEY,{dryRun:DRY_RUN});
 const summary={checkedAt:snapshot.checkedAt,firstDate:snapshot.trips[0].startDate,lastDate:snapshot.trips.at(-1).endDate,availableDepartures:snapshot.trips.filter(t=>t.available>0).length,soldOutDepartures:snapshot.trips.filter(t=>t.available===0).length,publication};
 await fs.writeFile('diagnostics/helpscout-travel-summary.json',JSON.stringify(summary,null,2));
 if(!DRY_RUN)await fs.writeFile('data/helpscout-travel-sync-status.json',JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify(summary));
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`Travel snapshot ${publication.status}: ${publication.count} departures; checked ${snapshot.checkedAt}. Daily schedule: 08:00 Australia/Sydney.\n`);
}
main().catch(e=>{console.error(`Travel snapshot failed: ${e.message}`);process.exitCode=1});
