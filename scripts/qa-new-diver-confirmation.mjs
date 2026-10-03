import {chromium} from 'playwright';import fs from 'node:fs/promises';
const out='diagnostics/new-diver-confirmation';await fs.mkdir(out,{recursive:true});
const r={checkedAt:new Date().toISOString(),scope:'No messages, bookings, carts or public changes; temporary browser-only Beacon rendering',booking:{},preview:[]};
const b=await chromium.launch();const c=await b.newContext({viewport:{width:390,height:900},timezoneId:'Australia/Sydney'});const p=await c.newPage();p.setDefaultTimeout(12000);
await c.route(/\/checkout(?:[/?]|$)|\/addtocart|\/add-to-cart/i,x=>x.abort());
p.on('pageerror',e=>(r.errors??=[]).push(e.message));
try{
 await p.goto('https://www.abyss.com.au/charters/guided-shore-dives?q=cGFydF9udW1iZXI9T2FrIFBhcmsgRGl2ZSAxMS8xMC8yMDI2JmRhdGU9Jm9wZW5fY2FydF9pZD02NjQxMjQ5Nw==',{waitUntil:'domcontentloaded',timeout:45000});await p.waitForTimeout(2500);
 await p.locator('#option_userCount_1').selectOption({label:'Guided Shore Dive'});
 await p.locator('#option_1').selectOption({label:'Tank (adjust quantity if more than one)'});await p.locator('#qty_1').fill('2');await p.locator('#qty_1').press('Tab');await p.waitForTimeout(2500);
 r.booking.twoTanks={body:(await p.locator('body').innerText()).slice(-10000),totalText:await p.getByText('Booking total',{exact:true}).locator('..').innerText()};
 await p.getByText('Booking total',{exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:out+'/two-tanks-displayed-total.png'});
 const items=[['Mask, Snorkel Rental',1],['Fins & Boots',1],['Wetsuit',1],['BCD',1],['Weights',1],['Regulator (with Computer)',1]];
 for(const [label,qty] of items){await p.getByRole('button',{name:'MORE ADD-ONS',exact:true}).click();const el=p.locator('select.addAddonSelect:visible').last();await el.selectOption({label});const id=await el.getAttribute('id');await p.locator('#qty_'+id.replace('option_','')).fill(String(qty));await p.locator('#qty_'+id.replace('option_','')).press('Tab');}
 await p.waitForTimeout(3000);r.booking.fullHire={body:(await p.locator('body').innerText()).slice(-15000),totalText:await p.getByText('Booking total',{exact:true}).locator('..').innerText()};
 await p.getByText('Booking total',{exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:out+'/full-hire-displayed-total.png'});
 r.booking.personalFieldsBlank=await p.locator('#dftFname,#dftLname,#dftEmail,#dftDob').evaluateAll(es=>es.every(e=>!e.value));
 await p.goto('https://www.abyss.com.au/beginner-dive-calendar',{waitUntil:'domcontentloaded',timeout:45000});await p.waitForTimeout(2500);
 r.originalBeaconFrames=await p.locator('iframe[title*="Help Scout"]').count();if(r.originalBeaconFrames!==0)throw Error('Existing Beacon detected; will not inject second instance');
 await p.evaluate(()=>{window.Beacon=function(method,options,data){window.Beacon.readyQueue.push({method,options,data});};window.Beacon.readyQueue=[];});await p.addScriptTag({url:'https://beacon-v2.helpscout.net'});await p.evaluate(()=>Beacon('init','7365600e-79f7-4760-a3b1-0ae3b14c2276'));await p.waitForTimeout(2500);
 for(const width of [390,767,768,1024,1440]){
  await p.setViewportSize({width,height:900});await p.evaluate(()=>{Beacon('close');scrollTo(0,0);});await p.waitForTimeout(350);await p.screenshot({path:out+'/prospective-closed-'+width+'.png'});
  await p.evaluate(()=>{Beacon('open');Beacon('navigate','/ask/message/');});await p.waitForTimeout(350);await p.screenshot({path:out+'/prospective-contact-'+width+'.png'});
  r.preview.push(await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,frames:[...document.querySelectorAll('iframe[title*="Help Scout"]')].map(e=>{const q=e.getBoundingClientRect();return{title:e.title,x:q.x,y:q.y,width:q.width,height:q.height};})})));
 }
 // Check focus through the actual contact frame using keyboard only; no submission.
 await p.setViewportSize({width:390,height:900});const f=p.frames().find(f=>f!==p.mainFrame()&&f.locator('input[name="name"]').count());
 const contactFrames=[];for(const frame of p.frames()){if(await frame.locator('input[name="name"]').count())contactFrames.push(frame);}
 if(contactFrames.length===1){const frame=contactFrames[0];await frame.locator('input[name="name"]').focus();r.keyboard=[];for(let i=0;i<9;i++){r.keyboard.push(await frame.evaluate(()=>({tag:document.activeElement.tagName,name:document.activeElement.name,id:document.activeElement.id,text:document.activeElement.innerText?.slice(0,80)})));await p.keyboard.press('Tab');}}
 await p.keyboard.press('Escape');await p.screenshot({path:out+'/after-escape.png'});r.escapeFrames=await p.locator('iframe[title*="Help Scout"]').evaluateAll(es=>es.map(e=>({title:e.title,rect:{width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}})));
 await p.evaluate(()=>Beacon('destroy'));r.destroyed=await p.locator('iframe[title*="Help Scout"]').count()===0;
}catch(e){r.error=String(e.stack||e);process.exitCode=1;}finally{await fs.writeFile(out+'/confirmation.json',JSON.stringify(r,null,2));await c.close();await b.close();console.log(JSON.stringify({checkedAt:r.checkedAt,error:r.error||null,previewWidths:r.preview.length,submitted:false}));}
