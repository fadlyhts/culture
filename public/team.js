import {roundStatus} from './team-round.js';
import {
   $, escapeHTML as esc, api, LiveGame
}
 from './client.js';
let state=null,online=false,busy=false,pending=null;
let clockServerTime=Date.now(),clockReceivedAt=performance.now();
const currentRound=()=>roundStatus(state,clockServerTime+performance.now()-clockReceivedAt);
function acceptSnapshot(next){state=next;clockServerTime=next.serverNow||Date.now();clockReceivedAt=performance.now();}
const colors=['#58c8ff','#c79bff','#5fe3ae','#ff9f68','#ff7ac8','#c6e65c'];
function say(text,kind='info'){
  const message=$('#msg');
  message.hidden=!text;
  message.className='note '+kind;
  message.textContent=text;
  $('#play').dataset.feedback=kind;
  if(kind==='ok'){message.classList.remove('arrived');requestAnimationFrame(()=>message.classList.add('arrived'));}
}
function joinView(text){
  state=null;pending=null;
  $('#join').hidden=false;
  $('#play').hidden=true;
  $('#history').hidden=true;
  $('#logout').hidden=true;
  $('#joinMsg').textContent=text||'Gunakan tautan privat dari panitia.';
}
function render(){
  if(!state)return;
  $('#join').hidden=true;
  $('#play').hidden=false;
  $('#history').hidden=false;
  $('#logout').hidden=false;
  $('#tname').textContent=state.teams[state.team].name;
  document.body.style.setProperty('--tc',colors[state.team]);
  document.title=state.teams[state.team].name+' / Family 100';
  $('#qinfo').textContent='Soal '+(state.questionIndex+1)+' dari '+state.questionCount;
  $('#qtext').textContent=state.question;
  updateClock();
  $('#sentCount').textContent=state.submissions.length;
  $('#teamScore').textContent=state.teams[state.team].score;
  updateInput();
  $('#mq').textContent=state.questionIndex+1;
  $('#mine').innerHTML=state.submissions.map((row,i)=>'<li><b>'+(i+1)+'</b><span>'+esc(row.text)+'</span><time>'+new Date(row.time).toLocaleTimeString('id-ID',{
    hour:'2-digit',minute:'2-digit',second:'2-digit'
  })+'</time></li>').join('');
  $('#mempty').hidden=state.submissions.length>0;
}
const live=new LiveGame(next=>{
  if(next.team===undefined){
    live.stop();joinView('Browser ini memakai sesi host. Gunakan browser/profil terpisah untuk peserta.');return;
  }
  if(state&&next.revision<state.revision)return;const changed=state&&(state.cur!==next.cur||state.generation!==next.generation);acceptSnapshot(next);if(changed){
    pending=null;$('#ans').value='';say('Soal berganti. Jawab pertanyaan baru.');
  }
  if(pending&&state.submissions.some(s=>s.requestId===pending.requestId)){
    pending=null;$('#ans').value='';say('Jawaban tersimpan.','ok');
  }
  render();
},(text,connected)=>{
  online=connected;$('#connection').textContent=text;render();
},()=>{
  joinView('Sesi habis atau tautan diganti. Buka undangan terbaru dari panitia.');
});
async function join(token){
  $('#joinMsg').textContent='Memeriksa undangan…';
  try{
    await api('/api/team/join',{
      token
    });
    history.replaceState(null,'',location.pathname);
    await live.start();
  }
  catch(error){
    joinView(error.message);
  }
}
$('#joinForm').onsubmit=e=>{
  e.preventDefault();
  const value=$('#invite').value.trim();
  let token=value;
  try{
    const url=new URL(value);
    token=new URLSearchParams(url.hash.slice(1)).get('invite')||'';
  }
  catch{
  }
  if(!token){
    $('#joinMsg').textContent='Tautan undangan tidak valid.';
    return;
  }
  join(token);
};
$('#logout').onclick=async()=>{
  await api('/api/logout',{
  });
  live.stop();
  joinView('Anda sudah keluar.');
};
$('#f').onsubmit=async e=>{
  e.preventDefault();
  if(!state||busy||!['open','urgent'].includes(currentRound().phase)||!online)return;
  const text=$('#ans').value.trim();
  if(!text){
    say('Isi jawaban dahulu.','bad');
    return;
  }
  if(!pending||pending.text!==text||pending.questionId!==state.cur||pending.generation!==state.generation)pending={
    text,questionId:state.cur,generation:state.generation,requestId:crypto.randomUUID()
  };
  const sent=pending;
  busy=true;
  render();
  say('Mengirim…');
  try{
    const result=await api('/api/team/submit',sent);
    if(state&&state.cur===sent.questionId&&state.generation===sent.generation){
      if(result.state.revision>=state.revision)acceptSnapshot(result.state);
      pending=null;
      $('#ans').value='';
      say('Terkirim: '+text,'ok');
    }
  }
  catch(error){
    if(state&&state.cur===sent.questionId&&state.generation===sent.generation)say(error.message,'bad');
    if(['DUPLICATE','LOCKED','STALE_ROUND','INVALID'].includes(error.code))pending=null;
  }
  finally{
    busy=false;
    render();
    if(state&&['open','urgent'].includes(currentRound().phase))$('#ans').focus();
  }
};
function updateInput(){
  $('#answerCount').textContent=$('#ans').value.length+'/100';
  if(!state)return;
  const accepting=['open','urgent'].includes(currentRound().phase);
  $('#send').disabled=busy||!accepting||!online||!$('#ans').value.trim();
  $('#send').textContent=busy?'Mengirim jawaban...':!state.started?'Tunggu soal dimulai':!accepting?'Jawaban terkunci':!online?'Menunggu koneksi':'Kirim jawaban';
}
function updateClock(){
  if(!state)return;
  const {phase,seconds,progress}=currentRound();
  $('#play').dataset.phase=phase;
  $('#roundClock').dataset.phase=phase;
  $('#seconds').textContent=seconds===null?'--':seconds;
  $('#clockUnit').textContent=phase==='waiting'?'bersiap':phase==='locked'?'selesai':'detik';
  $('#roundClock').setAttribute('aria-label',phase==='waiting'?'Menunggu soal dimulai':phase==='locked'?'Waktu menjawab selesai':seconds===null?'Jawaban terbuka':seconds+' detik tersisa');
  $('#timeFill').style.transform='scaleX('+progress+')';
  const hint=phase==='waiting'?'Bersiap, tunggu pembawa acara.':phase==='locked'?'Jawaban terkunci. Tunggu panitia membuka papan.':phase==='urgent'?'Waktu hampir habis! Kirim jawabanmu sekarang.':'Ayo, kumpulkan jawaban sebanyak mungkin!';
  if($('#roundHint').textContent!==hint)$('#roundHint').textContent=hint;
  $('#lockpill').textContent=phase==='waiting'?'Belum dimulai':phase==='locked'?'Terkunci':'Jawab sekarang';
  $('#lockpill').className='pill '+(phase==='locked'?'lock':phase==='waiting'?'waiting':'open');
  $('#ans').disabled=phase==='waiting'||phase==='locked'||busy;
  updateInput();
}
$('#ans').addEventListener('input',updateInput);
setInterval(updateClock,100);
const token=new URLSearchParams(location.hash.slice(1)).get('invite');
if(token)await join(token);
else await live.start();
