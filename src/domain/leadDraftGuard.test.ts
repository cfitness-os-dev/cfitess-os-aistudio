import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerLeadDraft,hasLeadDraft,confirmLeadDraftNavigation,installLeadDraftPrompt,discardLeadDrafts} from './leadDraftGuard';
test('draft guards keep navigation cancelled until explicit discard and release on unmount',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  const a=registerLeadDraft(); const b=registerLeadDraft();
  try {
    Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>false}});
    assert.equal(confirmLeadDraftNavigation(),false);a();assert.equal(hasLeadDraft(),true);
    Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true}});
    assert.equal(confirmLeadDraftNavigation(),true);b();assert.equal(hasLeadDraft(),false);
    assert.equal(confirmLeadDraftNavigation(),true);
  } finally {a();b();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});
test('application prompt postpones navigation until the discard action, without a native browser dialog',()=>{
  const unregister=registerLeadDraft();let pending:(()=>void)|undefined;let navigated=false;
  const uninstall=installLeadDraftPrompt(action=>{pending=action;});
  try {
    assert.equal(confirmLeadDraftNavigation(()=>{navigated=true;}),false);
    assert.equal(navigated,false);assert.ok(pending);assert.equal(hasLeadDraft(),true);
    discardLeadDrafts();pending();assert.equal(navigated,true);assert.equal(hasLeadDraft(),false);
  } finally {unregister();uninstall();}
});
