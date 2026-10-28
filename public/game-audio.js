export function revealCue(previous,next){
  if(!previous||previous.cur!==next.cur||previous.generation!==next.generation)return null;
  const before=previous.run?.[previous.cur],after=next.run?.[next.cur];
  if(!before||!after)return null;
  const opened=after.open.filter(id=>!before.open.includes(id));
  if(!opened.length)return null;
  return opened.some(id=>after.own[id]!==undefined)?'correct':'incorrect';
}

export class GameAudio {
  constructor({enabled=true,intro=true,createContext=()=>new AudioContext(),setTimer=(callback,delay)=>globalThis.setInterval(callback,delay),clearTimer=timer=>globalThis.clearInterval(timer),onChange=()=>{}}={}){
    this.enabled=enabled;this.createContext=createContext;this.setTimer=setTimer;this.clearTimer=clearTimer;this.onChange=onChange;
    this.unlocked=false;this.introPlayed=!intro;this.music=intro?'lobby':'off';this.timer=null;this.voices=new Set();
    this.lastClickAt=-Infinity;
    this.pendingEffect=null;
    this.countdownKey=null;
  }
  async unlock(){
    if(!this.enabled)return false;
    try{
      if(!this.context){
        this.context=this.createContext();this.master=this.context.createGain();
        this.master.gain.value=1;this.master.connect(this.context.destination);
        this.musicGain=this.context.createGain();this.musicGain.gain.value=1;this.musicGain.connect(this.master);
        this.context.onstatechange=()=>{
          if(this.context.state!=='running'){
            this.unlocked=false;this.stopMusic();this.stopVoices();this.lastClickAt=-Infinity;
          }
          this.onChange();
        };
      }
      if(this.context.state!=='running')await this.context.resume();
      if(!this.enabled||this.context.state!=='running')return false;
      this.unlocked=true;
      if(!this.introPlayed){this.introPlayed=true;this.play('intro');}
      this.startMusic();
      const pending=this.pendingEffect;this.pendingEffect=null;
      if(pending&&pending.expires>Date.now())this.play(pending.kind);
      this.onChange();return true;
    }catch{this.unlocked=false;this.onChange();return false;}
  }
  tone(frequency,delay,duration,type='sine',volume=.12,channel='effect'){
    if(!this.enabled||!this.unlocked||this.context?.state!=='running')return;
    const oscillator=this.context.createOscillator(),gain=this.context.createGain(),at=this.context.currentTime+delay;
    const voice={oscillator,gain,channel};
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+(channel==='music'?.025:.008));
    if(channel==='music')gain.gain.setValueAtTime(volume,at+Math.max(.025,duration-.06));
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain);gain.connect(channel==='music'?this.musicGain:this.master);this.voices.add(voice);
    oscillator.onended=()=>{this.voices.delete(voice);oscillator.disconnect();gain.disconnect();};
    oscillator.start(at);oscillator.stop(at+duration);
  }
  play(kind){
    if(!this.enabled)return;
    if(!this.unlocked||this.context?.state!=='running'){
      if(['correct','incorrect','podium'].includes(kind))this.pendingEffect={kind,expires:Date.now()+2500};
      return;
    }
    if(kind==='click'){
      const now=this.context.currentTime;
      if(now-this.lastClickAt<.09)return;
      this.lastClickAt=now;this.stopVoices('click');
      this.tone(620,0,.06,'triangle',.055,'click');
      return;
    }
    this.stopVoices('effect');
    if(['correct','incorrect','podium'].includes(kind)){
      const gain=this.musicGain.gain,now=this.context.currentTime;
      gain.cancelScheduledValues(now);gain.setValueAtTime(.15,now);
      gain.setValueAtTime(.15,now+(kind==='podium'?1.5:.8));
      gain.linearRampToValueAtTime(1,now+(kind==='podium'?1.8:1.1));
    }
    if(kind==='incorrect'){
      this.tone(190,0,.25,'sawtooth',.22);this.tone(125,.28,.5,'sawtooth',.22);
    }else if(kind==='correct'){
      [784,988,1175,1568].forEach((note,i)=>this.tone(note,i*.09,.28,'triangle',.18));
    }else if(kind==='intro'){
      [392,523,659,784,659,784,1047].forEach((note,i)=>this.tone(note,i*.14,.3,'triangle',.11));
    }else if(kind==='podium'){
      [523,659,784,1047,784,1047,1319].forEach((note,i)=>this.tone(note,i*.17,.42,'triangle',.16));
    }
  }
  setEnabled(enabled){
    this.enabled=enabled;
    if(this.master)this.master.gain.value=enabled?1:0;
    if(!enabled)this.stop();else this.startMusic();
    this.onChange();
  }
  countdown(key,startsAt,serverNow){
    if(!this.enabled||!this.unlocked||this.context?.state!=='running'||startsAt<=serverNow||this.countdownKey===key)return;
    this.cancelCountdown();this.stopVoices('effect');this.countdownKey=key;
    for(let number=Math.min(5,Math.ceil((startsAt-serverNow)/1000));number>=1;number--){
      const delay=Math.max(0,(startsAt-number*1000-serverNow)/1000);
      this.tone(660,delay,.16,'square',.13,'countdown');
    }
    const go=(startsAt-serverNow)/1000;
    this.tone(1047,go,.2,'triangle',.2,'countdown');
    this.tone(1568,go+.12,.35,'triangle',.18,'countdown');
  }
  cancelCountdown(){this.stopVoices('countdown');this.countdownKey=null;}
  setMusic(mode){
    if(this.music===mode){this.startMusic();return;}
    this.stopMusic();this.music=mode;this.startMusic();
  }
  startMusic(){
    if(this.timer!==null||!this.enabled||!this.unlocked||this.music==='off')return;
    let step=0,nextAt=this.context.currentTime+.03;
    const schedule=()=>{
      if(!this.enabled||!this.unlocked||this.context.state!=='running')return;
      const now=this.context.currentTime,round=this.music==='round',beat=round?.25:.42;
      // Schedule ahead on the audio clock; interval delays no longer separate musical phrases.
      nextAt=Math.max(nextAt,now+.015);
      while(nextAt<now+1.25){
        const roots=round?[146.83,130.81,116.54,110]:[130.81,110,87.31,98];
        const root=roots[Math.floor(step/8)%roots.length],delay=nextAt-this.context.currentTime;
        const melody=round?[2,3,4,3,2,4,3,4]:[2,2.5,3,4,3,2.5,2,3];
        this.tone(root*melody[step%8],delay,beat*1.12,round?'triangle':'sine',round?.035:.025,'music');
        if(step%8===0){
          const third=round?1.2:1.25;
          [1,third,1.5].forEach(ratio=>this.tone(root*ratio,delay,beat*8+.12,'sine',.012,'music'));
        }
        if(step%2===0)this.tone(root/2,delay,beat*2+.06,'triangle',round?.035:.02,'music');
        if(round)this.tone(step%2?880:73.42,delay,.09,step%2?'triangle':'sine',.012,'music');
        nextAt+=beat;step++;
      }
    };
    schedule();this.timer=this.setTimer(schedule,100);
  }
  stopMusic(){
    if(this.timer!==null){this.clearTimer(this.timer);this.timer=null;}
    this.stopVoices('music');
  }
  stopVoices(channel){
    for(const voice of [...this.voices])if(!channel||voice.channel===channel){
      try{voice.oscillator.stop();}catch{}
      voice.oscillator.disconnect();voice.gain.disconnect();this.voices.delete(voice);
    }
  }
  stop(){this.stopMusic();this.stopVoices();this.lastClickAt=-Infinity;this.pendingEffect=null;this.countdownKey=null;}
}
