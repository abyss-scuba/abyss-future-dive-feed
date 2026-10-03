// Non-transactional controls audit. No customer data, authentication or message submissions.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='diagnostics/new-diver-controls';await fs.mkdir(out,{recursive:true});
const save=(n,x)=>fs.writeFile(out+'/'+n,typeof x==='string'?x:JSON.stringify(x,null,2));
const eventUrl='https://www.abyss.com.au/charters/guided-shore-dives?q=cGFydF9udW1iZXI9T2FrIFBhcmsgRGl2ZSAxMS8xMC8yMDI2JmRhdGU9Jm9wZW5fY2FydF9pZD02NjQxMjQ5Nw==';
const beaconId='7365600e-79f7-4760-a3b1-0ae3b14c2276';
const r={checkedAt:new Date().toISOString(),scenarios:[],beaconPreview:{scope:'Transient test-browser injection only; not public website installation'},messageSubmitted:false,cartCreated:false,bookingSubmitted:false};
const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:1000},timezoneId:'Australia/Sydney',locale:'en-AU'});const p=await c.newPage();p.setDefaultTimeout(15000);
await c.route(/\/checkout(?:[/?]|$)|\/addtocart|\/add-to-cart/i,x=>x.abort());
const describe=async()=>p.evaluate(()=>({body:document.body.innerText,selected:[...document.querySelectorAll('select.addAddonSelect')].map(e=>({id:e.id,value:e.value,label:e.selectedOptions[0]?.textContent.trim(),price:e.selectedOptions[0]?.dataset.price,qty:document.querySelector('#qty_'+e.id.replace('option_',''))?.value})),cartLink:[...document.querySelectorAll('a')].filter(a=>/item\(s\)/.test(a.innerText)).map(a=>a.innerText)}));
try{
 for(const [name,items] of [['full-hire',[[/Mask, Snorkel/,1],[/Fins.*Boots/,1],[/^Tank/,2],[/^Wetsuit$/,1],[/^BCD$/,1],[/^Weights$/,1],[/^Regulator/,1]]],['core-plus-two-tanks',[[/^Tank/,2],[/^BCD$/,1],[/^Weights$/,1],[/^Regulator/,1]]]]){
  await p.goto(eventUrl,{waitUntil:'domcontentloaded',timeout:45000});await p.waitForTimeout(1800);
  // All selections remain in the unsubmitted booking form. Personal details stay blank.
  for(let i=0;i<items.length;i++){
   if(i){await p.getByRole('button',{name:'MORE ADD-ONS',exact:true}).click();await p.waitForTimeout(150);}
   const select=p.locator('select.addAddonSelect:visible').last();const options=await select.locator('option').evaluateAll(es=>es.map(e=>({value:e.value,label:e.textContent.trim(),price:e.dataset.price})));
   const chosen=options.find(o=>items[i][0].test(o.label));if(!chosen)throw Error('Expected gear option missing in '+name);
   await select.selectOption(chosen.value);const id=await select.getAttribute('id');
   const q=p.locator('#qty_'+id.replace('option_',''));await q.fill(String(items[i][1]));await q.dispatchEvent('change');await q.blur();await p.waitForTimeout(300);
  }
  const state=await describe();const calculated=state.selected.reduce((s,x)=>s+Number(x.price)*Number(x.qty),0);
  const row={name,selected:state.selected,calculatedFromOptionPrices:calculated,expectedMemberHireOnly:Number((calculated*0.8).toFixed(2)),memberApplication:'NOT TESTED: no member login or checkout; calculated expectation only',cartLink:state.cartLink,visibleBookingText:state.body.slice(state.body.indexOf('Complete your booking')),screenshots:[]};
  for(const width of [390,767,768,1024,1440]){await p.setViewportSize({width,height:900});await p.locator('#option_userCount_1').scrollIntoViewIfNeeded();await p.waitForTimeout(200);const file=name+'-'+width+'.png';await p.screenshot({path:out+'/'+file});row.screenshots.push({width,file});}
  r.scenarios.push(row);
 }
 // Load a local fixture: no public page edits, no AI question, no identify call.
 await p.goto('about:blank');await p.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Private browser-only New Diver Beacon contact check</h1><p>No AI question or message is sent by this audit.</p><button id="underlying">Underlying booking control</button></body></html>');
 await p.evaluate(()=>{window.Beacon=function(method,options,data){window.Beacon.readyQueue.push({method,options,data});};window.Beacon.readyQueue=[];});
 await p.addScriptTag({url:'https://beacon-v2.helpscout.net'});
 await p.evaluate(id=>{Beacon('init',id);Beacon('open');Beacon('navigate','/ask/message/');},beaconId);await p.waitForTimeout(4500);
 r.beaconPreview.frames=[];
 for(const f of p.frames()){const text=await f.locator('body').innerText().catch(()=>'');r.beaconPreview.frames.push({name:f.name(),url:f.url(),text:text.slice(0,12000),inputs:await f.locator('input,textarea,button').evaluateAll(es=>es.map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,placeholder:e.placeholder,text:e.innerText?.slice(0,160),visible:!!(e.getBoundingClientRect().width&&e.getBoundingClientRect().height)}))).catch(()=>[])});}
 r.beaconPreview.widths=[];
 for(const width of [390,767,768,1024,1440]){await p.setViewportSize({width,height:900});await p.waitForTimeout(250);const file='beacon-contact-'+width+'.png';await p.screenshot({path:out+'/'+file});r.beaconPreview.widths.push({width,file,frames:await p.locator('iframe').evaluateAll(es=>es.map(e=>{const q=e.getBoundingClientRect();return {name:e.name,title:e.title,x:q.x,y:q.y,width:q.width,height:q.height};}))});}
 await p.evaluate(()=>Beacon('navigate','/ask/'));await p.waitForTimeout(700);r.beaconPreview.askRoute=[];for(const f of p.frames())r.beaconPreview.askRoute.push({name:f.name(),text:(await f.locator('body').innerText().catch(()=>'')).slice(0,5000)});await p.screenshot({path:out+'/beacon-ask-options.png'});
 await p.evaluate(()=>Beacon('close'));await p.waitForTimeout(300);await p.screenshot({path:out+'/beacon-closed.png'});
}catch(e){r.error=String(e.stack||e);process.exitCode=1;}
finally{await c.close();await b.close();}
// Read exact workflow run history through the normal GitHub token; no tokens logged.
if(process.env.GITHUB_TOKEN){try{const u='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/actions/workflows/sync-helpscout-beginner.yml/runs?event=schedule&per_page=20';const res=await fetch(u,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});if(!res.ok)throw Error('Workflow history status '+res.status);const x=await res.json();r.scheduledRuns=x.workflow_runs.map(y=>({id:y.id,event:y.event,status:y.status,conclusion:y.conclusion,created_at:y.created_at,run_started_at:y.run_started_at,updated_at:y.updated_at,html_url:y.html_url,head_sha:y.head_sha}));}catch(e){r.schedulerError=e.message;}}
await save('controls-audit.json',r);console.log(JSON.stringify({scenarios:r.scenarios.map(x=>({name:x.name,calculated:x.calculatedFromOptionPrices})),beaconFrames:r.beaconPreview.frames?.length,scheduledRuns:r.scheduledRuns?.length,error:r.error||r.schedulerError||null}));
