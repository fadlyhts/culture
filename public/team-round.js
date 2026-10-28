export function roundStatus(state,serverNow){
  if(state.locked)return {phase:'locked',seconds:0,progress:0};
  if(!state.started)return {phase:'waiting',seconds:30,progress:1};
  if(state.startsAt>serverNow)return {phase:'preparing',seconds:Math.ceil((state.startsAt-serverNow)/1000),progress:Math.min(1,(state.startsAt-serverNow)/5000)};
  if(!state.deadline)return {phase:'open',seconds:null,progress:1};
  const remaining=Math.max(0,state.deadline-serverNow);
  return {phase:remaining===0?'locked':remaining<=5000?'urgent':'open',seconds:Math.ceil(remaining/1000),progress:Math.min(1,remaining/30000)};
}
