export function hostPage(path){
  if(path==='/settings/soal')return 'edit';
  if(path==='/settings/tambahan')return 'extra';
  if(path==='/')return 'play';
  return null;
}
