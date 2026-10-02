import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const ensure=(ok,msg)=>{if(!ok)throw new Error(msg)};
const MARK='<!-- new-diver-suggested-questions-27449-v1 -->';
const END='<!-- /new-diver-suggested-questions-27449-v1 -->';
const DRAFT_HASH='99a0619e2f24cfc2cddf0f6e4babc2522ff286b40889821ba02304f705e4dbc9';
export const TARGETS=[
 {id:'6abf733d3be702ed269e3fa6',collectionId:'6abf61e6c3e570044c2891ed',name:'Your first guided dive after certification: what happens and who helps',expected:'a67799dd4fa03a6de0effadcf28fb41824961f1c1fc0abadd8af44e9e89163da',knownDraft:true,prefix:`<h2>Which dive should I book first?</h2>
<p>For your first recreational dive after qualifying, an appropriate guided shore outing is a welcoming way to enjoy Sydney's marine life, use your new skills and meet local divers. Oak Park's shallower reef or a suitable Bare Island route are practical starting choices when conditions and your experience suit. You do not need to buy a complete equipment kit or bring your own buddy to join.</p>
<p>The next scheduled dates, start times and individual booking links are in <a href="https://abyss.helpscoutdocs.com/article/426-upcoming-beginner-dive-dates-shore-boat-trips">Upcoming beginner dive dates — shore, boat and trips</a>. That maintained schedule supplies the actual upcoming date for each recommendation; this article deliberately contains no fixed example dates. The event, entry and planned route must fit your certification, recent experience and confidence. The team confirms final suitability and the site according to conditions.</p>
<h2>Can I join without a buddy?</h2>
<p>Yes — you're welcome to book a suitable guided shore dive on your own. The Divemaster helps arrange suitable buddy teams, explains the site and dive plan, and leads the scheduled group underwater. Tell the team you're newly certified so they can help match the outing to your experience. It's a good way to meet local divers you could dive with again. Which day would you like to join?</p>
<p>These are regular guided-shore arrangements, not a promise of private one-to-one tuition or a particular staff buddy. Arriving without a buddy does not itself require private guiding. Boat departures have their own in-water guidance arrangements; use the selected boat event's details rather than transferring a boat-only limitation to guided shore diving.</p>
<p><a href="https://www.abyss.com.au/guided-shore-dives-sydney">Guided shore diving and what's included</a>.</p>`},
 {id:'6abf7841c3e570044c28921f',collectionId:'6abf61e6c3e570044c2891ed',name:'Nervous about your next dive? Support, pace and extra help',expected:'e4e5df8a347b29a26c43bca2034d91c6cb55d6309b1531f08fa7d7159759ce3d',prefix:`<h2>I'm nervous — what support will I have?</h2>
<p>You're welcome to tell us you're nervous. On a suitable guided shore outing, the Divemaster explains the conditions, entry and exit, and dive plan; helps arrange buddy teams; and leads the group underwater. Let the team know it's your first post-course dive so they can help match the outing and support to your experience. There's no pressure to dive when you're unready. What part of the dive worries you most?</p>
<p>This is guided group diving, not continuous one-to-one instruction. Ordinary new-diver nerves do not automatically mean you need another course or a private guide. Forgotten essential skills, difficulty managing your equipment or a significant support need should be discussed with the team or an instructor before a normal group booking. Boat guidance is confirmed for the actual departure.</p>
<p><a href="https://www.abyss.com.au/guided-shore-dives-sydney">What guided shore diving includes</a>.</p>`},
 {id:'6abf76557cdaed3f1efa5fa0',collectionId:'6ab98d4249f1bc2c6aefca54',name:'Scuba equipment hire and the total cost of your dive',expected:'a32ae7a61cefdf6f83d911d1e00a97eed8d97e61fba3fa1f12967d422c22ea07',prefix:`<h2>What will my dive cost with equipment hire?</h2>
<p>For a regular two-dive guided shore outing, a useful example is <strong>A$183 for all the hire items below, including two tanks</strong>; regular group guiding is A$0. The online day-hire breakdown is: regulator, BCD, dive computer and weights A$72.50; wetsuit A$27.50; mask, snorkel, fins and boots A$33; and two tanks at A$25 each, A$50. You can keep renting while you build experience — buying a complete kit is not required. Do you need everything, or already own some gear?</p>
<p><strong>Example checked 3 October 2026.</strong> This is the sum of the listed online hire components, not an unconditional quote for every outing. Online rates require online booking and payment. Confirm the selected dive's equipment and tank quantities, any special-event fee, and the checkout total. Boat or private-guide fees are not included. The A$72.50 core package alone does not include a wetsuit, personal snorkelling gear or tanks. Current rates are maintained on the <a href="https://www.abyss.com.au/charters/scuba-gear-rental">Scuba Gear Rental page</a>; use updated published rates if they change.</p>`}
];
export function buildText(original,prefix){
 ensure(typeof original==='string'&&original.length>100,'Missing original body');
 ensure(!original.includes(MARK),'Patch already present; inspect rather than duplicate');
 const rest=original.replace(/<p>([^<>]{1,180}\?)<\/p>/g,'<h2>$1</h2>');
 return MARK+'\n'+prefix+'\n'+END+'\n'+rest;
}
export function validateArticle(a,t,draft=null){
 ensure(a?.id===t.id&&a.collectionId===t.collectionId&&a.name===t.name&&a.status==='published','Article identity/publication mismatch');
 ensure(typeof a.text==='string'&&sha(a.text)===t.expected,'Published body changed; no overwrite');
 if(a.hasDraft){ensure(t.knownDraft&&draft?.id===a.id&&sha(draft.text)===DRAFT_HASH,'Unreviewed draft; no overwrite');}
}
const stable=a=>({id:a.id,collectionId:a.collectionId,name:a.name,slug:a.slug,status:a.status,keywords:a.keywords,categories:a.categories,related:a.related,public:a.public});
async function main(){
 const report={startedAt:new Date().toISOString(),mode:'fixed-three-article-owner-authorized-repair',results:[]};
 const request=async(method,resource,body)=>{
  const key=process.env.HELP_SCOUT_DOCS_API_KEY;ensure(key,'Credential unavailable');
  const r=await fetch('https://docsapi.helpscout.net/v1'+resource,{method,redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:'Basic '+Buffer.from(key+':X').toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  ensure(r.ok,'Fixed Docs request failed with status '+r.status);return method==='GET'?r.json():null;
 };
 try{
  for(const cid of new Set(TARGETS.map(t=>t.collectionId))){const c=(await request('GET','/collections/'+cid)).collection;ensure(c?.id===cid&&c.siteId==='5d0ed4d02c7d3a6ebd2268ed'&&c.visibility==='private','Collection identity/privacy mismatch');}
  const preflight=[];
  for(const t of TARGETS){const a=(await request('GET','/articles/'+t.id)).article;const d=a.hasDraft?(await request('GET','/articles/'+t.id+'?draft=true')).article:null;validateArticle(a,t,d);preflight.push({t,a,d,text:buildText(a.text,t.prefix)});}
  // Exact published bodies and the known corrupt draft were encrypted,
  // downloaded and backed up before this write; hashes must still match.
  for(const {t,a,d,text} of preflight){
   const again=(await request('GET','/articles/'+t.id)).article;
   const draftAgain=again.hasDraft?(await request('GET','/articles/'+t.id+'?draft=true')).article:null;
   validateArticle(again,t,draftAgain);
   ensure(JSON.stringify(stable(again))===JSON.stringify(stable(a))&&again.hasDraft===a.hasDraft,'Concurrent metadata/draft change; no overwrite');
   await request('PUT','/articles/'+t.id,{text});
   const after=(await request('GET','/articles/'+t.id)).article;
   ensure(after.text===text&&JSON.stringify(stable(after))===JSON.stringify(stable(a))&&!after.hasDraft,'Readback or metadata mismatch');
   report.results.push({id:t.id,title:t.name,action:'published-and-readback-verified',beforeSha256:sha(a.text),afterSha256:sha(after.text),originalTextPreserved:true,questionsPromotedToHeadings:true,knownCorruptDraftRemoved:!!d,keywordsUnchanged:true,publicationAndPrivacyUnchanged:true,publicUrl:after.publicUrl});
  }
  report.status='all-three-published-and-verified';
 }catch(e){report.status='stopped';report.error=e.message;process.exitCode=1;}
 finally{report.completedAt=new Date().toISOString();await fs.mkdir('qa-repair-status',{recursive:true});await fs.writeFile('qa-repair-status/status.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
