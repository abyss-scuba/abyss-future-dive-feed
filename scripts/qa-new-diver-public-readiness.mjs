// Owner-authorised public-page QA only. No credentials, messages, carts or bookings.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='diagnostics/new-diver-readiness';
await fs.mkdir(out,{recursive:true});
const home='https://www.abyss.com.au/beginner-dive-calendar';
const widths=[390,767,768,1024,1440];
const report={checkedAt:new Date().toISOString(),timezone:'Australia/Sydney',scope:'Read-only public calendar and pre-cart booking controls; not AI or human-contact testing',pages:[],errors:[],bookingSubmitted:false,cartCreated:false,formsSubmitted:false};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Australia/Sydney',locale:'en-AU'});
// Never follow transactional navigation. Reading dynamic public pages remains allowed.
await context.route(/(?:\/checkout(?:[/?]|$)|\/addtocart|\/add-to-cart)/i,route=>route.abort());
const page=await context.newPage();page.setDefaultTimeout(12000);
page.on('pageerror',e=>report.errors.push(String(e.message).slice(0,500)));
const save=async(name,value)=>fs.writeFile(out+'/'+name,typeof value==='string'?value:JSON.stringify(value,null,2));
async function dimensions(p){return p.evaluate(()=>{
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
 const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};};
 const h=[...document.querySelectorAll('h1')].filter(visible).map(e=>({text:e.innerText,rect:rect(e)}));
 const overflow=[...document.querySelectorAll('main *, [role=main] *, article *, .container *')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left< -2||r.right>innerWidth+2;}).slice(0,30).map(e=>({tag:e.tagName,id:e.id,classes:String(e.className).slice(0,160),text:e.innerText?.slice(0,120),rect:rect(e)}));
 return {innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,h1:h,overflow,frames:[...document.querySelectorAll('iframe')].map(e=>({title:e.title,id:e.id,name:e.name,src:e.src,visible:visible(e),rect:rect(e)})),cookieControls:[...document.querySelectorAll('button,a')].filter(visible).filter(e=>/cookie|consent|accept all/i.test(e.innerText||'')).map(e=>({text:e.innerText,rect:rect(e)}))};
});}
async function captureWidths(p,prefix){const rows=[];for(const width of widths){await p.setViewportSize({width,height:900});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(500);const m=await dimensions(p);const screenshot=prefix+'-'+width+'.png';await p.screenshot({path:out+'/'+screenshot});rows.push({...m,screenshot});}return rows;}
async function controls(p){const rows=[];for(const f of p.frames()){try{rows.push({frameUrl:f.url(),controls:await f.locator('input,select,button,textarea').evaluateAll(es=>es.map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,value:e.type==='password'?'[omitted]':e.value,text:e.innerText?.slice(0,400),placeholder:e.placeholder,visible:!!(e.getBoundingClientRect().width&&e.getBoundingClientRect().height),options:e.tagName==='SELECT'?[...e.options].map(o=>({text:o.text,value:o.value})):undefined}))) });}catch(e){rows.push({frameUrl:f.url(),error:String(e.message).slice(0,200)});}}return rows;}
try{
 const response=await page.goto(home,{waitUntil:'domcontentloaded',timeout:45000});
 await save('calendar-source.html',await response.text());
 await page.waitForFunction(()=>document.body.innerText.includes('Oak Park'),{timeout:35000}).catch(()=>{});
 await page.waitForTimeout(2500);
 const links=await page.locator('a[href]').evaluateAll(es=>es.map(e=>({text:e.innerText,href:e.href,visible:!!(e.getBoundingClientRect().width&&e.getBoundingClientRect().height),context:e.closest('article,.card,.event-card,.dive-card')?.innerText||e.parentElement?.innerText||''})));
 const decoded=links.filter(x=>x.href.includes('q=')).map(x=>{try{return {...x,bookingFields:Buffer.from(new URL(x.href).searchParams.get('q'),'base64').toString('utf8')};}catch{return x;}});
 await save('calendar-event-links.json',decoded);
 const target=decoded.find(x=>x.visible&&x.bookingFields?.includes('open_cart_id=66412497'));
 report.pages.push({name:'calendar',url:page.url(),status:response.status(),eventLinks:decoded.length,visibleEventLinks:decoded.filter(x=>x.visible).length,oakPark11October:target||null,widthChecks:await captureWidths(page,'calendar')});
 await save('calendar-rendered.html',await page.content());
 await page.setViewportSize({width:390,height:900});
 await page.screenshot({path:out+'/calendar-390-full.png',fullPage:true});
 const tabSequence=[];
 await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
 for(let i=0;i<25;i++){await page.keyboard.press('Tab');tabSequence.push(await page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,id:e.id,text:(e.innerText||e.getAttribute('aria-label')||'').slice(0,120),href:e.getAttribute('href'),outline:s.outline,boxShadow:s.boxShadow,x:r.x,y:r.y,width:r.width,height:r.height};}));}
 await save('calendar-keyboard-tab-sequence.json',tabSequence);
 if(target){
  const a=page.locator('a[href]').filter({visible:true});
  const exact=page.locator('a[href="'+target.href.replaceAll('"','\\"')+'"]:visible').first();
  await exact.focus();const before=await page.evaluate(()=>({tag:document.activeElement.tagName,href:document.activeElement.href}));
  await Promise.all([page.waitForURL(u=>u.pathname.includes('/charters/guided-shore-dives'),{timeout:25000}),page.keyboard.press('Enter')]).catch(async()=>{await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});});
  await page.waitForTimeout(3500);
  report.booking={url:page.url(),keyboardFocusedLink:before,body:await page.locator('body').innerText(),controls:await controls(page),widthChecks:await captureWidths(page,'booking')};
  await save('booking-rendered.html',await page.content());
  await save('booking-controls.json',report.booking.controls);
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:out+'/booking-390-full.png',fullPage:true});
 }else report.booking={status:'BLOCKED',reason:'Exact Oak Park 11 October event was not visibly available on the calendar; no substitute selected.'};
 // JavaScript-disabled static fallback. Do not claim a JS calendar operates here.
 const nc=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900},locale:'en-AU'});
 const np=await nc.newPage();await np.goto(home,{waitUntil:'domcontentloaded',timeout:45000});
 report.noJavaScript={dimensions:await dimensions(np),body:(await np.locator('body').innerText()).slice(0,18000),screenshot:'calendar-no-javascript.png'};
 await np.screenshot({path:out+'/calendar-no-javascript.png',fullPage:true});await nc.close();
 // Block only Help Scout; calendar and booking links should remain usable.
 const bc=await browser.newContext({viewport:{width:390,height:900},timezoneId:'Australia/Sydney'});
 let blocked=0;await bc.route(/helpscout|beacon-v2|beaconapi/i,r=>{blocked++;return r.abort();});
 const bp=await bc.newPage();await bp.goto(home,{waitUntil:'domcontentloaded',timeout:45000});
 await bp.waitForFunction(()=>document.body.innerText.includes('Oak Park'),{timeout:30000}).catch(()=>{});await bp.waitForTimeout(1000);
 report.beaconBlocked={requestsBlocked:blocked,bodyContainsOakPark:(await bp.locator('body').innerText()).includes('Oak Park'),dimensions:await dimensions(bp),eventLinkCount:await bp.locator('a[href*="?q="]:visible').count(),screenshot:'calendar-beacon-blocked.png'};
 await bp.screenshot({path:out+'/calendar-beacon-blocked.png'});await bc.close();
 // Read current published prices and benefit wording; no membership login or checkout.
 for(const [name,url] of [['rental','https://www.abyss.com.au/charters/scuba-gear-rental'],['club','https://www.abyss.com.au/dive-club']]){await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1200);await save(name+'-visible.txt',await page.locator('body').innerText());}
}catch(e){report.fatalError=String(e.stack||e);process.exitCode=1;}
finally{await save('audit.json',report);await browser.close();console.log(JSON.stringify({checkedAt:report.checkedAt,pages:report.pages.map(x=>({name:x.name,status:x.status,eventLinks:x.visibleEventLinks,widths:x.widthChecks.map(w=>({width:w.innerWidth,overflow:w.horizontalOverflow}))})),booking:!!report.booking,noJavaScript:!!report.noJavaScript,beaconBlocked:!!report.beaconBlocked,error:report.fatalError||null}));}
