import {
   SAMPLE_TEXT
}
 from './sample.js';
export class GameError extends Error {
   constructor(code, message, status=400) {
     super(message);
     this.code=code;
     this.status=status;
  }
}
export const fail=(code,message,status)=>{
  throw new GameError(code,message,status);
};
export const uid=()=>crypto.randomUUID();
export function normalize(text) {
   return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
const str=(v,max,label)=>{
  if(typeof v!=='string'||!v.trim()||v.length>max)fail('INVALID',label+' tidak valid.');
  return v.trim();
};
const safeId=v=>{
  v=str(v,80,'ID');
  if(!/^[a-zA-Z0-9_-]+$/.test(v)||Object.prototype.hasOwnProperty.call(Object.prototype,v))fail('INVALID','ID tidak valid.');
  return v;
};
const integer=(v,min,max)=>{
  if(!Number.isInteger(v)||v<min||v>max)fail('INVALID','Angka tidak valid.');
  return v;
};
export function validateQuestions(qs) {
   if(!Array.isArray(qs)||qs.length<1||qs.length>100)fail('INVALID','Isi 1–100 soal.');
   const ids=new Set(), aids=new Set();
   return qs.map(q=>{
    const id=safeId(q.id||uid());if(ids.has(id))fail('INVALID','ID soal duplikat.');ids.add(id);  if(!Array.isArray(q.a)||!q.a.length||q.a.length>10)fail('INVALID','Isi 1–10 jawaban per soal.');  const aliases=new Set();  return {
      id,q:str(q.q,300,'Pertanyaan'),a:q.a.map(a=>{
        const aid=safeId(a.id||uid());if(aids.has(aid))fail('INVALID','ID jawaban duplikat.');aids.add(aid);const t=str(a.t,100,'Jawaban'),al=typeof a.al==='string'?a.al.trim():'';if(al.length>300)fail('INVALID','Sinonim terlalu panjang.');for(const x of new Set([t,...al.split(/[,;]/)].map(normalize).filter(Boolean))){
          if(aliases.has(x))fail('INVALID','Sinonim/jawaban tumpang tindih.');aliases.add(x);
        }
        return {
          id:aid,t,p:integer(a.p,0,999),al
        };
      })
    };
  });
}
export function parseText(text) {
  if(typeof text!=='string'||text.length>120000)fail('INVALID','Teks soal terlalu panjang.');
  return validateQuestions(text.trim().replace(/\r/g,'').split(/\n[ \t]*\n/).map(block=>{
    const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);return {
      id:uid(),q:lines.shift(),a:lines.map(l=>{
        const [t,p,al='']=l.split('|').map(x=>x.trim());return {
          id:uid(),t,p:Number(p),al
        };
      })
    };
  }));
}
export function createState() {
  const questions=parseText(SAMPLE_TEXT);
  return {
    schema:1,revision:0,generation:1,sequence:0,cur:questions[0].id,questions,teams:['Tim Teh','Tim Tebu','Tim Kopi','Tim Kakao','Tim Tembakau','Tim Hore'].map(name=>({
      name,adj:0
    })),run:{
    },invitations:Array.from({
      length:6
    },()=>({
      token:uid()+uid(),version:1
    }))
  };
}
export function roundOf(s,id=s.cur) {
  const existing=s.run[id];
  if(existing&&existing.startedAt===undefined){
    existing.startedAt=existing.locked||existing.submissions.length||existing.open.length?0:null;
    existing.deadline=null;
  }
  return s.run[id]||(s.run[id]={
    generation:s.generation,locked:false,open:[],own:{
    },submissions:[],mult:1,strikes:0,startedAt:null,deadline:null
  });
}
export function matchAnswer(list,text) {
  const x=normalize(text);
  let best=null,score=0;
  for(const a of list)for(const candidate of [a.t,...a.al.split(/[,;]/)]){
    const c=normalize(candidate);
    if(!c)continue;
    const sc=c===x?100+c.length:(' '+x+' ').includes(' '+c+' ')?50+c.length:x.length>=4&&(' '+c+' ').includes(' '+x+' ')?20+x.length:0;
    if(sc>score){
      score=sc;
      best=a;
    }
  }
  return best;
}
export function scores(s) {
  const total=s.teams.map(t=>t.adj);
  for(const q of s.questions){
    const r=s.run[q.id];
    if(r)for(const a of q.a)if(r.open.includes(a.id)&&r.own[a.id]!==undefined)total[r.own[a.id]]+=a.p*r.mult;
  }
  return total;
}
export function submit(s,team,data) {
  integer(team,0,5);
  const r=roundOf(s);
  if(data.questionId!==s.cur||data.generation!==r.generation)fail('STALE_ROUND','Soal berubah. Muat ulang.',409);
  const requestId=str(data.requestId,80,'ID kiriman');
  const prev=r.submissions.find(x=>x.team===team&&x.requestId===requestId);
  if(prev){
    if(typeof data.text!=='string'||data.text.trim()!==prev.text)fail('IDEMPOTENCY_CONFLICT','ID kiriman sudah dipakai untuk jawaban lain.',409);
    return prev;
  }
  if(r.locked||r.deadline&&Date.now()>=r.deadline)fail('LOCKED','Waktu habis. Jawaban sudah dikunci.',409);
  if(r.startedAt===null)fail('NOT_STARTED','Tunggu pembawa acara memulai soal.',409);
  if(r.submissions.filter(x=>x.team===team).length>=40)fail('LIMIT','Maksimal 40 jawaban tiap soal.',429);
  const text=str(data.text,100,'Jawaban'),norm=normalize(text);
  if(!norm)fail('INVALID','Isi jawaban.');
  if(r.submissions.some(x=>x.normalized===norm))fail('DUPLICATE','Jawaban ini sudah dikirim.',409);
  const q=s.questions.find(q=>q.id===s.cur),a=matchAnswer(q.a,text);
  if(a&&r.own[a.id]!==undefined)fail('DUPLICATE','Jawaban ini sudah diambil tim lain.',409);
  const row={
    seq:++s.sequence,team,requestId,text,normalized:norm,time:Date.now(),answerId:a?.id||null
  };
  r.submissions.push(row);
  if(a)r.own[a.id]=team;
  s.revision++;
  return row;
}
const started=r=>r&&(r.startedAt||r.locked||r.submissions.length||r.open.length);
export function expireRounds(s,now=Date.now()) {
  let changed=false;
  for(const r of Object.values(s.run))if(!r.locked&&r.deadline&&now>=r.deadline){r.locked=true;changed=true;}
  if(changed)s.revision++;
  return changed;
}
function startRound(r) {
  if(r.locked||r.startedAt!==null) return;
  r.startedAt=Date.now();r.deadline=r.startedAt+30000;
}
export function command(s,c) {
  if(!c||typeof c.type!=='string')fail('INVALID','Perintah tidak valid.');
  const r=roundOf(s),q=s.questions.find(q=>q.id===s.cur);
   const roundCommands=['start','lock','reveal','hide','revealAll','hideAll','multiplier','strike','clearStrikes'];
   if(roundCommands.includes(c.type)&&(c.questionId!==s.cur||c.generation!==r.generation))fail('STALE_ROUND','Soal berubah. Muat ulang sebelum menjalankan perintah.',409);
   switch(c.type){
     case 'active':if(!s.questions.some(q=>q.id===c.id))fail('INVALID','Soal tidak ditemukan.');
    s.cur=c.id;
    if(c.start===true)startRound(roundOf(s));else roundOf(s);
    break;
     case 'start':startRound(r);
    break;
     case 'lock':r.locked=true;
    break;
     case 'reveal':if(!q.a.some(a=>a.id===c.id))fail('INVALID','Jawaban tidak ditemukan.');
    r.locked=true;
    if(!r.open.includes(c.id))r.open.push(c.id);
    break;
     case 'hide':r.open=r.open.filter(id=>id!==c.id);
    break;
     case 'revealAll':r.locked=true;
    r.open=q.a.map(a=>a.id);
    break;
     case 'hideAll':r.open=[];
    break;
     case 'multiplier':if(started(r))fail('STARTED','Pengali hanya dapat diubah sebelum jawaban masuk.',409);
    r.mult=integer(c.value,1,3);
    break;
     case 'strike':r.strikes=Math.min(3,r.strikes+1);
    break;
     case 'clearStrikes':r.strikes=0;
    break;
     case 'team':integer(c.team,0,5);
    if(c.name!==undefined)s.teams[c.team].name=str(c.name,40,'Nama tim');
    if(c.total!==undefined){
      integer(c.total,-999999,999999);
      s.teams[c.team].adj+=c.total-scores(s)[c.team];
    }
    break;
     case 'questions':{
      const next=validateQuestions(c.questions);
      for(const old of s.questions)if(started(s.run[old.id])){
        const n=next.find(q=>q.id===old.id);
        if(!n||JSON.stringify(n)!==JSON.stringify(old))fail('STARTED','Reset permainan sebelum mengubah/menghapus soal yang sudah dimainkan.',409);
      }
      s.questions=next;
      if(!next.some(q=>q.id===s.cur))s.cur=next[0].id;
      break;
    }
     case 'reset':s.generation++;
    s.run={
    };
    s.teams.forEach(t=>t.adj=0);
    s.cur=s.questions[0].id;
    roundOf(s);
    break;
     case 'sample':s.generation++;
    s.questions=parseText(SAMPLE_TEXT);
    s.cur=s.questions[0].id;
    s.run={
    };
    s.teams.forEach(t=>t.adj=0);
    s.cur=s.questions[0].id;
    roundOf(s);
    break;
     case 'rotateInvite':integer(c.team,0,5);
    s.invitations[c.team]={
      token:uid()+uid(),version:s.invitations[c.team].version+1
    };
    break;
     default:fail('INVALID','Perintah tidak dikenal.');
  }
  s.revision++;
  return s;
}
export function project(s,role) {
  const q=s.questions.find(q=>q.id===s.cur),r=roundOf(s),total=scores(s),now=Date.now(),begun=r.startedAt!==null,base={
    schema:s.schema,revision:s.revision,cur:s.cur,generation:r.generation,questionIndex:s.questions.findIndex(q=>q.id===s.cur),questionCount:s.questions.length,question:begun?q.q:'Tunggu pembawa acara menekan Mulai.',started:begun,deadline:r.deadline||null,serverNow:now,locked:r.locked||!!(r.deadline&&now>=r.deadline),mult:r.mult,strikes:r.strikes,teams:s.teams.map((t,i)=>({
      name:t.name,score:total[i]
    }))
  };
  if(role.role==='host')return {
    ...base,questions:s.questions,run:s.run,invitations:s.invitations,adjustments:s.teams.map(t=>t.adj)
  };
  return {
    ...base,team:role.team,answers:q.a.filter(a=>r.open.includes(a.id)).map(a=>({
      t:a.t,p:a.p,owner:r.own[a.id]
    })),submissions:r.submissions.filter(x=>x.team===role.team).map(x=>({
      seq:x.seq,text:x.text,time:x.time,requestId:x.requestId
    }))
  };
}
