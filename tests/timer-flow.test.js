import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,roundOf,command,submit,project,expireRounds} from '../src/game-engine.js';
import {ranking,resolvePlaces} from '../public/game-flow.js';
import {validateBackup,GameRoom} from '../src/game-room.js';
import {DatabaseSync} from 'node:sqlite';
const execute=(s,c)=>command(s,{questionId:s.cur,generation:roundOf(s).generation,...c});
const send=s=>submit(s,0,{questionId:s.cur,generation:roundOf(s).generation,text:s.questions[0].a[0].t,requestId:'first'});

test('New game has the seven supplied DATN questions, hides question and rejects prestart submissions',()=>{
  const s=createState();assert.equal(s.questions.length,7);
  assert.match(s.questions[0].q,/Risk Register 2026/);
  const p=project(s,{role:'team',team:0});assert.equal(p.started,false);
  assert.ok(!JSON.stringify(p).includes(s.questions[0].q));
  assert.throws(()=>send(s),{code:'NOT_STARTED'});
});
test('Start reserves five preparation seconds plus thirty answer seconds and remains idempotent',t=>{
  let now=100000;t.mock.method(Date,'now',()=>now);
  const s=createState();execute(s,{type:'start'});const deadline=roundOf(s).deadline;
  assert.equal(roundOf(s).startedAt,105000);assert.equal(deadline,135000);
  assert.throws(()=>send(s),{code:'COUNTDOWN'});
  assert.equal(project(s,{role:'team',team:0}).question,'Bersiap, soal segera dimulai.');
  assert.throws(()=>execute(s,{type:'revealAll'}),{code:'COUNTDOWN'});
  now+=10000;execute(s,{type:'start'});assert.equal(roundOf(s).deadline,deadline);
  assert.equal(roundOf(JSON.parse(JSON.stringify(s))).deadline,deadline);
  now=deadline;assert.throws(()=>send(s),{code:'LOCKED'});
  assert.equal(project(s,{role:'team',team:0}).locked,true);
  assert.equal(expireRounds(s),true);assert.equal(roundOf(s).locked,true);assert.equal(expireRounds(s),false);
});
test('Accepted retries survive deadline; future questions start fresh and reset returns to first question',t=>{
  let now=200000;t.mock.method(Date,'now',()=>now);
  const s=createState();execute(s,{type:'start'});now+=5000;const first=send(s);now+=30001;
  assert.equal(send(s),first);
  execute(s,{type:'active',id:s.questions[1].id,start:true});assert.equal(roundOf(s).deadline,now+35000);
  execute(s,{type:'reset'});assert.equal(s.cur,s.questions[0].id);assert.equal(roundOf(s).deadline,null);assert.equal(project(s,{role:'team',team:0}).started,false);
});
test('A running question cannot be edited and a restored timer closes instead of restarting',()=>{
  const s=createState();execute(s,{type:'start'});
  const questions=structuredClone(s.questions);questions[0].q='Changed';
  assert.throws(()=>execute(s,{type:'questions',questions}),{code:'STARTED'});
  const restored=validateBackup(s,s);assert.equal(roundOf(restored).locked,true);assert.equal(roundOf(restored).deadline,null);
});
test('Legacy empty rounds wait for start and legacy scored rounds retain their state',()=>{
  const s=createState(),r=roundOf(s);delete r.startedAt;delete r.deadline;
  assert.equal(roundOf(s).startedAt,null);r.locked=true;delete r.startedAt;
  assert.equal(roundOf(s).startedAt,0);assert.equal(project(s,{role:'host'}).started,true);
});
test('Only distinct positive leaders receive places; ties continue to extra rounds',()=>{
  assert.deepEqual(resolvePlaces([100,80,60,40,20,0]).map(w=>w.team),[0,1,2]);
  assert.deepEqual(resolvePlaces([100,60,60,40,20,0]).map(w=>w.team),[0]);
  assert.deepEqual(resolvePlaces([100,100,60,40,20,0]),[]);
  assert.deepEqual(resolvePlaces([100,0,0,0,0,0]).map(w=>w.team),[0]);
  assert.deepEqual(ranking([100,80,60,60,20,0].map(score=>({score}))).map(t=>t.rank),[1,2,3,3,5,6]);
});
test('Durable Object alarm survives object restart, persists lock and broadcasts without host',async t=>{
  let now=300000;t.mock.method(Date,'now',()=>now);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  let scheduled,notifications=0;
  const ctx={storage:{sql:{exec(sql,...args){const stmt=db.prepare(sql),rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows};}},transactionSync:fn=>fn(),setAlarm:time=>{scheduled=time;},deleteAlarm:()=>{scheduled=null;}},getWebSockets:()=>[{deserializeAttachment:()=>({role:'host',exp:999999}),send:()=>notifications++}]};
  const room=new GameRoom(ctx,{});room.mutate(s=>execute(s,{type:'start'}));assert.equal(scheduled,305000);
  const restarted=new GameRoom(ctx,{});assert.equal(scheduled,305000);
  now=305000;await restarted.alarm();assert.equal(roundOf(restarted.state).revealPending,false);
  assert.equal(roundOf(restarted.state).locked,false);assert.equal(scheduled,335000);
  assert.equal(project(restarted.state,{role:'team',team:0}).question,restarted.state.questions[0].q);
  now=335000;await restarted.alarm();
  assert.equal(roundOf(restarted.state).locked,true);assert.equal(scheduled,null);assert.equal(notifications,3);
  assert.equal(roundOf(new GameRoom(ctx,{}).state).locked,true);
});
test('An answer is rejected until exactly the end of preparation, then gets the full thirty seconds',t=>{
  let now=400000;t.mock.method(Date,'now',()=>now);
  const s=createState();execute(s,{type:'start'});
  now=404999;assert.throws(()=>send(s),{code:'COUNTDOWN'});
  const restored=JSON.parse(JSON.stringify(s));
  assert.equal(restored.run[s.cur].startedAt,405000);
  now=405000;assert.equal(expireRounds(restored),true);
  assert.equal(send(restored).team,0);
  assert.equal(restored.run[s.cur].deadline-now,30000);
  const backup=validateBackup(s,s);assert.equal(roundOf(backup).locked,true);assert.equal(roundOf(backup).deadline,null);
});
