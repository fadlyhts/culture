import {TEST_TEXT} from './fixture-questions.js';
import {parseText,roundOf} from '../src/game-engine.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DatabaseSync
}
 from 'node:sqlite';
import {
  GameRoom
}
 from '../src/game-room.js';
import worker from '../src/worker.js';
const env={
  HOST_PASSWORD:'test-password-at-least-12',SESSION_SECRET:'integration-session-key-at-least-32-characters'
};
function context(db){
  return {
    storage:{
      sql:{
        exec(sql,...params){
          const stmt=db.prepare(sql);
          return {
            toArray:()=>stmt.all(...params),...(()=>{
              if(!/^SELECT/i.test(sql)){
                stmt.run(...params);return {
                };
              }
              return {
              };
            })()
          };
        }
      },transactionSync(fn){
        db.exec('BEGIN');
        try{
          const result=fn();
          db.exec('COMMIT');
          return result;
        }
        catch(e){
          db.exec('ROLLBACK');
          throw e;
        }
      }
    },getWebSockets:()=>[]
  };
}
const suites=[];
const add=(name,fn)=>suites.push({
  name,fn
});
const req=(path,body,cookie)=>new Request('https://quiz.example'+path,{
  method:body===undefined?'GET':'POST',headers:{
    Origin:'https://quiz.example',...(body===undefined?{
    }
    :{
      'Content-Type':'application/json'
    }),...(cookie?{
      Cookie:cookie
    }
    :{
    })
  },...(body===undefined?{
  }
  :{
    body:JSON.stringify(body)
  })
});
async function host(room){
  if(!room.state.sequence&&!Object.keys(room.state.run).some(id=>room.state.run[id].submissions.length)){
    room.mutate(s=>{s.questions=parseText(TEST_TEXT);s.cur=s.questions[0].id;s.run={};roundOf(s).startedAt=1;});
  }
  const response=await room.fetch(req('/api/host/login',{
    password:env.HOST_PASSWORD
  }));
  assert.equal(response.status,200);
  const cookie=response.headers.get('Set-Cookie');
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('Secure'));
  return cookie.split(';')[0];
}
async function team(room,hostCookie,index){
  const state=await (await room.fetch(req('/api/state',undefined,hostCookie))).json();
  const response=await room.fetch(req('/api/team/join',{
    token:state.invitations[index].token
  }));
  assert.equal(response.status,200);
  return response.headers.get('Set-Cookie').split(';')[0];
}
add('Real SQLite API: authentication, concurrent claims, host scoring, and object restart',async()=>{
  const db=new DatabaseSync(':memory:'),ctx=context(db);let room=new GameRoom(ctx,env);assert.equal((await room.fetch(req('/api/state'))).status,401);const h=await host(room),a=await team(room,h,0),b=await team(room,h,1);const snap=await (await room.fetch(req('/api/state',undefined,a))).json();const base={
    questionId:snap.cur,generation:snap.generation,text:'Tas'
  };const claims=await Promise.all([room.fetch(req('/api/team/submit',{
    ...base,requestId:'a'
  },a)),room.fetch(req('/api/team/submit',{
    ...base,requestId:'b'
  },b))]);assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);assert.equal((await room.fetch(req('/api/host/command',{
    type:'revealAll',questionId:snap.cur,generation:snap.generation
  },a))).status,403);assert.equal((await room.fetch(req('/api/host/command',{
    type:'revealAll',questionId:snap.cur,generation:snap.generation
  },h))).status,200);room=new GameRoom(ctx,env);const state=await (await room.fetch(req('/api/state',undefined,h))).json();assert.equal(state.teams.reduce((sum,t)=>sum+t.score,0),30);assert.equal((await room.fetch(req('/api/team/submit',{
    ...base,text:'Laptop',requestId:'late'
  },b))).status,409);db.close();
});
add('Team invitation rotation immediately revokes previously issued cookies',async()=>{
  const db=new DatabaseSync(':memory:'),room=new GameRoom(context(db),env),h=await host(room),a=await team(room,h,0);assert.equal((await room.fetch(req('/api/host/command',{
    type:'rotateInvite',team:0
  },h))).status,200);assert.equal((await room.fetch(req('/api/state',undefined,a))).status,401);db.close();
});
add('Login attempts are bounded and wrong credentials create no session',async()=>{
  const db=new DatabaseSync(':memory:'),room=new GameRoom(context(db),env);for(let i=0;i<10;i++){
    const response=await room.fetch(req('/api/host/login',{
      password:'wrong'
    }));assert.equal(response.status,401);assert.equal(response.headers.get('Set-Cookie'),null);
  }
  assert.equal((await room.fetch(req('/api/host/login',{
    password:env.HOST_PASSWORD
  }))).status,429);db.close();
});
add('Worker routing rejects cross-origin mutations before reaching the game',async()=>{
  let calls=0;const response=await worker.fetch(new Request('https://quiz.example/api/host/command',{
    method:'POST',headers:{
      Origin:'https://evil.example'
    }
  }),{
    GAME:{
      idFromName(){
        calls++;
      }
    }
  });assert.equal(response.status,403);assert.equal(calls,0);
});
add('Live broadcasts filter each role and close expired/revoked sessions',async()=>{
  const db=new DatabaseSync(':memory:'),ctx=context(db),room=new GameRoom(ctx,env);const messages=[];const sockets=[{
    role:{
      role:'host',exp:Date.now()+10000
    }
  },{
    role:{
      role:'team',team:0,version:1,exp:Date.now()+10000
    }
  },{
    role:{
      role:'team',team:1,version:1,exp:1
    }
  }].map(x=>({
    ...x,deserializeAttachment(){
      return this.role;
    },send(text){
      messages.push({
        role:this.role.role,payload:JSON.parse(text)
      });
    },close(code){
      this.closed=code;
    }
  }));ctx.getWebSockets=()=>sockets;room.broadcast();assert.equal(messages.length,2);assert.ok(messages[0].payload.state.questions);assert.equal(messages[1].payload.state.questions,undefined);assert.equal(messages[1].payload.state.invitations,undefined);assert.equal(sockets[2].closed,4001);db.close();
});
add('API rejects non-object payloads without internal errors',async()=>{
   const db=new DatabaseSync(':memory:'),room=new GameRoom(context(db),env),h=await host(room),a=await team(room,h,0);  for(const [path,cookie] of [['/api/host/login',null],['/api/team/join',null],['/api/team/submit',a],['/api/host/command',h],['/api/host/restore',h]]){
      const response=await room.fetch(req(path,null,cookie));assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID');
  }
   db.close();
});
add('API rechecks host expiration after reading a slow request body',async()=>{
   const db=new DatabaseSync(':memory:'),room=new GameRoom(context(db),env),h=await host(room);  let checked=0;  room.role=async()=>({
    role:'host',exp:Date.now()+10000
  });  room.validRole=()=>++checked===1;  const originalRole=room.role;  room.role=async request=>{
    const role=await originalRole(request);if(!room.validRole(role))throw Error('Unexpected early expiration');return role;
  };  const response=await room.fetch(req('/api/host/command',{
    type:'reset'
  },h));assert.equal(response.status,401);assert.equal(room.state.generation,1);db.close();
});
add('A legitimate backup above 200 KB restores within the bounded restore route',async()=>{
  const db=new DatabaseSync(':memory:'),room=new GameRoom(context(db),env),h=await host(room);
  const state=structuredClone(room.state),original=state.questions[0];
  state.questions=Array.from({length:10},()=>({...original,id:crypto.randomUUID(),a:original.a.map(a=>({...a,id:crypto.randomUUID()}))}));
  state.cur=state.questions[0].id;state.run={};
  for(const q of state.questions)state.run[q.id]={generation:state.generation,locked:true,mult:1,strikes:0,open:[],own:{},submissions:Array.from({length:240},(_,index)=>({seq:++state.sequence,team:index%6,requestId:crypto.randomUUID(),text:'x'.repeat(100),normalized:'x'.repeat(100),time:Date.now(),answerId:null}))};
  room.persist(state);
  const backup=await (await room.fetch(req('/api/host/backup',undefined,h))).json();
  assert.ok(new TextEncoder().encode(JSON.stringify(backup)).byteLength>200000);
  const response=await room.fetch(req('/api/host/restore',{...backup,confirm:true},h));
  assert.equal(response.status,200,JSON.stringify(await response.json()));
  assert.equal(room.state.run[room.state.cur].submissions.length,240);db.close();
});
add('Oversized state mutations fail before changing memory or SQLite',()=>{
  const db=new DatabaseSync(':memory:'),room=new GameRoom(context(db),env);
  const before=JSON.stringify(room.state),storedBefore=db.prepare('SELECT data FROM game WHERE id=1').get().data;
  assert.throws(()=>room.mutate(state=>{state.revision++;state.extra='x'.repeat(1800001);}),{code:'LIMIT',status:413});
  assert.equal(JSON.stringify(room.state),before);
  assert.equal(db.prepare('SELECT data FROM game WHERE id=1').get().data,storedBefore);db.close();
});
export async function runChecks(){
  const results=[];
  for(const {
    name,fn
  }
   of suites){
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
 of suites)test(name,fn);
