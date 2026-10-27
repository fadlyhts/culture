import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roundStatus} from '../public/team-round.js';

test('Participant countdown follows server time, warns at five seconds and closes exactly at deadline',()=>{
  const state={started:true,locked:false,deadline:130000};
  assert.equal(roundStatus(state,100000).seconds,30);
  assert.equal(roundStatus(state,124999).phase,'open');
  assert.equal(roundStatus(state,125000).phase,'urgent');
  assert.equal(roundStatus(state,129999).seconds,1);
  assert.deepEqual(roundStatus(state,130000),{phase:'locked',seconds:0,progress:0});
  assert.equal(roundStatus(state,140000).seconds,0);
});
test('Waiting, manual lock and legacy rounds display distinct participant states',()=>{
  assert.equal(roundStatus({started:false,locked:false,deadline:null},100000).phase,'waiting');
  assert.deepEqual(roundStatus({started:true,locked:true,deadline:130000},110000),{phase:'locked',seconds:0,progress:0});
  assert.deepEqual(roundStatus({started:true,locked:false,deadline:null},110000),{phase:'open',seconds:null,progress:1});
});
test('All six participant pages include every control required by the interactive client',async()=>{
  const base=new URL('../public/',import.meta.url),source=await readFile(new URL('team.js',base),'utf8');
  const required=[...source.matchAll(/\$\(['"]#([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(m=>m[1]);
  for(const slug of ['teh','tebu','kopi','kakao','tembakau','hore']){
    const html=await readFile(new URL('tim/'+slug+'.html',base),'utf8');
    const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,'Duplicate ID on '+slug);
    for(const id of required)assert.ok(ids.includes(id),slug+' missing #'+id);
    assert.match(html,/role="timer"/);assert.match(html,/aria-describedby="answerHelp"/);
  }
});
