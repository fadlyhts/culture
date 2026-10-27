export const MAIN_QUESTIONS=5, EXTRA_QUESTIONS=2;
export function ranking(teams){
  const ordered=teams.map((t,i)=>({...t,i})).sort((a,b)=>b.score-a.score||a.i-b.i);
  return ordered.map(t=>({...t,rank:1+ordered.filter(x=>x.score>t.score).length}));
}
export function podiumReady(teams){
  const o=ranking(teams);
  return o[0].score>o[1].score&&o[1].score>o[2].score&&o[2].score>o[3].score&&o[2].score>0;
}
export function segmentEnd(index,count,teams){
  if(index>=Math.min(count,MAIN_QUESTIONS+EXTRA_QUESTIONS)-1)return 'podium';
  if(index===MAIN_QUESTIONS-1)return podiumReady(teams)?'podium':'extra';
  return null;
}
