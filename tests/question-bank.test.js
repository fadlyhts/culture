import test from 'node:test';
import assert from 'node:assert/strict';
import {bankEntries,insertQuestion,replaceBank} from '../public/question-bank.js';

const questions=()=>Array.from({length:7},(_,i)=>({id:'q'+i,q:'Question '+i,a:[{id:'a'+i,t:'Answer '+i,p:10,al:''}]}));

test('Main and extra editors list distinct banks with separate numbering',()=>{
  const all=questions();
  assert.deepEqual(bankEntries(all,'main').map(x=>x.question.id),['q0','q1','q2','q3','q4']);
  assert.deepEqual(bankEntries(all,'extra').map(x=>[x.question.id,x.number]),[['q5',1],['q6',2]]);
  assert.deepEqual(bankEntries(all.slice(0,5),'extra'),[]);
});
test('Adding an extra question preserves all main questions and existing extra IDs',()=>{
  const all=questions(),extra={id:'new-extra',q:'New extra',a:[]};
  const updated=insertQuestion(all,'extra',extra,'q5');
  assert.deepEqual(updated.map(q=>q.id),['q0','q1','q2','q3','q4','q5','new-extra','q6']);
  assert.deepEqual(all.map(q=>q.id),questions().map(q=>q.id));
  assert.throws(()=>insertQuestion(all,'main',extra),/maksimal 5/);
  assert.throws(()=>insertQuestion(all.slice(0,4),'extra',extra),/Lengkapi 5/);
});
test('Importing or clearing extras never replaces main questions',()=>{
  const all=questions(),extra={id:'imported',q:'Imported extra',a:[]};
  const updated=replaceBank(all,'extra',[extra]);
  assert.deepEqual(updated.slice(0,5),all.slice(0,5));
  assert.deepEqual(updated.slice(5),[extra]);
  assert.equal(replaceBank(all,'extra',[]).length,5);
  assert.throws(()=>replaceBank(all,'main',all.slice(0,4)),/5 soal utama/);
});
