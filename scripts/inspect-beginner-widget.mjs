#!/usr/bin/env node
/** Read-only inspection of the ONE public source page. No Help Scout secrets. */
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const SOURCE = 'https://www.abyss.com.au/beginner-diver-widget';
const report = {source:SOURCE, startedAt:new Date().toISOString(), mode:'public-source-read-only', widgets:[], observedRequests:[], errors:[]};
const browser = await chromium.launch({headless:true});
await fs.mkdir('diagnostics/beginner-widget', {recursive:true});
try {
  const context = await browser.newContext({locale:'en-AU', timezoneId:'Australia/Sydney', viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(SOURCE).origin || !['xhr','fetch'].includes(request.resourceType())) return;
    const params = new URLSearchParams(request.postData() || '');
    report.observedRequests.push({path:url.pathname, method:request.method(), queryKeys:[...url.searchParams.keys()], formKeys:[...params.keys()]});
  });
  const response = await page.goto(SOURCE, {waitUntil:'domcontentloaded',timeout:90000});
  if (!response?.ok()) throw new Error(`Source HTTP ${response?.status()}`);
  await page.locator('tr.main-row').first().waitFor({state:'attached',timeout:90000});
  await page.waitForTimeout(5000);
  const widgets = await page.locator('[id^="widget"]').evaluateAll(elements => elements
    .filter(e => /^widget\d+$/.test(e.id) && e.querySelector('tr.main-row'))
    .map(e => ({id:e.id,tableIds:[...e.querySelectorAll('table')].map(t=>t.id),headers:[...e.querySelectorAll('thead th')].map(t=>t.textContent.trim())})));
  if (!widgets.length) throw new Error('No verified numeric widget root found; parser configuration is unresolved');
  async function snapshot(root) {
    return root.evaluate(e => ({
      selectedPerPage:e.querySelector('select.per_page')?.value || null,
      activePage:e.querySelector('.pagination .active')?.textContent.trim() || null,
      headers:[...e.querySelectorAll('thead th')].map(x=>x.textContent.trim()),
      rows:[...e.querySelectorAll('tr.main-row')].map(row=>({
        cells:[...row.querySelectorAll(':scope > td')].map(td=>td.textContent.replace(/\s+/g,' ').trim()),
        links:[...row.querySelectorAll('a[href]')].map(a=>({text:a.textContent.trim(),url:a.href})),
        detail:row.nextElementSibling?.classList.contains('expand-row') ? [...row.nextElementSibling.querySelectorAll('p')].map(p=>p.textContent.replace(/\s+/g,' ').trim()) : [],
      })),
      pagination:[...e.querySelectorAll('.pagination .page-link')].map(a=>({text:a.textContent.trim(),page:a.getAttribute('data-page'),href:a.getAttribute('href'),disabled:a.closest('.disabled')!==null,active:a.closest('.active')!==null})),
      pageSizeOptions:[...e.querySelectorAll('select.per_page option')].map(o=>({value:o.value,text:o.textContent.trim()})),
      footerText:[...e.querySelectorAll('.dataTables_info, .pagination-info, .pagination-summary')].map(x=>x.textContent.trim())
    }));
  }
  const signature = data => JSON.stringify(data.rows.map(r=>r.links.find(l=>l.url.includes('?q='))?.url || r.cells));
  for (const widget of widgets) {
    const root = page.locator(`#${widget.id}`);
    const item = {...widget,pages:[],complete:false};
    report.widgets.push(item);
    try {
      // Verified live issue: the 50-row charter view repeats rows on page 2.
      // Change the public widget's own control to 20 and verify the result.
      if (widget.headers.includes('Charter')) {
        const perPage = root.locator('select.per_page').first();
        if (await perPage.count() && await perPage.inputValue() !== '20') {
          item.originalPerPage = await perPage.inputValue();
          await perPage.selectOption('20');
          await page.waitForFunction(id => {
            const element = document.getElementById(id);
            const rows = element?.querySelectorAll('tr.main-row').length || 0;
            return element?.querySelector('select.per_page')?.value === '20' && rows > 0 && rows <= 20;
          }, widget.id, {timeout:45000});
          await page.waitForTimeout(1500);
        }
      }
      const initial = await snapshot(root);
      item.pages.push(initial);
      const isCourse = /course/i.test(widget.tableIds.join(' ')+' '+widget.headers.join(' '));
      if (isCourse) {item.excludedFromBeginnerSnapshot='Courses use the existing maintained course feed';continue;}
      let last = initial;
      for(let number=2; number<=20; number++) {
        const link = root.locator(`.pagination .page-link[data-page="${number}"]`).first();
        if (!await link.count()) {
          const later=last.pagination.some(p=>!p.disabled && [p.page,p.text].some(v=>/^\d+$/.test(v || '') && Number(v)>=number));
          if(later)throw new Error(`Missing page ${number} despite a later page`);
          item.complete=true;break;
        }
        if (await link.evaluate(e=>e.closest('.disabled')!==null)) {item.complete=true;break;}
        const before=signature(last);
        await link.evaluate(e=>e.click());
        let changed=false;
        const start=Date.now();
        while(Date.now()-start<30000) {
          await page.waitForTimeout(500);
          const current=await snapshot(root);
          if(current.rows.length && signature(current)!==before) {
            await page.waitForTimeout(1000);
            const settled=await snapshot(root);
            if(signature(settled)===signature(current)) {last=settled;changed=true;break;}
          }
        }
        if(!changed)throw new Error(`Page ${number} did not produce a new stable row set; completeness unverified`);
        const previousIds=new Set(item.pages.flatMap(p=>p.rows.map(r=>r.links.find(l=>l.url.includes('?q='))?.url).filter(Boolean)));
        const newIds=last.rows.map(r=>r.links.find(l=>l.url.includes('?q='))?.url).filter(Boolean);
        if(newIds.some(id=>previousIds.has(id)))throw new Error(`Page ${number} overlaps a previous page; pagination not accepted`);
        item.pages.push(last);
        if(number===20)throw new Error('Safety page cap reached; completeness unverified');
      }
      item.rowCount=item.pages.reduce((n,p)=>n+p.rows.length,0);
    } catch(error) {item.error=error.message;report.errors.push({widget:widget.id,message:error.message});}
  }
  report.pageTitle=await page.title();
  report.finishedAt=new Date().toISOString();
  await context.close();
} catch(error) {report.errors.push({area:'source',message:error.message});}
finally {
  await browser.close();
  report.finishedAt ||= new Date().toISOString();
  await fs.writeFile('diagnostics/beginner-widget/inspection.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode:report.mode,widgets:report.widgets.map(w=>({id:w.id,pages:w.pages.length,rows:w.rowCount ?? null,complete:w.complete,courseExcluded:!!w.excludedFromBeginnerSnapshot})),errors:report.errors}));
}
if(report.errors.length)process.exitCode=1;
