import fs from 'node:fs/promises';
import {DateTime} from 'luxon';
import {scrapeCourses,buildCourseSnapshot,validateBookingLinks,renderCourseSnapshot,publishCourseSnapshot,makeDocsClient,ZONE} from '../src/helpscout-courses.mjs';
const dryRun=process.env.DRY_RUN!=='false';
const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
const previous=await read('data/helpscout-course-last-good.json');
await fs.mkdir('diagnostics',{recursive:true});
try{
 const raw=await scrapeCourses();await fs.writeFile('diagnostics/helpscout-course-raw.json',JSON.stringify(raw,null,2));
 const mapping=await read('data/helpscout-course-mapping.json'),snapshot=buildCourseSnapshot(raw,mapping,{previous});await validateBookingLinks(snapshot);
 await fs.writeFile('diagnostics/helpscout-course-candidate.html',renderCourseSnapshot(snapshot));await fs.writeFile('diagnostics/helpscout-course-candidate.json',JSON.stringify(snapshot,null,2));
 const publication=dryRun?{status:'dry-run',count:snapshot.sessions.length}:await publishCourseSnapshot(snapshot,{request:makeDocsClient(process.env.HELP_SCOUT_DOCS_API_KEY)});
 const status={attemptedAt:snapshot.checkedAt,status:publication.status,lastSuccessfulCheck:publication.status==='already-published-today'?previous?.checkedAt:snapshot.checkedAt,staleAfter:publication.status==='already-published-today'?previous?.staleAfter:snapshot.staleAfter,publication,coverage:raw.extraction,firstDate:snapshot.sessions[0].startDate,lastDate:snapshot.sessions.at(-1).endDate,warningCount:snapshot.sessions.filter(s=>s.warnings.length).length};
 if(!dryRun){if(publication.status==='published-and-verified')await fs.writeFile('data/helpscout-course-last-good.json',JSON.stringify(snapshot,null,2)+'\n');await fs.writeFile('data/helpscout-course-sync-status.json',JSON.stringify(status,null,2)+'\n')}
 await fs.writeFile('diagnostics/helpscout-course-summary.json',JSON.stringify(status,null,2));console.log(JSON.stringify(status));
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`Course dates: ${publication.status}; ${snapshot.sessions.length} listings, ${raw.extraction.pages} pages; checked ${snapshot.checkedAt}. ${status.warningCount} source timetable warnings. Schedule 02:30 Australia/Sydney.\n`);
}catch(e){const now=DateTime.now().setZone(ZONE),status={attemptedAt:now.toISO(),status:'failed-last-good-preserved',lastSuccessfulCheck:previous?.checkedAt??null,staleAfter:previous?.staleAfter??null,stale:!previous||now>DateTime.fromISO(previous.staleAfter),error:e.message};await fs.writeFile('diagnostics/helpscout-course-failure.json',JSON.stringify(status,null,2));if(!dryRun)await fs.writeFile('data/helpscout-course-sync-status.json',JSON.stringify(status,null,2)+'\n');console.error(e.message);process.exitCode=1}
