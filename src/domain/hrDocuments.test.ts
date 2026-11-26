import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRhDocuments,documentFile} from './hrDocuments';
const sample=()=>({actorId:'emp-chloe',clubId:'beynost',own:true,canUpload:true,maxBytes:4*1024*1024,categories:['Autre'],
 employees:[{id:'emp-chloe',name:'Chloé',canUpload:true}],documents:[{id:'d',employeeId:'emp-chloe',employeeName:'Chloé',title:'Notice',category:'Autre',
 fileName:'notice.pdf',mediaType:'application/pdf',byteLength:100,createdAt:'2026-11-26T12:00:00Z',acknowledgedAt:null,archivedAt:null}],nextCursor:null});
test('RH documents refuse a different account, club, employee or retired file in own space',()=>{
 assert.equal(validateRhDocuments(sample(),'emp-chloe','beynost',true).documents[0].id,'d');
 assert.throws(()=>validateRhDocuments(sample(),'emp-mario','beynost',true));
 assert.throws(()=>validateRhDocuments(sample(),'emp-chloe','carre-de-soie',true));
 assert.throws(()=>validateRhDocuments({...sample(),documents:[{...sample().documents[0],employeeId:'emp-mario'}]},'emp-chloe','beynost',true));
 assert.throws(()=>validateRhDocuments({...sample(),documents:[{...sample().documents[0],archivedAt:'2026-11-27T12:00:00Z'}]},'emp-chloe','beynost',true));
});
test('RH documents reject incomplete, forged, oversized and duplicated metadata',()=>{
 for(const row of [{...sample().documents[0],mediaType:'text/html'},{...sample().documents[0],byteLength:0},
  {...sample().documents[0],byteLength:4*1024*1024+1},{...sample().documents[0],createdAt:'invalid'}])
   assert.throws(()=>validateRhDocuments({...sample(),documents:[row]},'emp-chloe','beynost',true));
 assert.throws(()=>validateRhDocuments({...sample(),documents:[...sample().documents,...sample().documents]},'emp-chloe','beynost',true));
 assert.throws(()=>validateRhDocuments({...sample(),nextCursor:12},'emp-chloe','beynost',true));
});
test('RH file selection rejects unsupported type, mismatched MIME and empty content before reading',async()=>{
 for(const file of [new File(['hello'],'notice.html',{type:'text/html'}),new File(['hello'],'notice.pdf',{type:'text/html'}),new File([],'empty.pdf',{type:'application/pdf'})])
  await assert.rejects(documentFile(file));
});
