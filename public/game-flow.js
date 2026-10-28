export const MAIN_QUESTIONS=5;
export function ranking(teams){
  const ordered=teams.map((t,i)=>({...t,i})).sort((a,b)=>b.score-a.score||a.i-b.i);
  return ordered.map(t=>({...t,rank:1+ordered.filter(x=>x.score>t.score).length}));
}
export function resolvePlaces(total,winners=[],baseline=Array(6).fill(0)){
  const result=winners.map(w=>({...w}));
  const remaining=total.map((score,team)=>({team,score:score-(baseline[team]||0)})).filter(t=>!result.some(w=>w.team===t.team)).sort((a,b)=>b.score-a.score||a.team-b.team);
  while(result.length<3&&remaining.length){
    const first=remaining[0];
    if(first.score<=0||remaining[1]?.score===first.score)break;
    result.push({team:first.team,rank:result.length+1,score:first.score});
    remaining.shift();
  }
  return result;
}
