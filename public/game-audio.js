export function revealCue(previous,next){
  if(!previous||previous.cur!==next.cur||previous.generation!==next.generation)return null;
  const before=previous.run?.[previous.cur],after=next.run?.[next.cur];
  if(!before||!after)return null;
  const opened=after.open.filter(id=>!before.open.includes(id));
  if(!opened.length)return null;
  return opened.some(id=>after.own[id]!==undefined)?'correct':'incorrect';
}

export class GameAudio {
  constructor({enabled=true,createContext=()=>new AudioContext(),setTimer=setInterval,clearTimer=clearInterval,onChange=()=>{}}={}){
    this.enabled=enabled;this.createContext=createContext;this.setTimer=setTimer;this.clearTimer=clearTimer;this.onChange=onChange;
    this.unlocked=false;this.introPlayed=false;this.music='lobby';this.timer=null;this.voices=new Set();
  }
  async unlock(){
    if(!this.enabled)return false;
    try{
      if(!this.context){
        this.context=this.createContext();this.master=this.context.createGain();
        this.master.gain.value=1;this.master.connect(this.context.destination);
        this.context.onstatechange=()=>{
          if(this.context.state!=='running'){this.unlocked=false;this.stop();}
          this.onChange();
        };
      }
      if(this.context.state!=='running')await this.context.resume();
      if(!this.enabled||this.context.state!=='running')return false;
      this.unlocked=true;
      if(!this.introPlayed){this.introPlayed=true;this.play('intro');}
      this.startMusic();this.onChange();return true;
    }catch{this.unlocked=false;this.onChange();return false;}
  }
  tone(frequency,delay,duration,type='sine',volume=.12,channel='effect'){
    if(!this.enabled||!this.unlocked||this.context?.state!=='running')return;
    const oscillator=this.context.createOscillator(),gain=this.context.createGain(),at=this.context.currentTime+delay;
    const voice={oscillator,gain,channel};
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain);gain.connect(this.master);this.voices.add(voice);
    oscillator.onended=()=>{this.voices.delete(voice);oscillator.disconnect();gain.disconnect();};
    oscillator.start(at);oscillator.stop(at+duration);
  }
  play(kind){
    if(kind==='incorrect'){
      this.tone(190,0,.23,'sawtooth',.12);this.tone(125,.25,.48,'sawtooth',.12);
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
  setMusic(mode){
    if(this.music===mode){this.startMusic();return;}
    this.stopMusic();this.music=mode;this.startMusic();
  }
  startMusic(){
    if(this.timer!==null||!this.enabled||!this.unlocked||this.music==='off')return;
    let bar=0;
    const schedule=()=>{
      if(!this.enabled||!this.unlocked)return;
      const round=this.music==='round',roots=[131,110,147,98],root=roots[bar++%roots.length];
      const notes=round?[1,2,1,2,1.5,2,1.5,2]:[2,2.5,3,4,3,2.5,2,1.5];
      notes.forEach((ratio,i)=>this.tone(root*ratio,.03+i*.25,.19,round?'triangle':'sine',round?.035:.018,'music'));
      [0,1].forEach(at=>this.tone(root,.03+at,.7,'sine',round?.045:.025,'music'));
    };
    schedule();this.timer=this.setTimer(schedule,2000);
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
  stop(){this.stopMusic();this.stopVoices();}
}
