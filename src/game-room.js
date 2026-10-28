import {
   createState, command, submit, project, roundOf, validateQuestions, normalize, fail, expireRounds, tournamentOf
}
 from './game-engine.js';
import {
   json, errorResponse, readJSON, cookieToken, verifySession, signSession, sessionCookie, sameSecret
}
 from './auth.js';
import {shortCode} from '../public/invite-code.js';
import {TEAM_NAMES} from '../public/team-names.js';
import {qrPng} from './qr-png.js';
const teamSlugs=['teh','tebu','kopi','kakao','tembakau','hore'];
export const MAX_STATE_BYTES = 1800000;
export class GameRoom {
   constructor(ctx,env){
    this.ctx=ctx;
    this.env=env;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id=1), data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS login_limit (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until_ms INTEGER NOT NULL)');
    const row=ctx.storage.sql.exec('SELECT data FROM game WHERE id=1').toArray()[0];
    this.state=row?JSON.parse(row.data):createState();
    const rename=this.state.teamNamesVersion!==1;
    if(rename){
      this.state.teams.forEach((team,i)=>team.name=TEAM_NAMES[i]);
      this.state.teamNamesVersion=1;
      this.state.revision++;
    }
    tournamentOf(this.state);
    roundOf(this.state);
    if(!row||rename)this.persist(this.state);
    this.scheduleTimer();
  }
   scheduleTimer(){
    const deadlines=Object.values(this.state.run).filter(r=>!r.locked&&r.deadline).map(r=>r.revealPending?r.startedAt:r.deadline);
    if(deadlines.length)this.ctx.storage.setAlarm?.(Math.max(Date.now(),Math.min(...deadlines)));
    else this.ctx.storage.deleteAlarm?.();
  }
   async alarm(){
    const next=structuredClone(this.state);
    if(expireRounds(next)){this.persist(next);this.broadcast();}
    this.scheduleTimer();
  }
   persist(state){
    const serialized=JSON.stringify(state);
    if(new TextEncoder().encode(serialized).byteLength>MAX_STATE_BYTES)fail('LIMIT','Penyimpanan permainan penuh (1,8 MB). Unduh cadangan lalu reset jawaban sebelum melanjutkan.',413);
    this.ctx.storage.transactionSync(()=>this.ctx.storage.sql.exec('INSERT INTO game (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',serialized));
    this.state=state;
  }
   validRole(role){
    return role&&role.exp>Date.now()&&(role.role==='host'||role.role==='team'&&this.state.invitations[role.team]?.version===role.version);
  }
   async role(request){
    const role=await verifySession(cookieToken(request),this.env.SESSION_SECRET);
    if(!this.validRole(role))fail('AUTH','Silakan masuk kembali.',401);
    return role;
  }
   broadcast(){
    for(const ws of this.ctx.getWebSockets()){
      const role=ws.deserializeAttachment();
      if(!this.validRole(role)){
        ws.close(4001,'Session expired');
        continue;
      }
      try{
        ws.send(JSON.stringify({
          type:'state',state:project(this.state,role)
        }));
      }
      catch{
        ws.close(1011,'Reconnect');
      }
    }
  }
   mutate(fn){
    const next=structuredClone(this.state);
    const result=fn(next);
    this.persist(next);
    this.scheduleTimer();
    this.broadcast();
    return result;
  }
   async login(request,data){
    if(!this.env.HOST_PASSWORD||this.env.HOST_PASSWORD.length<12)fail('CONFIG','HOST_PASSWORD harus minimal 12 karakter.',503);
    const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'local';
    this.ctx.storage.sql.exec('DELETE FROM login_limit WHERE until_ms < ?',now);
    let row=this.ctx.storage.sql.exec('SELECT attempts,until_ms FROM login_limit WHERE key=?',ip).toArray()[0];
    if(row?.attempts>=10)fail('RATE_LIMIT','Terlalu banyak percobaan. Tunggu 15 menit.',429);
    this.ctx.storage.sql.exec('INSERT INTO login_limit(key,attempts,until_ms) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1',ip,now+900000);
    if(!await sameSecret(data.password,this.env.HOST_PASSWORD))fail('AUTH','Kata sandi salah.',401);
    this.ctx.storage.sql.exec('DELETE FROM login_limit WHERE key=?',ip);
    return this.session(request,{
      role:'host',exp:now+43200000
    });
  }
   async session(request,role){
    const token=await signSession(role,this.env.SESSION_SECRET);
    return json({
      ok:true
    },200,{
      'Set-Cookie':sessionCookie(token,request.url)
    });
  }
   async fetch(request){
    try{
      const path=new URL(request.url).pathname;
      if(request.method==='GET'&&path.startsWith('/j/')){
        const code=path.slice(3);
        const index=/^[a-zA-Z0-9_-]{22}$/.test(code)?this.state.invitations.findIndex(invite=>shortCode(invite.token)===code):-1;
        if(index<0)fail('NOT_FOUND','Tautan undangan tidak valid atau sudah diganti.',404);
        return new Response(null,{status:302,headers:{
          Location:'/tim/'+teamSlugs[index]+'.html#invite='+this.state.invitations[index].token,
          'Cache-Control':'no-store','Referrer-Policy':'no-referrer'
        }});
      }
      if(request.method==='POST'&&path==='/api/host/login')return await this.login(request,await readJSON(request));
      if(request.method==='POST'&&path==='/api/team/join'){
        const data=await readJSON(request),index=this.state.invitations.findIndex(x=>x.token===data.token);
        if(index<0)fail('INVITE','Tautan tim tidak valid atau sudah diganti.',401);
        return await this.session(request,{
          role:'team',team:index,version:this.state.invitations[index].version,exp:Date.now()+43200000
        });
      }
      if(request.method==='POST'&&path==='/api/logout')return json({
        ok:true
      },200,{
        'Set-Cookie':sessionCookie('',request.url,0)
      });
      const role=await this.role(request);
      if(request.method==='GET'&&path==='/api/host/qr'){
        if(role.role!=='host')fail('FORBIDDEN','Khusus pembawa acara.',403);
        const value=new URL(request.url).searchParams.get('team');
        if(!/^[0-5]$/.test(value))fail('INVALID','Tim tidak valid.');
        const team=Number(value);
        const link=new URL('/j/'+shortCode(this.state.invitations[team].token),request.url).href;
        const png=await qrPng(link);
        return new Response(png,{headers:{
          'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'
        }});
      }
       if(request.method==='GET'&&path==='/api/state')return json(project(this.state,role));
       if(request.method==='GET'&&path==='/api/live'){
        if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')fail('INVALID','WebSocket diperlukan.',426);
        if(this.ctx.getWebSockets().length>=50)fail('LIMIT','Terlalu banyak sambungan.',429);
        const pair=new WebSocketPair(),[client,server]=Object.values(pair);
        server.serializeAttachment(role);
        this.ctx.acceptWebSocket(server);
        server.send(JSON.stringify({
          type:'state',state:project(this.state,role)
        }));
        return new Response(null,{
          status:101,webSocket:client
        });
      }
       if(request.method==='POST'&&path==='/api/team/submit'){
        if(role.role!=='team')fail('FORBIDDEN','Khusus tim.',403);
        const data=await readJSON(request);
        if(!this.validRole(role))fail('AUTH','Tautan tim sudah diganti.',401);
        this.mutate(s=>submit(s,role.team,data));
        return json({
          ok:true,state:project(this.state,role)
        });
      }
       if(role.role!=='host')fail('FORBIDDEN','Khusus pembawa acara.',403);
       if(request.method==='POST'&&path==='/api/host/command'){
        const data=await readJSON(request,800000);
        if(!this.validRole(role))fail('AUTH','Sesi berakhir. Silakan masuk kembali.',401);
        this.mutate(s=>command(s,data));
        return json({
          ok:true,state:project(this.state,role)
        });
      }
       if(request.method==='GET'&&path==='/api/host/backup')return json({
        format:'family100-backup',version:1,state:this.state
      });
       if(request.method==='POST'&&path==='/api/host/restore'){
        const data=await readJSON(request,2000000);
        if(!this.validRole(role))fail('AUTH','Sesi berakhir. Silakan masuk kembali.',401);
        if(data.confirm!==true||data.format!=='family100-backup'||data.version!==1)fail('INVALID','Konfirmasi dan format cadangan diperlukan.');
        const restored=validateBackup(data.state,this.state);
        this.persist(restored);
        this.scheduleTimer();
        this.broadcast();
        return json({
          ok:true,state:project(this.state,role)
        });
      }
       fail('NOT_FOUND','API tidak ditemukan.',404);
    }
    catch(e){
      return errorResponse(e);
    }
  }
   webSocketMessage(ws){
    const role=ws.deserializeAttachment();
    if(!this.validRole(role)){
      ws.close(4001,'Session expired');
      return;
    }
    ws.send(JSON.stringify({
      type:'state',state:project(this.state,role)
    }));
  }
   webSocketClose(ws,code){
    ws.close(code,'Closed');
  }
   webSocketError(ws){
    ws.close(1011,'Reconnect');
  }
}
export function validateBackup(input,current){
  if(!input||input.schema!==1)fail('INVALID','Cadangan tidak valid.');
  const state=createState();
  state.questions=validateQuestions(input.questions);
  if(!state.questions.some(q=>q.id===input.cur))fail('INVALID','Soal aktif tidak valid.');
  state.cur=input.cur;
  if(!Array.isArray(input.teams)||input.teams.length!==6)fail('INVALID','Tim tidak valid.');
  state.teams=input.teams.map(t=>{
    if(typeof t.name!=='string'||!t.name.trim()||t.name.length>40||!Number.isInteger(t.adj)||Math.abs(t.adj)>3996999)fail('INVALID','Tim tidak valid.');return {
      name:t.name,adj:t.adj
    };
  });
  state.generation=current.generation+1;
  state.revision=current.revision+1;
  state.invitations=current.invitations.map(i=>({
    ...i,version:i.version+1
  }));
  state.sequence=0;
  state.run={
  };
  for(const q of state.questions){
    const r=input.run?.[q.id];
    if(!r)continue;
    if(typeof r.locked!=='boolean'||![1,2,3].includes(r.mult)||!Number.isInteger(r.strikes)||r.strikes<0||r.strikes>3||!Array.isArray(r.open)||!Array.isArray(r.submissions)||r.submissions.length>240)fail('INVALID','Ronde tidak valid.');
    const ids=new Set(q.a.map(a=>a.id));
    if(r.open.some(id=>!ids.has(id))||r.open.length>q.a.length||r.open.length&&!r.locked)fail('INVALID','Jawaban terbuka tidak valid.');
    const own={
    };
    for(const [id,team] of Object.entries(r.own||{
    })){
      if(!ids.has(id)||!Number.isInteger(team)||team<0||team>5)fail('INVALID','Pemilik jawaban tidak valid.');
      own[id]=team;
    }
    const submissions=r.submissions.map(x=>{
      if(!Number.isInteger(x.team)||x.team<0||x.team>5||typeof x.text!=='string'||x.text.length>100||typeof x.requestId!=='string'||x.requestId.length>80)fail('INVALID','Kiriman tidak valid.');return {
        seq:++state.sequence,team:x.team,text:x.text,requestId:x.requestId,time:Number.isFinite(x.time)?x.time:0,normalized:normalize(x.text),answerId:ids.has(x.answerId)?x.answerId:null
      };
    });
    state.run[q.id]={
      generation:state.generation,locked:r.locked,mult:r.mult,strikes:r.strikes,open:[...new Set(r.open)],own,submissions,
      startedAt:r.startedAt===null?null:0,deadline:null
    };
    // A restored backup cannot restart a running countdown.
    if(r.deadline)state.run[q.id].locked=true;
  }
  roundOf(state);
  if(input.tournament){
    const t=input.tournament;
    if(!Array.isArray(t.winners)||t.winners.length>3||!Array.isArray(t.baseline)||t.baseline.length!==6||t.baseline.some(x=>!Number.isSafeInteger(x))||!Array.isArray(t.resolved)||t.resolved.length>100||new Set(t.resolved).size!==t.resolved.length||t.resolved.some(id=>!state.questions.some(q=>q.id===id))||typeof t.finished!=='boolean'||t.finished!==(t.winners.length===3))fail('INVALID','Hasil juara tidak valid.');
    const seen=new Set();
    t.winners.forEach((w,i)=>{if(!w||typeof w!=='object'||!Number.isInteger(w.team)||w.team<0||w.team>5||seen.has(w.team)||w.rank!==i+1||!Number.isSafeInteger(w.score)||w.score<=0)fail('INVALID','Juara tidak valid.');seen.add(w.team);});
    state.tournament=structuredClone(t);
  }
  return state;
}
