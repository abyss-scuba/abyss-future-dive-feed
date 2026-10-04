import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('../scripts/push-publication-records.sh',import.meta.url).pathname;
function check(mode){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'record-push-test-'));
 try{
  fs.writeFileSync(path.join(dir,'git'),`#!/usr/bin/env bash
set -eu
echo "$*" >> "$TEST_DIRECTORY/trace"
case "$1" in
 symbolic-ref) if [[ "$TEST_MODE" == branch ]]; then echo feature; else echo main; fi ;;
 pull) if [[ "$TEST_MODE" == conflict ]]; then exit 1; fi ;;
 push)
  count=0; if [[ -f "$TEST_DIRECTORY/count" ]]; then count=$(cat "$TEST_DIRECTORY/count"); fi
  count=$((count+1)); echo "$count" > "$TEST_DIRECTORY/count"
  if [[ "$TEST_MODE" == exhausted ]]; then exit 1; fi
  if [[ "$TEST_MODE" == collision && "$count" -eq 1 ]]; then exit 1; fi
  ;;
 *) exit 90 ;;
esac
`,{mode:0o700});
  fs.writeFileSync(path.join(dir,'sleep'),'#!/usr/bin/env bash\nexit 0\n',{mode:0o700});
  const result=spawnSync('bash',[script],{encoding:'utf8',timeout:5000,env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,TEST_DIRECTORY:dir,TEST_MODE:mode}});
  const trace=fs.readFileSync(path.join(dir,'trace'),'utf8');
  assert.doesNotMatch(trace,/--force|reset|checkout|merge.*ours|merge.*theirs/);
  return {code:result.status,trace,pushes:(trace.match(/^push /gm)||[]).length,pulls:(trace.match(/^pull /gm)||[]).length};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('normal publication saves once',()=>{const r=check('success');assert.equal(r.code,0);assert.equal(r.pushes,1);});
test('a concurrent main update is rebased and retried',()=>{const r=check('collision');assert.equal(r.code,0);assert.equal(r.pushes,2);assert.equal(r.pulls,2);});
test('a true content conflict is not resolved or pushed automatically',()=>{const r=check('conflict');assert.equal(r.code,1);assert.equal(r.pushes,0);});
test('persistent delivery failure is bounded and remains failed',()=>{const r=check('exhausted');assert.equal(r.code,1);assert.equal(r.pushes,6);});
test('a feature branch cannot push publication records onto main',()=>{const r=check('branch');assert.equal(r.code,1);assert.equal(r.pushes,0);assert.equal(r.pulls,0);});
