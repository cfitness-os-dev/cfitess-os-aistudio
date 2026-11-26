import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedClub, readClubSelection, rememberClubSelection } from './clubSelection';
const store = () => {const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
test('club choice survives reload and stays specific to the account', () => {
  const storage=store();rememberClubSelection(storage,'mario','beynost');
  assert.equal(readClubSelection(storage,'mario',['carre-de-soie','beynost'],'carre-de-soie'),'beynost');
  assert.equal(readClubSelection(storage,'sarah',['carre-de-soie','beynost'],'carre-de-soie'),'carre-de-soie');
});
test('remembered club never overrides removed rights', () => {
  const storage=store();rememberClubSelection(storage,'mario','beynost');
  assert.equal(readClubSelection(storage,'mario',['carre-de-soie'],'carre-de-soie'),'carre-de-soie');
  assert.equal(authorizedClub('all',['beynost'],'carre-de-soie'),'beynost');
  assert.equal(authorizedClub('unknown',['beynost'],'carre-de-soie'),'beynost');
});
test('unavailable browser storage does not prevent authorized navigation', () => {
  const storage={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  assert.equal(readClubSelection(storage,'chloe',['beynost'],'beynost'),'beynost');
  assert.doesNotThrow(()=>rememberClubSelection(storage,'chloe','beynost'));
});
