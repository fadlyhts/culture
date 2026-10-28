import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createState,command,submit,roundOf,project,validateQuestions} from '../src/game-engine.js';
import {validateBackup} from '../src/game-room.js';

const act=(s,c)=>command(s,{questionId:s.cur,generation:roundOf(s).generation,...c});
const send=(s,team,text)=>submit(s,team,{questionId:s.cur,generation:roundOf(s).generation,text,requestId:crypto.randomUUID()});
let now;
beforeEach(t=>{now=1000000;t.mock.method(Date,'now',()=>now);});
function setup(totals=[100,0,0,0,0,0]){
  const s=createState();
  s.questions=Array.from({length:9},(_,i)=>({id:'q'+i,q:'Question '+i,a:[{id:'a'+i,t:'Alpha',al:'first',p:30},{id:'b'+i,t:'Beta',al:'',p:20},{id:'c'+i,t:'Gamma',al:'',p:10},{id:'d'+i,t:'Delta',al:'',p:20}]}));
  s.questions=validateQuestions(s.questions);
  s.run={};s.cur='q4';s.teams.forEach((t,i)=>t.adj=totals[i]);
  act(s,{type:'start'});now+=5000;act(s,{type:'lock'});act(s,{type:'settle'});
  return s;
}
function next(s){act(s,{type:'active',id:s.questions[s.questions.findIndex(q=>q.id===s.cur)+1].id,start:true});now+=5000;}
function finish(s){act(s,{type:'revealAll'});act(s,{type:'settle'});}

test('One main winner sits out; two different extra leaders fill the podium immediately',()=>{
  const s=setup();assert.deepEqual(s.tournament.winners.map(w=>w.team),[0]);next(s);
  assert.throws(()=>send(s,0,'Alpha'),{code:'WINNER'});
  send(s,1,'Alpha');send(s,2,'Beta');finish(s);
  assert.deepEqual(s.tournament.winners.map(w=>w.team),[0,1,2]);assert.equal(s.tournament.finished,true);
  assert.equal(project(s,{role:'team',team:3}).eligible,false);
  assert.throws(()=>next(s),{code:'FINISHED'});
});
test('A single extra winner becomes second; a fresh contest determines third',()=>{
  const s=setup();next(s);send(s,1,'Alpha');finish(s);
  assert.deepEqual(s.tournament.winners.map(w=>w.team),[0,1]);next(s);
  assert.throws(()=>send(s,1,'Beta'),{code:'WINNER'});
  send(s,3,'Gamma');finish(s);
  assert.deepEqual(s.tournament.winners.map(w=>w.team),[0,1,3]);
  assert.deepEqual(s.tournament.winners.map(w=>w.score),[100,30,10]);
});
test('Ties and zero scores continue beyond two extras without assigning shared podium places',()=>{
  const s=setup();next(s);send(s,1,'Beta');send(s,2,'Delta');finish(s);
  assert.equal(s.tournament.winners.length,1);next(s);finish(s);
  assert.equal(s.tournament.winners.length,1);next(s);send(s,2,'Gamma');finish(s);
  assert.deepEqual(s.tournament.winners.map(w=>w.team),[0,2,1]);
});
test('Extra contest resets main scores and fixed winners persist through restore',()=>{
  const s=setup([100,50,50,0,0,0]);next(s);send(s,4,'Gamma');finish(s);
  assert.deepEqual(s.tournament.winners.map(w=>w.team),[0,4]);
  const restored=validateBackup(JSON.parse(JSON.stringify(s)),s);
  assert.deepEqual(restored.tournament,s.tournament);next(restored);
  assert.throws(()=>send(restored,4,'Alpha'),{code:'WINNER'});
  send(restored,5,'Beta');finish(restored);assert.equal(restored.tournament.finished,true);
  act(restored,{type:'reset'});assert.equal(project(restored,{role:'host'}).tournament.winners.length,0);
});
test('Results require locked and revealed points and cannot be changed afterward',()=>{
  const s=createState();s.cur=s.questions[4].id;act(s,{type:'start'});
  now+=5000;
  send(s,0,s.questions[4].a[0].t);
  assert.throws(()=>act(s,{type:'settle'}),{code:'LOCK_FIRST'});act(s,{type:'lock'});
  assert.throws(()=>act(s,{type:'settle'}),{code:'REVEAL_FIRST'});finish(s);
  assert.throws(()=>act(s,{type:'hideAll'}),{code:'FINISHED'});
  assert.throws(()=>act(s,{type:'team',team:0,total:1}),{code:'FINISHED'});
});
test('More extra questions can be appended after exhaustion without resetting fixed places',()=>{
  const s=setup();s.questions=s.questions.slice(0,7);next(s);finish(s);next(s);finish(s);
  assert.equal(s.cur,'q6');assert.equal(s.tournament.finished,false);
  const question={id:'q7',q:'Next extra',a:[{id:'next-answer',t:'New',p:20,al:''}]};
  act(s,{type:'questions',questions:[...s.questions,question]});next(s);send(s,2,'New');finish(s);
  assert.deepEqual(s.tournament.winners.map(w=>w.team),[0,2]);
});
test('Malformed restored winners are rejected rather than changing participant eligibility',()=>{
  const s=setup(),bad=structuredClone(s);bad.tournament.winners=[null];
  assert.throws(()=>validateBackup(bad,s),{code:'INVALID'});
  bad.tournament=structuredClone(s.tournament);bad.tournament.winners[0].rank=3;
  assert.throws(()=>validateBackup(bad,s),{code:'INVALID'});
});
