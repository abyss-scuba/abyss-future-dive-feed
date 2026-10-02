/** Fixed-article read-only verification; no private article text is logged or exported. */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const SITE='5d0ed4d02c7d3a6ebd2268ed';
const COLLECTION='6abf61e6c3e570044c2891ed';
const ARTICLE='6abf733d3be702ed269e3fa6';
const TITLE='Your first guided dive after certification: what happens and who helps';
const expectedHeadings=[
 'Can I join after my four Open Water training dives?',
 'What happens before we get in?',
 'Will a Divemaster guide me underwater?',
 'Can I come without a buddy?',
 'How big is the group, and how long will we be out?',
 'What if I need more than group guidance?'
];
const normalise=s=>String(s).replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
export function inspectBody(text){
 if(typeof text!=='string')throw new Error('Invalid article body type');
 const plain=normalise(text);
 const markers={filterCode:/tag:abc/.test(plain),filterInstructions:/separate multiple filters with a space/i.test(plain),searchReference:/search reference article for more tips/i.test(plain)};
 const tables=[...text.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
 const urls=['https://www.abyss.com.au/charters/guided-shore-dives','https://www.abyss.com.au/charters/private-guided-shore-dive','https://www.abyss.com.au/scuba-refresher-course','https://www.abyss.com.au/contact-us'];
 return {wordCount:plain?plain.split(' ').length:0,expectedHeadingCount:expectedHeadings.length,expectedHeadingsFound:expectedHeadings.filter(h=>plain.includes(h)).length,uiChromeMarkers:markers,uiChromeDetected:Object.values(markers).some(Boolean),tableCount:tables.length,emptyTableCount:tables.filter(m=>normalise(m[1])==='').length,approvedUrlsPresent:urls.filter(u=>text.includes(u)).length,approvedUrlsAsAnchors:urls.filter(u=>text.includes('href="'+u+'"')||text.includes("href='"+u+"'")).length};
}
export async function verifyBody(request){
 const c=(await request('GET',`/collections/${COLLECTION}`)).collection;
 if(c?.id!==COLLECTION||c.siteId!==SITE||c.name!=='New Diver Support'||c.visibility!=='private')throw new Error('Private collection identity mismatch');
 const a=(await request('GET',`/articles/${ARTICLE}`)).article;
 if(a?.id!==ARTICLE||a.collectionId!==COLLECTION||a.name!==TITLE)throw new Error('Article identity mismatch');
 return {checkedAt:new Date().toISOString(),type:'PUBLISHED_BODY_STRUCTURAL_CHECK_NOT_AI_QA',articleId:ARTICLE,title:TITLE,status:a.status,hasDraft:!!a.hasDraft,keywordCount:Array.isArray(a.keywords)?a.keywords.length:null,...inspectBody(a.text)};
}
async function main(){
 const {makeClient}=await import('../src/helpscout-beginner-publish.mjs');
 const report=await verifyBody(makeClient(process.env.HELP_SCOUT_DOCS_API_KEY));
 await fs.mkdir('diagnostics/beginner-body',{recursive:true});
 await fs.writeFile('diagnostics/beginner-body/status.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 if(report.status!=='published'||report.hasDraft||report.expectedHeadingsFound!==6||report.uiChromeDetected||report.emptyTableCount)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Fixed article body verification stopped; no private text logged.');process.exitCode=1;});
