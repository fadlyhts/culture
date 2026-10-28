import {MAIN_QUESTIONS} from './game-flow.js';

export function bankEntries(questions,bank){
  return questions.map((question,index)=>({question,index,number:bank==='extra'?index-MAIN_QUESTIONS+1:index+1}))
    .filter(entry=>bank==='extra'?entry.index>=MAIN_QUESTIONS:entry.index<MAIN_QUESTIONS);
}

export function insertQuestion(questions,bank,question,afterId){
  if(bank==='extra'&&questions.length<MAIN_QUESTIONS)throw new Error('Lengkapi 5 soal utama sebelum menambahkan soal tambahan.');
  if(bank!=='extra'&&questions.length>=MAIN_QUESTIONS)throw new Error('Soal utama maksimal 5. Tambahkan soal berikutnya melalui menu Soal tambahan.');
  const entries=bankEntries(questions,bank),after=entries.find(entry=>entry.question.id===afterId);
  const result=[...questions];
  result.splice(after?after.index+1:questions.length,0,question);
  return result;
}

export function replaceBank(questions,bank,replacement){
  if(bank==='extra'){
    if(questions.length<MAIN_QUESTIONS)throw new Error('Lengkapi 5 soal utama terlebih dahulu.');
    return [...questions.slice(0,MAIN_QUESTIONS),...replacement];
  }
  if(!replacement.length||replacement.length>MAIN_QUESTIONS)throw new Error('Isi 1–5 soal utama.');
  const extras=questions.slice(MAIN_QUESTIONS);
  if(extras.length&&replacement.length!==MAIN_QUESTIONS)throw new Error('Tetap diperlukan 5 soal utama jika ada soal tambahan.');
  return [...replacement,...extras];
}
