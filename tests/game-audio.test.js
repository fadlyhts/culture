import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio,revealCue} from '../public/game-audio.js';

function harness(options={}){
  const notes=[],timers=[];
  const param=()=>({value:0,events:[],cancelScheduledValues(at){this.events.push(['cancel',at]);},setValueAtTime(value,at){this.events.push(['set',value,at]);},linearRampToValueAtTime(value,at){this.events.push(['ramp',value,at]);},exponentialRampToValueAtTime(){}});
  const context={state:'suspended',currentTime:0,destination:{},
    async resume(){this.state='running';},
    createGain(){return {gain:param(),connect(){},disconnect(){}};},
    createOscillator(){
      const note={frequency:{setValueAtTime(value){note.hz=value;}},connect(){},disconnect(){},start(at){note.started=at;},stop(at){if(at===undefined)note.onended?.();else note.ends=at;}};
      notes.push(note);return note;
    }
  };
  let contexts=0;
  const audio=new GameAudio({...options,createContext:()=>{contexts++;return context;},setTimer:(callback,delay)=>{const timer={callback,delay};timers.push(timer);return timer;},clearTimer:timer=>{timer.cancelled=true;}});
  return {audio,notes,timers,context,get contexts(){return contexts;}};
}

test('Reveals select correct or tetot from server ownership, including team zero',()=>{
  const before={cur:'q',generation:1,run:{q:{open:[],own:{}}}};
  const after=structuredClone(before);after.run.q.open=['answer'];
  assert.equal(revealCue(before,after),'incorrect');
  after.run.q.own.answer=0;
  assert.equal(revealCue(before,after),'correct');
  assert.equal(revealCue(after,structuredClone(after)),null);
  assert.equal(revealCue(null,after),null);
  assert.equal(revealCue(after,before),null);
  assert.equal(revealCue(before,{...after,generation:2}),null);
  assert.equal(revealCue(before,{...after,cur:'next'}),null);
});
test('Buka semua plays a positive cue if any newly revealed answer has a correct team',()=>{
  const before={cur:'q',generation:1,run:{q:{open:['old'],own:{old:0}}}};
  const after={cur:'q',generation:1,run:{q:{open:['old','empty'],own:{old:0}}}};
  assert.equal(revealCue(before,after),'incorrect');
  after.run.q.open.push('claimed');after.run.q.own.claimed=3;
  assert.equal(revealCue(before,after),'correct');
});
test('Audio waits for browser interaction and plays the opening theme only once',async()=>{
  const h=harness();h.audio.setMusic('lobby');h.audio.play('correct');
  assert.equal(h.contexts,0);assert.equal(h.notes.length,0);
  assert.equal(await h.audio.unlock(),true);
  assert.equal(h.contexts,1);assert.equal(h.timers.length,1);
  const count=h.notes.length;await h.audio.unlock();
  assert.equal(h.notes.length,count);assert.equal(h.timers.length,1);
  assert.equal(h.audio.introPlayed,true);h.audio.stop();
});
test('Mute stops current effects and music; reenabling does not replay the intro',async()=>{
  const h=harness();await h.audio.unlock();h.audio.play('correct');
  assert.ok(h.audio.voices.size>0);h.audio.setEnabled(false);
  assert.equal(h.audio.voices.size,0);assert.equal(h.timers[0].cancelled,true);
  assert.equal(h.audio.master.gain.value,0);
  const count=h.notes.length;h.audio.play('incorrect');assert.equal(h.notes.length,count);
  h.audio.setEnabled(true);assert.equal(h.audio.master.gain.value,1);
  assert.ok(h.notes.length>count);assert.equal(h.audio.introPlayed,true);h.audio.stop();
});
test('Round transitions replace the music loop and off removes all background notes',async()=>{
  const h=harness();await h.audio.unlock();h.audio.setMusic('round');
  assert.equal(h.timers.length,2);assert.equal(h.timers[0].cancelled,true);
  h.audio.setMusic('round');assert.equal(h.timers.length,2);
  h.audio.setMusic('off');assert.equal(h.timers[1].cancelled,true);
  assert.ok([...h.audio.voices].every(voice=>voice.channel!=='music'));
  h.audio.stop();
});
test('Wrong-answer buzzer and correct-answer chime use different note patterns',async()=>{
  const h=harness();h.audio.setMusic('off');await h.audio.unlock();h.notes.length=0;
  h.audio.play('incorrect');assert.deepEqual(h.notes.map(note=>note.hz),[190,125]);
  h.notes.length=0;h.audio.play('correct');assert.deepEqual(h.notes.map(note=>note.hz),[784,988,1175,1568]);
  h.audio.stop();
});
test('A blocked audio context fails gracefully and does not schedule music',async()=>{
  const h=harness();h.context.resume=async()=>{throw new Error('Autoplay blocked');};
  assert.equal(await h.audio.unlock(),false);
  assert.equal(h.notes.length,0);assert.equal(h.timers.length,0);
});
test('Music stays continuous across scheduler callbacks and uses different waiting/game rhythms',async()=>{
  const h=harness();h.audio.introPlayed=true;await h.audio.unlock();
  assert.equal(h.timers[0].delay,100);
  for(let i=1;i<=30;i++){h.context.currentTime=i*.1;h.timers[0].callback();}
  const intervals=h.notes.map(note=>[note.started,note.ends]).sort((a,b)=>a[0]-b[0]);
  let end=intervals[0][1];
  for(const [start,stop] of intervals){assert.ok(start<=end,'Unexpected silent gap in waiting music');end=Math.max(end,stop);}
  assert.ok(end>h.context.currentTime+1);
  const count=h.notes.length;h.audio.setMusic('round');
  assert.notEqual(h.notes[count].hz,h.notes[0].hz);
  assert.ok(h.notes[count].ends-h.notes[count].started<h.notes[0].ends-h.notes[0].started);
  h.audio.stop();
});
test('Settings can play button clicks without starting an intro or background music',async()=>{
  const h=harness({intro:false});await h.audio.unlock();
  assert.equal(h.notes.length,0);assert.equal(h.timers.length,0);
  h.audio.play('click');assert.equal(h.notes.length,1);assert.equal(h.notes[0].hz,620);
  h.audio.setEnabled(false);h.audio.play('click');assert.equal(h.notes.length,1);
});
test('Rapid repeated clicks are throttled and never accumulate overlapping click notes',async()=>{
  const h=harness({intro:false});await h.audio.unlock();
  for(let i=0;i<20;i++)h.audio.play('click');
  assert.equal(h.notes.length,1);
  h.context.currentTime=.1;h.audio.play('click');
  assert.equal(h.notes.length,2);
  assert.equal([...h.audio.voices].filter(voice=>voice.channel==='click').length,1);
  h.audio.stop();
});
test('A new reveal effect replaces the old effect without stopping background music',async()=>{
  const h=harness();await h.audio.unlock();h.audio.play('correct');
  h.audio.play('incorrect');
  assert.equal([...h.audio.voices].filter(voice=>voice.channel==='effect').length,2);
  assert.ok([...h.audio.voices].some(voice=>voice.channel==='music'));
  h.audio.stop();
});
test('Autoplay starts immediately when the browser already permits the audio context to run',async()=>{
  const h=harness();h.context.state='running';
  h.context.resume=async()=>{throw new Error('Already running; resume is unnecessary');};
  assert.equal(await h.audio.unlock(),true);
  assert.ok(h.notes.length>0);assert.equal(h.timers.length,1);h.audio.stop();
});
test('A reveal received before audio is ready plays once after startup completes',async()=>{
  const h=harness({intro:false});let ready;
  h.context.resume=()=>new Promise(resolve=>{ready=()=>{h.context.state='running';resolve();};});
  const starting=h.audio.unlock();h.audio.play('incorrect');
  assert.equal(h.notes.length,0);ready();await starting;
  assert.deepEqual(h.notes.map(note=>note.hz),[190,125]);
  const count=h.notes.length;await h.audio.unlock();assert.equal(h.notes.length,count);
  assert.equal(h.audio.pendingEffect,null);h.audio.stop();
});
test('Tetot temporarily lowers background volume without interrupting the music loop',async()=>{
  const h=harness();await h.audio.unlock();const timer=h.audio.timer;
  h.audio.play('incorrect');
  assert.equal(h.audio.timer,timer);
  assert.ok(h.audio.musicGain.gain.events.some(event=>event[0]==='set'&&event[1]===.15));
  assert.ok(h.audio.musicGain.gain.events.some(event=>event[0]==='ramp'&&event[1]===1));
  h.audio.stop();
});
