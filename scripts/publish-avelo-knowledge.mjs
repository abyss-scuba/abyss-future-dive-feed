import fs from 'node:fs/promises';
import {resolvePack,publishKnowledge,makeDocsClient,hash} from '../src/helpscout-avelo.mjs';
const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
const pack=await read('data/helpscout-avelo-knowledge.json'),shared=await read('data/helpscout-course-knowledge.json'),articles=resolvePack(pack,shared),packHash=hash(JSON.stringify(articles)),previous=await read('data/helpscout-avelo-knowledge-status.json');
await fs.mkdir('diagnostics',{recursive:true});
const result=await publishKnowledge({request:makeDocsClient(process.env.HELP_SCOUT_DOCS_API_KEY),articles,previous,saveBackup:async x=>fs.writeFile('diagnostics/helpscout-avelo-original-articles.json',JSON.stringify(x,null,2))});
await fs.writeFile('data/helpscout-avelo-knowledge-status.json',JSON.stringify({publishedAt:new Date().toISOString(),packHash,articles:result},null,2)+'\n');
console.log(`Published and read back ${result.length} Avelo articles. Shared course facts use the same source records as Sydney Dive Courses.`);
