import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describeHeitzCollection} from './heitzCollection';
test('partial collection never becomes a complete success or a confirmed payment',()=>{
  const text=describeHeitzCollection({ok:true,partialSync:true,syncedMembersCount:12});
  assert.match(text,/partielle/);assert.match(text,/Non collectés automatiquement : règlements détaillés, contrats, CGV/);
  assert.match(text,/ne constitue pas une preuve de règlement/);
  assert.ok(!text.includes('0 entrées'));
});
test('unknown or invalid collection counts cannot be presented as zero',()=>{
  for(const v of [null,{}, {ok:true,partialSync:false}, {ok:true,partialSync:false,syncedMembersCount:-1},{ok:true,partialSync:false,syncedMembersCount:'0'}])assert.throws(()=>describeHeitzCollection(v));
  assert.match(describeHeitzCollection({ok:true,partialSync:false,syncedMembersCount:0}),/0 fiches relues/);
});
