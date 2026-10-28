import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {hostPage} from '../public/host-pages.js';

test('Settings URLs serve the host shell without redirecting to the play page',async()=>{
  for(const path of ['/settings/soal','/settings/tambahan']){
    let assetURL;
    const response=await worker.fetch(new Request('https://quiz.example'+path),{
      ASSETS:{fetch:async request=>{assetURL=request.url;return new Response('host shell');}}
    });
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Location'),null);
    assert.equal(assetURL,'https://quiz.example/');
    assert.equal(await response.text(),'host shell');
    assert.notEqual(hostPage(path),'play');
  }
  assert.equal(hostPage('/'),'play');
});
test('Unrecognized settings paths do not become editor pages',async()=>{
  const request=new Request('https://quiz.example/settings/unknown');
  let forwarded;
  const response=await worker.fetch(request,{ASSETS:{fetch:async input=>{forwarded=input.url;return new Response('Missing',{status:404});}}});
  assert.equal(response.status,404);
  assert.equal(forwarded,request.url);
  assert.equal(hostPage('/settings/unknown'),null);
});
