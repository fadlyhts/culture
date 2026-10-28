import {MAIN_QUESTIONS} from './game-flow.js';
import {shortCode} from './invite-code.js';
import {bankEntries,insertQuestion,replaceBank} from './question-bank.js';
import {
   $, escapeHTML as esc, api, LiveGame, copy
}
 from './client.js';
let state=null, draft=[], editId=null, dirty=false, mode='play', peek=false, busy=false;
let sound=true, audioContext, editorQuestions='', linksKey='';
let serverOffset=0, overlayFocus=null, overlayQuestion=null, timerKey='', lastTick=-1;
try { sound=localStorage.getItem('family100.sound')!=='false'; } catch {}
function busyControls(value){
  $('#game').setAttribute('aria-busy',String(value));
  for(const control of document.querySelectorAll('#board button, #btnStart, #btnResetTop, #ovGo, #btnLockAll, #btnRevealAll, #btnCloseAll, #btnPrev, #btnNext, #btnSave, #btnSaveBank, #btnAddQ, #btnPlayThis, #btnResetGame, #btnSample, #btnStrike, #btnClearStrikes, [data-rotate], #teams input, #multiplier')){
    if(value){if(control.dataset.busyDisabled===undefined)control.dataset.busyDisabled=String(control.disabled);control.disabled=true;}
    else {control.disabled=control.dataset.busyDisabled==='true';delete control.dataset.busyDisabled;}
  }
}
const uid=()=>crypto.randomUUID();
const run=()=>state.run[state.cur];
const active=()=>state.questions.find(q=>q.id===state.cur);
const editorBank=()=>mode==='extra'?'extra':'main';
const editorEntries=()=>bankEntries(draft,editorBank());
const edited=()=>editorEntries().find(entry=>entry.question.id===editId)?.question||editorEntries()[0]?.question;
const status=(text)=>{
  $('#ansStatus').textContent=text;
};
function tone(frequency,at,duration,type='sine') {
    if(!sound)return;
    try{
    audioContext ||= new AudioContext();
    audioContext.resume();
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime+at;
    oscillator.type=type;
    oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(.12,now);
    gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now+duration);
  }
  catch{
  }
}
function ding(){
  tone(880,0,.18);
  tone(1320,.12,.35);
}
const live=new LiveGame(receive,(text,online)=>{
  status(text);document.body.dataset.online=online;
},()=>{
  hideOverlay();state=null;$('#game').hidden=true;$('#login').hidden=false;document.body.classList.remove('mode-play');$('#loginMsg').textContent='Masuk untuk membuka permainan.';
});
function receive(next) {
    if(!next.questions){
    live.stop();
    $('#loginMsg').textContent='Browser ini sedang menjadi peserta. Keluar dari sesi tim atau gunakan browser/profil lain untuk host.';
    $('#game').hidden=true;
    $('#login').hidden=false;
    return;
  }
    if(state&&next.revision<state.revision)return;
    if(state&&(next.cur!==state.cur||next.generation!==state.generation))hideOverlay();
    serverOffset=(next.serverNow||Date.now())-Date.now();
    state=next;
    $('#login').hidden=true;
  $('#game').hidden=false;
    if(!dirty){
    draft=structuredClone(state.questions);
    if(!draft.some(q=>q.id===editId))editId=state.cur;
  }
    setMode(mode);
  renderPlay();
  if(mode!=='play'){
    if(!dirty&&JSON.stringify(draft)!==editorQuestions)renderEditor();
    else renderLinks();
  }
}
async function cmd(command) {
    if(!state)return;
  if(busy){status('Perintah sedang diproses. Tunggu sebentar.');return false;}
    busy=true;busyControls(true);status('Menyimpan ke server…');
    try{
    const result=await api('/api/host/command',{
      questionId:state.cur,generation:state.generation,...command
    });
    receive(result.state);
    return true;
  }
  catch(e){
    status(e.message);
    $('#gameMsg').textContent=e.message;
    $('#saveMsg').textContent=e.message;
    $('#bankMsg').textContent=e.message;
    return false;
  }
  finally{
    busy=false;busyControls(false);if(state)renderPlay();
  }
}
function setMode(value){
  mode=value;
  document.body.classList.toggle('mode-play',value==='play'&&!!state);
  $('#view-play').hidden=value!=='play';
  $('#view-edit').hidden=value==='play';
  $('#view-edit').setAttribute('aria-label',value==='extra'?'Pengaturan soal tambahan':'Edit soal utama');
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.mode===value)));
}
function renderPlay(){
    const q=active(),r=run(),list=q.a,gains=Array(6).fill(0);
    q.a.forEach(a=>{
    if(r.open.includes(a.id)&&r.own[a.id]!==undefined)gains[r.own[a.id]]+=a.p*r.mult;
  });
    $('#qmeta').textContent=state.questionIndex<MAIN_QUESTIONS?'Soal '+(state.questionIndex+1)+' dari '+Math.min(state.questionCount,MAIN_QUESTIONS):'Soal tambahan '+(state.questionIndex-MAIN_QUESTIONS+1)+' / perebutan juara '+(state.tournament.winners.length+1);
    $('#qtext').textContent=state.started?q.q:'Tekan Mulai untuk memunculkan Soal '+(state.questionIndex+1)+'.';
    $('#view-play').classList.toggle('prestart',!state.started);
    $('#btnStart').disabled=busy;
    renderTimer();
    $('#frame').classList.toggle('peek-on',peek);
    const focusedAnswer=document.activeElement?.dataset?.answer;
    const board=$('#board'),cols=list.length>4?2:1;
    board.style.setProperty('--cols',cols);
  board.style.setProperty('--rows',Math.ceil(list.length/cols));
  const boardKey=JSON.stringify(q.a);
  if(board.dataset.key!==boardKey){board.dataset.key=boardKey;board.innerHTML=list.map((a,i)=>{const open=r.open.includes(a.id),owner=r.own[a.id];return '<button class="slot '+(open?'is-open':'')+'" data-answer="'+a.id+'" aria-pressed="'+open+'" aria-label="'+esc(open?a.t+', '+a.p+' poin':'Buka jawaban '+(i+1))+'" '+(open&&owner!==undefined?'style="--oc:var(--t'+(owner+1)+')"':'')+'><span class="slot-inner"><span class="face front" aria-hidden="true"><span class="num">'+(i+1)+'</span><span class="peek"><span class="peek-t">'+esc(a.t)+'</span><span>'+a.p+'</span></span></span><span class="face back" aria-hidden="true"><span class="ans">'+esc(a.t)+'</span><span class="pts">'+a.p+'</span></span></span></button>';}).join('');
  }
  list.forEach((answer,index)=>{const slot=board.querySelector('[data-answer="'+answer.id+'"]'),open=r.open.includes(answer.id),owner=r.own[answer.id];slot.classList.toggle('is-open',open);slot.setAttribute('aria-pressed',String(open));slot.setAttribute('aria-label',open?answer.t+', '+answer.p+' poin':'Buka jawaban '+(index+1));if(open&&owner!==undefined)slot.style.setProperty('--oc','var(--t'+(owner+1)+')');else slot.style.removeProperty('--oc');});
  if(focusedAnswer)board.querySelector('[data-answer="'+focusedAnswer+'"]')?.focus({preventScroll:true});
  const teamMarkup=state.teams.map((t,i)=>'<div class="team" style="--tc:var(--t'+(i+1)+')"><input class="team-name" data-team="'+i+'" aria-label="Nama tim '+(i+1)+'" maxlength="40" value="'+esc(t.name)+'"><input class="team-score" type="number" data-score="'+i+'" aria-label="Skor '+esc(t.name)+'" value="'+t.score+'"><span class="gain">'+(gains[i]?'+'+gains[i]:'')+'</span></div>').join('');
  if(!$('#teams').children.length)$('#teams').innerHTML=teamMarkup;
  state.teams.forEach((team,i)=>{const name=$('[data-team="'+i+'"]'),score=$('[data-score="'+i+'"]');if(document.activeElement!==name)name.value=team.name;if(document.activeElement!==score)score.value=team.score;score.disabled=state.tournament.winners.length>0;$('#teams').children[i].querySelector('.gain').textContent=team.place?'Juara '+team.place:state.questionIndex>=MAIN_QUESTIONS?'Perebutan: '+team.contestScore:gains[i]?'+'+gains[i]:'';});
  $('#acols').innerHTML=state.teams.map((t,i)=>{
    const rows=r.submissions.filter(x=>x.team===i),hidden=!state.locked;
    return '<div class="acol '+(hidden?'is-hidden':'')+'" style="--tc:var(--t'+(i+1)+')"><div class="ahead"><span class="aname">'+esc(t.name)+'</span><span class="acount">'+rows.length+'</span></div>'+(hidden?'<p class="aempty ahid">Jawaban disembunyikan sampai terkunci.</p>':rows.length?'<ol class="alist">'+rows.map(x=>'<li class="'+(x.answerId&&r.open.includes(x.answerId)&&r.own[x.answerId]===i?'hit':'')+'"><span>'+esc(x.text)+(x.answerId&&r.open.includes(x.answerId)?r.own[x.answerId]===i?' / tercepat, dapat poin':' / benar, 0 poin (didahului tim lain)':'')+'<br><time class="atime">'+new Date(x.time).toLocaleTimeString('id-ID')+'</time></span></li>').join('')+'</ol>':'<p class="aempty">Belum ada jawaban.</p>')+'</div>';
  }).join('');
  $('#btnLockAll').textContent=r.locked?'✓ Terkunci':'Kunci jawaban';$('#btnLockAll').disabled=state.locked||!state.started;
  $('#btnCloseAll').disabled=!r.open.length||!state.started;$('#btnRevealAll').disabled=!state.started;
  for(const button of board.querySelectorAll('button'))button.disabled=!state.started;
  $('#btnPrev').disabled=state.questionIndex===0;$('#btnNext').disabled=!state.started;
  $('#btnNext').textContent=state.questionIndex>=Math.min(MAIN_QUESTIONS,state.questionCount)-1?'Tentukan juara':'Berikutnya';
  if(state.finalized){for(const button of board.querySelectorAll('button'))button.disabled=true;$('#btnRevealAll').disabled=true;$('#btnCloseAll').disabled=true;$('#btnStart').disabled=true;}
  $('#btnPeek').setAttribute('aria-pressed',String(peek));$('#btnSound').setAttribute('aria-pressed',String(sound));$('#multiplier').value=r.mult;$('#multiplier').disabled=r.locked||r.startedAt!==null||r.submissions.length>0;if(busy)busyControls(true);
}
function renderEditor(){
  const entries=editorEntries(),extra=editorBank()==='extra',q=edited();
  $('#bankTitle').textContent=extra?'Soal tambahan':'Soal utama';
  $('#bankHelp').textContent=extra?'Siapkan pertanyaan, jawaban, sinonim, dan poin untuk perebutan juara. Soal dimainkan satu per satu sesuai urutan.':'Atur 5 soal utama beserta jawaban dan poinnya.';
  $('#bankMsg').textContent=(extra?entries.length+' soal tambahan disiapkan.':entries.length+' dari 5 soal utama.')+(dirty?' Ada perubahan belum disimpan.':' Tersimpan di server.');
  $('#btnAddQ').textContent=extra?'+ Soal tambahan baru':'+ Soal utama baru';
  $('#btnAddQ').disabled=busy||(!extra&&draft.length>=MAIN_QUESTIONS)||(extra&&draft.length<MAIN_QUESTIONS);
  $('#ioTitle').textContent=extra?'Impor/ekspor soal tambahan':'Impor/ekspor soal utama';
  $('#qlist').innerHTML=entries.map(({question:x,number})=>'<button class="qitem '+(x.id===q?.id?'is-sel':'')+'" data-edit="'+x.id+'"><span class="qi-n">'+number+'</span><span class="qi-t">'+esc(x.q||'(Soal baru)')+'</span><span class="qi-c">'+x.a.length+' jwb</span></button>').join('');
  $('#questionEditor').hidden=!q;$('#emptyQuestionEditor').hidden=!!q;
  renderLinks();editorQuestions=JSON.stringify(draft);
  if(!q)return;
  editId=q.id;
  $('#editMeta').textContent=(extra?'Soal tambahan ':'Soal utama ')+entries.find(entry=>entry.question.id===q.id).number+' dari '+entries.length;
  $('#eq').value=q.q;
  $('#arows').innerHTML=q.a.map((a,i)=>'<div class="arow" data-id="'+a.id+'"><span class="an">'+(i+1)+'</span><input class="field a-t" maxlength="100" aria-label="Jawaban '+(i+1)+'" value="'+esc(a.t)+'"><input class="field a-al" maxlength="300" aria-label="Sinonim '+(i+1)+'" placeholder="Sinonim, dipisah koma" value="'+esc(a.al)+'"><input class="field a-p" type="number" min="0" max="999" aria-label="Poin '+(i+1)+'" value="'+a.p+'"><button class="icon-btn a-del" aria-label="Hapus jawaban '+(i+1)+'">×</button></div>').join('');
  $('#btnAddA').disabled=q.a.length>=10;$('#btnUp').disabled=state.tournament.resolved.length>0||entries[0].question.id===q.id;$('#btnDown').disabled=state.tournament.resolved.length>0||entries[entries.length-1].question.id===q.id;
  $('#btnDelQ').disabled=state.tournament.resolved.length>0||(!extra&&(draft.length===1||draft.length>MAIN_QUESTIONS));
  $('#btnDup').disabled=!extra&&draft.length>=MAIN_QUESTIONS;
  $('#saveMsg').textContent=dirty?'Ada perubahan belum disimpan.':'Soal tersimpan di server.';
}
const slugs=['teh','tebu','kopi','kakao','tembakau','hore'];
function renderLinks(){
  const key=JSON.stringify(state.invitations.map((inv,i)=>[inv.token,inv.version,state.teams[i].name]));
  if(key===linksKey)return;
  linksKey=key;
  $('#teamLinks').innerHTML=state.teams.map((t,i)=>{
    const url=location.origin+'/j/'+shortCode(state.invitations[i].token);
    const qr='/api/host/qr?team='+i+'&v='+state.invitations[i].version;
    return '<div class="invite-card"><img class="invite-qr" src="'+qr+'" width="180" height="180" alt="QR undangan '+esc(t.name)+'" loading="lazy"><div class="invite-details"><strong>'+esc(t.name)+'</strong><input class="field tl-in" readonly aria-label="Tautan '+esc(t.name)+'" value="'+esc(url)+'"><div class="row"><button class="btn" data-copy="'+i+'">Salin tautan</button><a class="btn" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Buka</a><a class="btn" href="'+qr+'" download="qr-'+slugs[i]+'.png">Unduh QR</a><button class="btn btn-ghost" data-rotate="'+i+'">Ganti tautan</button></div></div></div>';
  }).join('');
}
function changed(){dirty=true;$('#saveMsg').textContent='Ada perubahan belum disimpan.';$('#bankMsg').textContent='Ada perubahan belum disimpan. Klik Simpan ke server.';}
function toText(qs){return qs.map(q=>[q.q,...q.a.map(a=>a.t+' | '+a.p+(a.al?' | '+a.al:''))].join('\n')).join('\n\n');}
function parseText(text){return text.trim().replace(/\r/g,'').split(/\n[ \t]*\n/).map(block=>{const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);return{id:uid(),q:lines.shift()||'',a:lines.map(line=>{const [t,p,al='']=line.split('|').map(x=>x.trim());return{id:uid(),t,p:Number(p),al};})};});}
async function save(){const ok=await cmd({type:'questions',questions:draft});if(ok){dirty=false;draft=structuredClone(state.questions);renderEditor();}return ok;}
function requireSaved(){if(dirty){$('#saveMsg').textContent='Simpan perubahan sebelum memainkan soal.';return false;}return true;}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginMsg').textContent='Memeriksa…';try{await api('/api/host/login',{password:$('#password').value});$('#password').value='';await live.start();}catch(error){$('#loginMsg').textContent=error.message;}});
$('#btnLogout').onclick=async()=>{await api('/api/logout',{});live.stop();location.reload();};
$('#btnFull').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{status('Layar penuh tidak tersedia di browser ini.');}};
$('#btnSound').onclick=()=>{sound=!sound;try{localStorage.setItem('family100.sound',String(sound));}catch{}renderPlay();};
$('#btnPeek').onclick=()=>{peek=!peek;renderPlay();};
$('#board').onclick=async e=>{const button=e.target.closest('[data-answer]');if(!button)return;const id=button.dataset.answer,open=run().open.includes(id);if(await cmd({type:open?'hide':'reveal',id})&&!open)ding();};
$('#btnStart').onclick=()=>cmd({type:'start'});
$('#btnResetTop').onclick=resetGame;
$('#btnLockAll').onclick=()=>cmd({type:'lock'});$('#btnRevealAll').onclick=async()=>{if(await cmd({type:'revealAll'}))ding();};$('#btnCloseAll').onclick=()=>cmd({type:'hideAll'});
async function navigate(offset){
  if(!state||busy||!$('#ov').hidden)return;
  if(offset>0&&state.questionIndex>=Math.min(MAIN_QUESTIONS,state.questionCount)-1){
    if(!state.locked){status('Kunci jawaban dan buka poin sebelum menentukan juara.');return;}
    if(await cmd({type:'settle'}))showResults(state.tournament.finished?'podium':'extra');
    return;
  }
  if(offset>0&&!state.started)return;
  const q=state.questions[state.questionIndex+offset];if(q)await cmd({type:'active',id:q.id,start:offset>0});
}
$('#btnPrev').onclick=()=>navigate(-1);$('#btnNext').onclick=()=>navigate(1);
$('#btnAnsReload').onclick=async()=>{try{receive(await api('/api/state'));status('Data dimuat ulang.');}catch(e){status(e.message);}};
$('#teams').addEventListener('change',e=>{if(e.target.matches('[data-team]'))cmd({type:'team',team:Number(e.target.dataset.team),name:e.target.value});if(e.target.matches('[data-score]'))cmd({type:'team',team:Number(e.target.dataset.score),total:Number(e.target.value)});});
$('#view-edit').addEventListener('input',e=>{const q=edited(),input=e.target;if(input.id==='eq')q.q=input.value;else if(input.closest('.arow')){const a=q.a.find(a=>a.id===input.closest('.arow').dataset.id);if(input.classList.contains('a-t'))a.t=input.value;else if(input.classList.contains('a-al'))a.al=input.value;else if(input.classList.contains('a-p'))a.p=Number(input.value);else return;}else return;changed();});
$('#view-edit').addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;const q=edited(),index=draft.indexOf(q);
  try{
  if(button.dataset.edit){editId=button.dataset.edit;renderEditor();return;}
  if(button.dataset.copy){const input=button.closest('.invite-card').querySelector('.tl-in');await copy(input.value,input,$('#tlMsg'));return;}
  if(button.dataset.rotate!==undefined){if(confirm('Ganti tautan tim dan putus sesi tim ini?'))await cmd({type:'rotateInvite',team:Number(button.dataset.rotate)});return;}
  if(button.classList.contains('a-del')){q.a=q.a.filter(a=>a.id!==button.closest('.arow').dataset.id);changed();renderEditor();return;}
  switch(button.id){
    case 'btnSave':case 'btnSaveBank':await save();break;
    case 'btnAddQ':{const n={id:uid(),q:'',a:[{id:uid(),t:'',p:0,al:''}]};draft=insertQuestion(draft,editorBank(),n,editorBank()==='extra'?undefined:q?.id);editId=n.id;changed();renderEditor();$('#eq').focus();break;}
    case 'btnAddA':if(q.a.length<10){q.a.push({id:uid(),t:'',p:0,al:''});changed();renderEditor();$('#arows .arow:last-child .a-t').focus();}break;
    case 'btnSortA':q.a.sort((a,b)=>b.p-a.p);changed();renderEditor();break;
    case 'btnPlayThis':if(requireSaved()&&await cmd({type:'active',id:q.id}))setMode('play');break;
    case 'btnUp':case 'btnDown':{const other=index+(button.id==='btnUp'?-1:1);if(editorEntries().some(entry=>entry.index===other)){draft.splice(index,1);draft.splice(other,0,q);changed();renderEditor();}break;}
    case 'btnDup':{const n={...q,id:uid(),a:q.a.map(a=>({...a,id:uid()}))};draft=insertQuestion(draft,editorBank(),n,editorBank()==='extra'?undefined:q.id);editId=n.id;changed();renderEditor();break;}
    case 'btnDelQ':if((editorBank()==='extra'||draft.length<=MAIN_QUESTIONS)&&draft.length>1&&confirm('Hapus soal ini?')){draft.splice(index,1);editId=null;changed();renderEditor();}break;
    case 'ioReload':$('#ioText').value=toText(editorEntries().map(entry=>entry.question));break;
    case 'ioCopy':await copy($('#ioText').value,$('#ioText'),$('#ioMsg'));break;
    case 'ioAppend':{const added=parseText($('#ioText').value);let next=draft;for(const question of added)next=insertQuestion(next,editorBank(),question);draft=next;editId=added[0]?.id;changed();renderEditor();$('#ioMsg').textContent='Soal ditambahkan ke menu ini. Klik Simpan ke server.';break;}
    case 'ioReplace':if(confirm('Ganti draf soal pada menu ini? Soal yang sudah dimainkan harus direset dahulu.')){draft=replaceBank(draft,editorBank(),parseText($('#ioText').value));editId=null;changed();renderEditor();}break;
    case 'btnResetGame':await resetGame();break;
    case 'btnSample':if(confirm('Kembalikan soal contoh dan reset permainan?')){dirty=false;await cmd({type:'sample'});}break;
    case 'btnStrike':if(await cmd({type:'strike'})){tone(110,0,.7,'sawtooth');const flash=$('#xflash');flash.textContent='×'.repeat(run().strikes);flash.style.fontSize='20vw';flash.classList.add('show');setTimeout(()=>flash.classList.remove('show'),1100);}break;
    case 'btnClearStrikes':await cmd({type:'clearStrikes'});break;
    case 'btnBackup':{try{const backup=await api('/api/host/backup');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));link.download='family100-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}catch(e){$('#gameMsg').textContent=e.message;}break;}
  }
  }catch(error){$('#bankMsg').textContent=error.message;$('#ioMsg').textContent=error.message;}
});
$('#io').addEventListener('toggle',()=>{if($('#io').open)$('#ioText').value=toText(editorEntries().map(entry=>entry.question));});
$('#multiplier').onchange=e=>cmd({type:'multiplier',value:Number(e.target.value)});
$('#backupFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2000000)throw new Error('Cadangan terlalu besar.');const data=JSON.parse(await file.text());if(confirm('Pulihkan cadangan dan ganti permainan saat ini?')){const result=await api('/api/host/restore',{...data,confirm:true});dirty=false;receive(result.state);$('#gameMsg').textContent='Cadangan dipulihkan. Tim perlu masuk kembali.';}}catch(error){$('#gameMsg').textContent=error.message;}e.target.value='';};
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{setMode(button.dataset.mode);if(mode!=='play'){renderEditor();$('#ioText').value=toText(editorEntries().map(entry=>entry.question));}});
document.addEventListener('keydown',e=>{if(!$('#ov').hidden){handleOverlayKey(e);return;}if(!state||mode!=='play'||e.target.matches('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='ArrowLeft'){e.preventDefault();navigate(-1);}else if(e.key==='ArrowRight'){e.preventDefault();navigate(1);}else if(/^[0-9]$/.test(e.key)){const index=e.key==='0'?9:Number(e.key)-1;$('#board').querySelectorAll('button')[index]?.click();}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
function renderTimer(){
  if(!state)return;
  const left=state.deadline?Math.max(0,(state.deadline-Date.now()-serverOffset)/1000):30;
  const done=state.locked||(state.deadline&&left<=0),sec=done?0:Math.ceil(left);
  const phase=done?'done':state.deadline?'run':'idle';
  $('#timer').className='timer is-'+phase+(phase==='run'&&sec<=5?' is-warn':'');
  $('#timerNum').textContent=sec;$('#timerLbl').textContent=done?'Terkunci':phase==='run'?'detik':'Mulai';
  $('#timerBar').style.width=(sec/30*100)+'%';$('#timer').setAttribute('aria-label','Waktu menjawab: '+sec+' detik');
  const key=state.cur+':'+state.generation;
  if(key!==timerKey){timerKey=key;lastTick=-1;}
  if(sec!==lastTick&&phase==='run'&&sec<=3)tone(720,0,.08,'square');
  if(sec!==lastTick&&done&&lastTick>0)tone(110,0,.5,'sawtooth');
  lastTick=sec;
}
setInterval(renderTimer,100);
async function resetGame(){
  if(confirm('Reset semua skor, kunci dan jawaban tim, lalu kembali ke soal 1?')){
    if(await cmd({type:'reset'}))hideOverlay();
  }
}
function hideOverlay(){
  if(!$('#ov'))return;
  $('#ov').hidden=true;$('#ovExtra').hidden=true;$('#ovPodium').hidden=true;
  document.querySelector('#app > .top')?.removeAttribute('inert');
  $('#view-play').removeAttribute('inert');$('#view-edit').removeAttribute('inert');
  overlayFocus?.focus({preventScroll:true});overlayFocus=null;overlayQuestion=null;
  celebrationStop?.();
}
let celebrationStop=null;
const CROWN="<svg class=\"crown\" viewBox=\"0 0 64 44\" aria-hidden=\"true\"><path d=\"M4 38 L8 10 L22 24 L32 4 L42 24 L56 10 L60 38 Z\" fill=\"#ffd23f\" stroke=\"#b87900\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/><rect x=\"4\" y=\"38\" width=\"56\" height=\"5\" rx=\"2\" fill=\"#e8a000\" stroke=\"#b87900\" stroke-width=\"2\"/><circle cx=\"8\" cy=\"9\" r=\"3.5\" fill=\"#ffffff\"/><circle cx=\"32\" cy=\"4\" r=\"3.5\" fill=\"#ffffff\"/><circle cx=\"56\" cy=\"9\" r=\"3.5\" fill=\"#ffffff\"/></svg>";
function showResults(kind){
  overlayFocus=document.activeElement;overlayQuestion=state.cur;
  const winners=state.tournament.winners;
  const ordered=state.teams.map((t,i)=>({...t,i,rank:t.place||4,score:t.place?winners.find(w=>w.team===i).score:t.contestScore})),ov=$('#ov');
  $('#ovExtra').hidden=kind!=='extra';$('#ovPodium').hidden=kind!=='podium';
  ov.className='ov ov-mode-'+kind;ov.hidden=false;
  document.querySelector('#app > .top').setAttribute('inert','');$('#view-play').setAttribute('inert','');$('#view-edit').setAttribute('inert','');
  if(kind==='extra'){
    const hasNext=state.questionIndex+1<state.questionCount;
    $('#ovExtraSub').textContent=(winners.length?'Juara '+winners.map(w=>w.rank+': '+state.teams[w.team].name).join(', ')+' sudah tetap dan tidak ikut lagi. ':'Belum ada juara tunggal. ')+(hasNext?'Lanjut satu soal untuk perebutan juara '+(winners.length+1)+'.':'Soal tambahan habis. Tambahkan soal di tab Edit untuk melanjutkan perebutan juara '+(winners.length+1)+'.');
    $('#ovRank').innerHTML=ordered.map(x=>'<li style="--tc:var(--t'+(x.i+1)+')"><b>'+(x.place?x.place:'–')+'</b><span>'+esc(x.name)+'</span><em>'+x.score+(x.place?' / juara tetap':' / perebutan')+'</em></li>').join('');
    $('#ovGo').disabled=!hasNext;
    (hasNext?$('#ovGo'):$('#ovBack')).focus();
  }else{
    $('#pod').innerHTML=[2,1,3].map(rank=>{
      const group=ordered.filter(t=>t.rank===rank),delay={1:2.5,2:1.3,3:.3}[rank];
      return '<div class="pc r'+rank+'">'+(rank===1&&group.length?CROWN:'')+'<div class="pwho" style="animation-delay:'+(delay+.5)+'s">'+(group.length?group.map(t=>'<div class="pw" style="--tc:var(--t'+(t.i+1)+')">'+esc(t.name)+'</div>').join('')+'<div class="ps">'+group[0].score+' poin</div>':'<div class="pw none">Belum ada</div>')+'</div><div class="pstep" style="animation-delay:'+delay+'s"><b>'+rank+'</b></div></div>';
    }).join('');
    $('#ovOthers').textContent=ordered.filter(t=>!t.place).map(t=>t.name).join(' / ');
    $('#ovClose').focus();
    [523,659,784,1047].forEach((f,i)=>tone(f,i*.14,.3,'triangle'));
    celebrationStop=celebrate();
  }
}
function celebrate(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return ()=>{};
  const canvas=$('#ovCv'),context=canvas.getContext('2d');
  canvas.width=canvas.clientWidth;canvas.height=canvas.clientHeight;
  const particles=Array.from({length:140},()=>({x:Math.random()*canvas.width,y:-Math.random()*canvas.height,v:2+Math.random()*4,c:['#ffd23f','#ffffff','#14ec76'][Math.floor(Math.random()*3)],r:Math.random()*6}));
  let frame,until=performance.now()+15000;
  function draw(now){
    context.clearRect(0,0,canvas.width,canvas.height);
    for(const p of particles){p.y+=p.v;p.x+=Math.sin(p.y/40);context.fillStyle=p.c;context.fillRect(p.x,p.y,6,9);if(p.y>canvas.height)p.y=-10;}
    if(now<until)frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return ()=>{cancelAnimationFrame(frame);context.clearRect(0,0,canvas.width,canvas.height);};
}
function handleOverlayKey(e){
  if(e.key==='Escape'){e.preventDefault();hideOverlay();return;}
  if(e.key!=='Tab')return;
  const controls=Array.from($('#ov').querySelectorAll('button')).filter(b=>!b.disabled&&!b.closest('[hidden]'));
  const index=controls.indexOf(document.activeElement),next=(index+(e.shiftKey?-1:1)+controls.length)%controls.length;
  e.preventDefault();controls[next]?.focus();
}
$('#ovGo').onclick=async()=>{
  const q=state.questions[state.questionIndex+1];
  if(q&&state.cur===overlayQuestion&&await cmd({type:'active',id:q.id,start:true}))hideOverlay();
};
$('#ovBack').onclick=hideOverlay;$('#ovClose').onclick=hideOverlay;
$('#ovEditExtra').onclick=()=>{hideOverlay();setMode('extra');renderEditor();$('#btnAddQ').focus();};
const track=$('#mqTrack');if(track){const duplicate=track.cloneNode(true);duplicate.removeAttribute('id');duplicate.setAttribute('aria-hidden','true');for(const logo of Array.from(duplicate.children))track.appendChild(logo);}
await live.start();
