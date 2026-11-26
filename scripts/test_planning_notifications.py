"""Disposable loopback-only recipe: published planning changes and own notification inbox."""
import json,os,socket,subprocess,tempfile,time,urllib.request,urllib.error
from pathlib import Path
def main():
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 base=f'http://127.0.0.1:{port}';checks=[]
 with tempfile.TemporaryDirectory(prefix='rh-planning-',dir=os.environ['TMPDIR']) as folder:
  env={**os.environ,'TMPDIR':os.environ['TMPDIR'],'CFITNESS_ENV':'demo','CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1','CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':folder,'CFITNESS_HEITZ_LIVE_READS_ENABLED':'0','CFITNESS_HEITZ_WORKER':'0','CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0','HEITZ_WS_URL':'http://127.0.0.1:9','OLLAMA_BASE_URL':'http://127.0.0.1:9','RUST_LOG':'error'}
  def call(method,path,token=None,body=None):
   h={'Content-Type':'application/json','x-cfitness-site-id':'club-beynost'}
   if token:h['Authorization']='Bearer '+token
   try:
    with urllib.request.urlopen(urllib.request.Request(base+path,method=method,headers=h,data=None if body is None else json.dumps(body).encode()),timeout=5) as r:return r.status,json.load(r)
   except urllib.error.HTTPError as e:return e.code,None
  def ok(r):assert r[0] in (200,201),r[0];return r[1]
  def start():
   p=subprocess.Popen([os.environ['CFITNESS_TEST_BINARY']],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   for _ in range(100):
    try:
     if call('GET','/api/health')[0]==200:return p
    except OSError:pass
    time.sleep(.05)
   p.terminate();p.wait(timeout=5);raise RuntimeError('Server unavailable')
  def login(actor,pin):return ok(call('POST','/api/auth/login',body={'emailOrId':actor,'pinOrPassword':pin}))['sessionToken']
  p=start()
  try:
   admin=login('emp-mario','1010');chloe=login('emp-chloe','5320')
   def notifications(token):return [n for n in ok(call('GET','/api/me/notifications/beynost',token))['notifications'] if n['type']=='rh_planning']
   initial_c=len(notifications(chloe));initial_a=len(notifications(admin))
   payload=dict(siteId='club-beynost',employeeId='emp-chloe',date='2026-12-18',startTime='09:00',endTime='17:00',breakMinutes=30,roleLabel='PRIVATE TASK',positionId='pos-bey-accueil',published=False)
   assert call('POST','/api/shifts',chloe,payload)[0]==403
   shift=ok(call('POST','/api/shifts',admin,payload));path='/api/shifts/'+shift['id']
   assert len(notifications(chloe))==initial_c
   ok(call('PATCH',path,admin,dict(endTime='18:00')));assert len(notifications(chloe))==initial_c
   checks.append('employee write refused; creation and editing draft emit no alert')
   ok(call('PATCH',path,admin,dict(published=True)))
   assert len(notifications(chloe))==initial_c+1 and len(notifications(admin))==initial_a
   ok(call('PATCH',path,admin,dict(published=True)));assert len(notifications(chloe))==initial_c+1
   checks.append('first publication targets only assigned employee; unchanged PATCH creates no duplicate')
   ok(call('PATCH',path,admin,dict(endTime='19:00')));assert len(notifications(chloe))==initial_c+2
   ok(call('PATCH',path,admin,dict(employeeId='emp-mario')))
   assert len(notifications(chloe))==initial_c+3 and len(notifications(admin))==initial_a+1
   checks.append('published edit notifies employee; reassignment informs previous and new owner')
   ok(call('PATCH',path,admin,dict(published=False)));assert len(notifications(admin))==initial_a+2
   ok(call('DELETE',path,admin));assert len(notifications(admin))==initial_a+2
   checks.append('unpublication informs previous owner; deleting draft stays silent')
   shift=ok(call('POST','/api/shifts',admin,{**payload,'published':True}));path='/api/shifts/'+shift['id'];current=len(notifications(chloe))
   snapshot=Path(folder,'cfitness_state.json').read_bytes();blocker=Path(folder,'cfitness_state.json.tmp');blocker.mkdir()
   assert call('PATCH',path,admin,dict(endTime='20:00'))[0]==500
   assert call('DELETE',path,admin)[0]==500
   assert call('POST','/api/shifts',admin,{**payload,'published':True})[0]==500
   assert len(notifications(chloe))==current and Path(folder,'cfitness_state.json').read_bytes()==snapshot
   own=ok(call('GET','/api/me/workspace/beynost',chloe));assert next(s for s in own['shifts'] if s['id']==shift['id'])['endTime']=='17:00'
   blocker.rmdir();ok(call('DELETE',path,admin));assert len(notifications(chloe))==current+1
   checks.append('create/update/delete disk failures keep planning, notifications and disk unchanged; retry succeeds')
   assert 'PRIVATE' not in json.dumps(notifications(chloe))
   assert all(n.get('targetPage')=='planning' for n in notifications(chloe))
   checks.append('notification excludes private task content and targets personal planning')
   expected=len(notifications(chloe));p.terminate();p.wait(timeout=5);p=start();chloe=login('emp-chloe','5320')
   assert len(notifications(chloe))==expected
   checks.append('planning alerts survive server restart')
  finally:p.terminate();p.wait(timeout=5)
 print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
