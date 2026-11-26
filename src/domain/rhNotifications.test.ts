import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNotifications} from './rhNotifications';
const page=()=>({employeeId:'chloe',clubId:'beynost',demoMode:true,unreadCount:1,total:1,unreadOnly:false,nextCursor:null,notifications:[{id:'n',employeeId:'chloe',clubId:'beynost',title:'Information',message:'Texte',createdAt:'2026-11-26T09:00:00Z',read:false}]});
test('notification counter accepts actual zero, never an invalid count',()=>{
 assert.equal(validateNotifications(page(),'chloe','beynost',false).unreadCount,1);
 assert.equal(validateNotifications({...page(),notifications:[],unreadCount:0,total:0},'chloe','beynost',false).unreadCount,0);
 for(const unreadCount of [-1,1.5,NaN,2])assert.throws(()=>validateNotifications({...page(),unreadCount},'chloe','beynost',false));
});
test('notifications refuse another account, club, mixed ownership or duplicate ids',()=>{
 assert.throws(()=>validateNotifications(page(),'mario','beynost',false));
 assert.throws(()=>validateNotifications(page(),'chloe','carre-de-soie',false));
 assert.throws(()=>validateNotifications({...page(),notifications:[{...page().notifications[0],employeeId:'mario'}]},'chloe','beynost',false));
 assert.throws(()=>validateNotifications({...page(),total:2,notifications:[...page().notifications,...page().notifications]},'chloe','beynost',false));
});
test('unread selection and metadata must match the requested view',()=>{
 assert.throws(()=>validateNotifications(page(),'chloe','beynost',true));
 assert.throws(()=>validateNotifications({...page(),unreadOnly:true,notifications:[{...page().notifications[0],read:true}]},'chloe','beynost',true));
 assert.throws(()=>validateNotifications({...page(),nextCursor:5},'chloe','beynost',false));
});
