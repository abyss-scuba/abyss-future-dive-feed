import test from 'node:test';
import assert from 'node:assert/strict';
import {DateTime} from 'luxon';
import {PIPELINES,checkDates,expiryTimes,inspectArticle,evaluatePipeline} from '../src/helpscout-daily-health.mjs';
const now=DateTime.fromISO('2026-10-05T12:00:00',{zone:'Australia/Sydney'});
const url=id=>'https://www.abyss.com.au/courses/advanced-open-water?q='+Buffer.from('part_number=Course 10/10/2026&date=&open_cart_id='+id).toString('base64');
const markup=ids=>'<p>Last successful check: 2026-10-05T02:30:00+11:00. Current scheduled courses, places must be confirmed when booking.</p>'+ids.map(id=>'<a href="'+url(id)+'">Course departure</a>').join('');
const production={head_branch:'main',event:'schedule',status:'completed',conclusion:'success'};
test('full course count is the union across the grouped articles, not the overview shortlist',()=>{
 const config={...PIPELINES.find(x=>x.key==='courses'),articles:PIPELINES.find(x=>x.key==='courses').articles.slice(0,2)};
 const articles=config.articles.map((s,i)=>({id:s.id,name:s.name,collectionId:s.collectionId,status:'published',hasDraft:false,text:markup(i===0?[1]:[1,2])}));
 const args={status:{lastSuccessfulCheck:'2026-10-05T02:30:00+11:00',publication:{status:'published-and-verified',count:2}},articles,workflow:{state:'active'},runs:[production],now};
 assert.equal(evaluatePipeline(config,args).state,'PASS');
 assert.equal(evaluatePipeline(config,args).publishedUniqueEventLinks,2);
 articles[1].text=markup([1]);
 assert.equal(evaluatePipeline(config,args).state,'FAIL');
});
test('first-dive recommendation timestamp and plain Expires are recognised without inventing dates',()=>{
 const text='Dated recommendations checked: 2026-10-04T20:38:45.251Z. Expires: 2026-10-06T08:38:45.251Z.';
 assert.deepEqual(checkDates(text),['2026-10-05']);
 assert.equal(expiryTimes(text)[0],Date.parse('2026-10-06T08:38:45.251Z'));
 const spec=PIPELINES.find(x=>x.key==='beginner').articles[1];
 const raw={id:spec.id,name:spec.name,collectionId:spec.collectionId,status:'published',hasDraft:false,text:'<p>'+text+'</p>'};
 assert.deepEqual(inspectArticle(raw,spec,{now}).errors,[]);
 assert.ok(inspectArticle(raw,spec,{now:now.plus({days:2})}).errors.includes('published-date-section-expired'));
});
test('legitimate new same-day publication is not mistaken for an unexplained article edit',()=>{
 const base=PIPELINES.find(x=>x.key==='courses');const config={...base,articles:base.articles.slice(0,1)};
 const s=config.articles[0],raw={id:s.id,name:s.name,collectionId:s.collectionId,status:'published',hasDraft:false,text:markup([1])};
 const args={status:{lastSuccessfulCheck:'2026-10-05T02:30:00+11:00',publication:{status:'published-and-verified',count:1}},articles:[raw],workflow:{state:'active'},runs:[production],now};
 const previous=evaluatePipeline(config,args);
 raw.text=markup([1]).replace('Current scheduled courses','Newly checked scheduled courses');
 assert.equal(evaluatePipeline(config,{...args,previous}).state,'WARN');
 args.status.lastSuccessfulCheck='2026-10-05T04:07:00+11:00';
 assert.equal(evaluatePipeline(config,{...args,previous}).state,'PASS');
});
