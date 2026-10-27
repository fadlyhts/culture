import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState as productionState,submit,command,project,scores,roundOf,parseText
}
 from '../src/game-engine.js';
import {
  signSession,verifySession,checkOrigin,readJSON
}
 from '../src/auth.js';
import {
  validateBackup
}
 from '../src/game-room.js';
import {TEST_TEXT} from './fixture-questions.js';
function createState(){
  const s=productionState();s.questions=parseText(TEST_TEXT);s.cur=s.questions[0].id;
  roundOf(s).startedAt=1;
  return s;
}
const suite=[];
const add=(name,fn)=>suite.push({
  name,fn
});
const execute=(s,c)=>command(s,{
  questionId:s.cur,generation:roundOf(s).generation,...c
});
const setup=()=>{
  const s=createState();
  roundOf(s);
  return s;
};
const send=(s,team,text,requestId=crypto.randomUUID())=>submit(s,team,{
  questionId:s.cur,generation:roundOf(s).generation,text,requestId
});
add('First matching claim wins and repeated synonyms cannot earn points',()=>{
  const s=setup();s.questions[0].a[0].al='bag';send(s,0,'bag');assert.throws(()=>send(s,1,'tas'),{
    code:'DUPLICATE'
  });assert.deepEqual(scores(s),[0,0,0,0,0,0]);execute(s,{
    type:'reveal',id:s.questions[0].a[0].id
  });assert.deepEqual(scores(s),[30,0,0,0,0,0]);execute(s,{
    type:'hide',id:s.questions[0].a[0].id
  });assert.equal(scores(s)[0],0);execute(s,{
    type:'reveal',id:s.questions[0].a[0].id
  });assert.equal(scores(s)[0],30);
});
add('Lock order and reset generations reject late and stale writes',()=>{
  const s=setup();const old={
    questionId:s.cur,generation:roundOf(s).generation,text:'Tas',requestId:'old'
  };execute(s,{
    type:'lock'
  });assert.throws(()=>submit(s,0,old),{
    code:'LOCKED'
  });execute(s,{
    type:'reset'
  });assert.throws(()=>submit(s,0,old),{
    code:'STALE_ROUND'
  });assert.equal(scores(s)[0],0);
});
add('Idempotent retries return the original accepted submission',()=>{
  const s=setup();const first=send(s,0,'Tas','retry');execute(s,{
    type:'lock'
  });assert.equal(send(s,0,'Tas','retry'),first);assert.equal(roundOf(s).submissions.length,1);
});
add('Reordering preserves ownership and totals; started questions cannot be edited',()=>{
  const s=setup();send(s,2,'Tas');execute(s,{
    type:'revealAll'
  });const qs=structuredClone(s.questions).reverse();execute(s,{
    type:'questions',questions:qs
  });assert.equal(scores(s)[2],30);const bad=structuredClone(qs);bad.find(q=>q.id===s.cur).a[0].p=99;assert.throws(()=>execute(s,{
    type:'questions',questions:bad
  }),{
    code:'STARTED'
  });
});
add('Team projection never exposes hidden answers, matching status, others submissions or invitations',()=>{
  const s=setup();send(s,0,'Tas');send(s,1,'Laptop');const p=project(s,{
    role:'team',team:0
  });assert.equal(p.submissions.length,1);assert.deepEqual(p.answers,[]);const encoded=JSON.stringify(p);for(const value of [s.invitations[0].token,'Laptop','Kunci kendaraan','answerId','normalized','questions'])assert.ok(!encoded.includes(value));
});
add('Persisted JSON preserves complete scores and state',()=>{
  const s=setup();send(s,4,'Laptop');execute(s,{
    type:'revealAll'
  });const restored=project(JSON.parse(JSON.stringify(s)),{role:'host'}),original=project(s,{role:'host'});
  delete restored.serverNow;delete original.serverNow;assert.deepEqual(restored,original);
});
add('Bounds and malformed question banks are rejected',()=>{
  assert.throws(()=>parseText('Question\nAnswer | -1'),{
    code:'INVALID'
  });const s=setup();assert.throws(()=>send(s,0,'x'.repeat(101)),{
    code:'INVALID'
  });assert.throws(()=>execute(s,{
    type:'team',team:7,name:'x'
  }),{
    code:'INVALID'
  });assert.throws(()=>execute(s,{
    type:'questions',questions:[]
  }),{
    code:'INVALID'
  });
});
add('Signed sessions reject tampering, wrong keys and expiration',async()=>{
  const secret='a'.repeat(32),role={
    role:'team',team:3,exp:Date.now()+10000
  };const token=await signSession(role,secret);assert.deepEqual(await verifySession(token,secret),role);assert.equal(await verifySession(token+'x',secret),null);assert.equal(await verifySession(token,'b'.repeat(32)),null);assert.equal(await verifySession(await signSession({
    ...role,exp:1
  },secret),secret),null);
});
add('Same-origin checks and bounded JSON reject malicious requests',async()=>{
  assert.throws(()=>checkOrigin(new Request('https://quiz.example/api/host/command',{
    method:'POST',headers:{
      Origin:'https://evil.example'
    }
  })),{
    code:'ORIGIN'
  });checkOrigin(new Request('https://quiz.example/api/host/command',{
    method:'POST',headers:{
      Origin:'https://quiz.example'
    }
  }));await assert.rejects(()=>readJSON(new Request('https://x',{
    method:'POST',headers:{
      'Content-Type':'application/json'
    },body:'x'
  })),{
    code:'INVALID'
  });await assert.rejects(()=>readJSON(new Request('https://x',{
    method:'POST',headers:{
      'Content-Type':'application/json'
    },body:JSON.stringify({
      text:'x'.repeat(210000)
    })
  })),{
    code:'SIZE'
  });
});
add('Backup restores score state and invalidates stale team sessions and requests',()=>{
  const s=setup();send(s,0,'Tas');execute(s,{
    type:'revealAll'
  });const copy=validateBackup(structuredClone(s),s);assert.equal(JSON.stringify(scores(copy)),JSON.stringify(scores(s)));assert.equal(copy.generation,s.generation+1);assert.equal(copy.invitations[0].version,s.invitations[0].version+1);const bad=structuredClone(s);bad.run[bad.cur].own[s.questions[0].a[0].id]=10;assert.throws(()=>validateBackup(bad,s),{
    code:'INVALID'
  });
});
add('Question IDs cannot overwrite prototype properties',()=>{
  const s=setup();const bad=structuredClone(s.questions);bad[0].id='__proto__';assert.throws(()=>execute(s,{
    type:'questions',questions:bad
  }),{
    code:'INVALID'
  });
});
add('Delayed host commands cannot lock, reveal or hide a different question or reset round',()=>{
   const s=setup();const expected={
    questionId:s.cur,generation:roundOf(s).generation
  };  execute(s,{
    type:'active',id:s.questions[1].id
  });  for(const type of ['lock','revealAll','hideAll','strike','clearStrikes','multiplier'])assert.throws(()=>command(s,{
    type,...expected,value:2
  }),{
    code:'STALE_ROUND'
  });  assert.equal(roundOf(s).locked,false);execute(s,{
    type:'active',id:expected.questionId
  });execute(s,{
    type:'reset'
  });  assert.throws(()=>command(s,{
    type:'lock',...expected
  }),{
    code:'STALE_ROUND'
  });  assert.throws(()=>command(s,{
    type:'lock'
  }),{
    code:'STALE_ROUND'
  });
});
add('A retry ID cannot silently replace a different submitted answer',()=>{
   const s=setup();send(s,0,'Tas','same-id');  assert.throws(()=>send(s,0,'Laptop','same-id'),{
    code:'IDEMPOTENCY_CONFLICT'
  });  assert.equal(roundOf(s).submissions.length,1);
});
add('JSON null, arrays and primitive bodies are validation errors',async()=>{
   for(const body of ['null','[]','123','"text"'])await assert.rejects(()=>readJSON(new Request('https://quiz.example',{
    method:'POST',headers:{
      'Content-Type':'application/json'
    },body
  })),{
    code:'INVALID'
  });
});
add('Maximum legal cumulative scores still export and restore after a manual adjustment',()=>{
  const state=setup();
  state.questions=Array.from({length:100},(_,question)=>({id:crypto.randomUUID(),q:'Question '+question,a:Array.from({length:10},(_,answer)=>({id:crypto.randomUUID(),t:'Answer '+answer,p:999,al:''}))}));
  state.cur=state.questions[0].id;state.run={};
  for(const question of state.questions)state.run[question.id]={generation:state.generation,locked:true,mult:3,strikes:0,submissions:[],open:question.a.map(a=>a.id),own:Object.fromEntries(question.a.map(a=>[a.id,0]))};
  command(state,{type:'team',team:0,total:-999999});
  const restored=validateBackup(state,state);
  assert.equal(scores(restored)[0],-999999);
});
export async function runChecks(){
  const results=[];
  for(const {
    name,fn
  }
   of suite){
    try{
      await fn();
      results.push({
        name,passed:true
      });
    }
    catch(e){
      results.push({
        name,passed:false,error:e.stack
      });
    }
  }
  return results;
}
if(!globalThis.FAMILY100_MANUAL_CHECK)for(const {
  name,fn
}
 of suite)test(name,fn);
