import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimateSms} from './leadMessageTemplates';
test('SMS estimation shares exact GSM extension and UTF-16 boundaries with the Rust contract',()=>{
  const cases=JSON.parse(readFileSync(new URL('../../contracts/lead-sms-cases.json',import.meta.url),'utf8')) as Array<{text:string;estimate:{encoding:string;units:number;segments:number}}>;
  for(const c of cases)assert.deepEqual(estimateSms(c.text),c.estimate);
});
