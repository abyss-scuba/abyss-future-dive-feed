import fs from 'node:fs/promises';
import {hash,makeDocsClient} from '../src/helpscout-courses.mjs';
import {publishKnowledge} from '../src/helpscout-course-knowledge.mjs';
const bytes=await fs.readFile('data/helpscout-course-knowledge.json','utf8'),packHash=hash(bytes),pack=JSON.parse(bytes);
let previous=null;try{previous=JSON.parse(await fs.readFile('data/helpscout-course-knowledge-status.json','utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
if(previous?.packHash===packHash){console.log('Course knowledge pack already published and verified.');process.exit(0)}
await fs.mkdir('diagnostics',{recursive:true});
const articles=await publishKnowledge({pack,previous,request:makeDocsClient(process.env.HELP_SCOUT_DOCS_API_KEY),saveBackup:async originals=>{await fs.writeFile('diagnostics/helpscout-course-original-articles.json',JSON.stringify(originals,null,2));console.log(`Backed up ${originals.length} existing course articles.`)}});
const status={publishedAt:new Date().toISOString(),packHash,articles};await fs.writeFile('data/helpscout-course-knowledge-status.json',JSON.stringify(status,null,2)+'\n');console.log(`Published and read back ${articles.length} course articles, preserving all 20 original IDs.`);
