"""Disposable Rust + fake Heitz on loopback only. No vendor credentials or real writes."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def main():
    binary=str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    phase=[0];requests=[];read_ids=[];started=threading.Event();release=threading.Event()
    class HeitzStub(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def reply(self,value,code=200):
            raw=json.dumps(value).encode();self.send_response(code);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        def do_POST(self):
            requests.append(('POST',self.path.split('?')[0]))
            if self.path.startswith('/api/developer/getToken'):
                self.rfile.read(int(self.headers.get('Content-Length',0)));self.reply({'token':'fictive-only'})
            else:self.reply({'error':'Unexpected write to fake Heitz'},405)
        def do_GET(self):
            path=urllib.parse.urlparse(self.path).path;requests.append(('GET',path))
            if path=='/api/users/search':
                row={'id':501,'firstName':'Fictif','lastName':'Recette','idCenter':3845,'type':0,'_subscriptions':[],'_finBalance':0 if phase[0]==3 else -80}
                if phase[0]==1:del row['_finBalance']
                if phase[0]==2:row['finBalance']=0
                self.reply([row,{**row,'id':502,'idCenter':4967}])
            elif path in ['/api/userScheduledPayments/provisional','/api/userScheduledPayments/display','/api/userSubscriptions']:
                read_ids.append(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('idClient'))
                if path.endswith('/provisional'):
                    if phase[0]==4:started.set();release.wait(timeout=5)
                    self.reply([dict(date='bad' if phase[0]==1 else '2026-12-01T00:00:00Z',valuePayment=0,valueSale=-12,valuePoints=0,privateField='not projected')])
                elif path.endswith('/display'):
                    if phase[0]==2:self.reply({'error':'fictive private error'},403)
                    else:self.reply([dict(id=1,label='Echeancier fictif',totalSale='12.00 EUR (TVA 20%)',totalPayment='12.00 EUR - PRELEVEMENT')])
                else:self.reply([dict(id=2,accessLabel='Acces fictif',idClient=502 if phase[0]==3 else 501)])
            elif path=='/api/ticket':self.reply([{'id':900,'creationIdCenter':3845,'printTotal':None if phase[0]==5 else -15}])
            elif path.startswith('/api/fmi/date/'):self.reply({'internalIn':{'H24':0},'internalPresent':{'H0':0}})
            elif path in ['/api/userPassages/browse','/api/employee/list','/api/planning/configuration/rooms']:self.reply([])
            else:self.reply({'error':'Unexpected read path'},404)
    stub=ThreadingHTTPServer(('127.0.0.1',0),HeitzStub);threading.Thread(target=stub.serve_forever,daemon=True).start()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='heitz-readers-',dir=os.environ['TMPDIR']) as directory:
        statefile=Path(directory)/'cfitness_state.json'
        env={**os.environ,'CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':directory,'CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1','CFITNESS_HEITZ_WORKER':'0','CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0','HEITZ_DEV_ID':'fictive-id','HEITZ_DEV_KEY':'fictive-key','HEITZ_WS_URL':f'http://127.0.0.1:{stub.server_port}','HEITZ_CENTER_ID_CDS':'3845','HEITZ_CENTER_ID_BEY':'4967','OLLAMA_BASE_URL':'http://127.0.0.1:9'}
        env['CFITNESS_HEITZ_CRM_ROOT_CDS']='https://heitz.example.test/app/heitz/3845/crm/'
        # Deliberate centre mismatch: it must never yield a link to the wrong club.
        env['CFITNESS_HEITZ_CRM_ROOT_BEY']='https://heitz.example.test/app/heitz/3845/crm/'
        def call(method,path,token=None,body=None):
            headers={'Content-Type':'application/json','x-cfitness-site-id':'club-carre-soie'}
            if token:headers['Authorization']='Bearer '+token
            req=urllib.request.Request(base+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(req,timeout=10) as r:return r.status,json.load(r)
            except urllib.error.HTTPError as e:return e.code,json.load(e)
        def start():
            p=subprocess.Popen([binary],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call('GET','/api/health')[0]==200:return p
                except (OSError,urllib.error.URLError):pass
                time.sleep(.05)
            p.terminate();p.wait();raise RuntimeError('Local server unavailable')
        def stop(p):p.terminate();p.wait(timeout=5)
        def login(actor,secret):
            code,v=call('POST','/api/auth/login',body={'emailOrId':actor,'pinOrPassword':secret});assert code==200,(code,v);return v['sessionToken']
        proc=start()
        try:
            admin=login('emp-mario',os.environ['CFITNESS_TEST_ADMIN_SECRET'])
            employee=login('emp-chloe',os.environ['CFITNESS_TEST_COMMERCIAL_SECRET'])
            assert call('POST','/api/heitz/sync-live')[0]==401
            assert call('POST','/api/heitz/sync-live',employee)[0]==403 and not requests
            assert call('POST','/api/heitz/sync-live',admin)[0]==200
            code,cases=call('GET','/api/recovery/cases',admin);assert code==200
            c=next(c for c in cases if c['memberId']=='hz-501')
            route='/api/recovery/cases/'+c['id']
            def evidence():
                code,v=call('GET',route+'/evidence',admin);assert code==200;return v
            def reading(token=admin,revision=None):return call('GET',route+'/heitz-readings?revision='+(revision or evidence()['revision']),token)
            sarah=login('emp-sarah',os.environ['CFITNESS_TEST_MANAGER_SECRET'])
            other=next(row for row in cases if row['memberId']=='hz-502')
            code,other_evidence=call('GET','/api/recovery/cases/'+other['id']+'/evidence',admin);assert code==200
            requests.clear();before=statefile.read_bytes()
            access=route+'/heitz-access-links?revision='+evidence()['revision']
            assert call('GET',access)[0]==401
            assert call('GET',access,employee)[0]==403
            assert call('GET',route+'/heitz-access-links?revision=old',admin)[0]==409
            other_access='/api/recovery/cases/'+other['id']+'/heitz-access-links?revision='+other_evidence['revision']
            assert call('GET',other_access,sarah)[0]==403
            code,unconfigured=call('GET',other_access,admin)
            assert code==200 and not unconfigured['configured'] and unconfigured['urls'] is None
            code,access_value=call('GET',access,admin)
            assert code==200 and access_value['configured']
            assert access_value['urls']['documents']=='https://heitz.example.test/app/heitz/3845/crm/#/app/client/501/document'
            assert access_value['urls']['financial'].endswith('/501/financial')
            assert not requests and statefile.read_bytes()==before
            assert call('GET','/api/recovery/cases/'+other['id']+'/heitz-readings?revision='+other_evidence['revision'],sarah)[0]==403
            assert not requests
            assert call('GET',route+'/heitz-readings?revision=x')[0]==401
            assert reading(employee)[0]==403
            assert reading(revision='stale')[0]==409
            assert not requests
            code,v=reading();assert code==200,(code,v)
            assert not v['partial'] and not v['paymentsCollected'] and v['signatureStatus']=='not_checked'
            assert v['provisional']['items'][0]['valuePayment']==0
            assert v['display']['items'][0]['totalPayment']=='12.00 EUR - PRELEVEMENT'
            assert 'not projected' not in json.dumps(v)
            assert before==statefile.read_bytes()
            for mode,section in [(1,'provisional'),(2,'display'),(3,'subscriptions')]:
                phase[0]=mode;code,v=reading();assert code==200 and v['partial']
                assert v[section]['status']=='unavailable' and v[section]['items'] is None
                assert 'private error' not in json.dumps(v)
                assert before==statefile.read_bytes()
            code,manual=call('POST','/api/recovery/cases',admin,{'memberId':'hz-501','memberName':'Dossier manuel fictif','clubId':'carre-de-soie','amountDueEur':80});assert code==201
            code,m=call('GET','/api/recovery/cases/'+manual['id']+'/evidence',admin);assert code==200
            count=len(requests)
            assert call('GET','/api/recovery/cases/'+manual['id']+'/heitz-readings?revision='+m['revision'],admin)[0]==409
            assert call('GET','/api/recovery/cases/'+manual['id']+'/heitz-access-links?revision='+m['revision'],admin)[0]==409
            assert len(requests)==count
            import concurrent.futures
            phase[0]=4;revision=evidence()['revision']
            with concurrent.futures.ThreadPoolExecutor() as pool:
                pending=pool.submit(reading,admin,revision);assert started.wait(timeout=5)
                assert call('PATCH',route+'/status',admin,{'status':'regularise','note':'Recette fictive concurrente'})[0]==200
                release.set();assert pending.result(timeout=10)[0]==409
            assert all(ids==['501'] for ids in read_ids)
            assert not any(path=='/api/userDocument' for _,path in requests)
            assert all(method=='GET' or (method=='POST' and path=='/api/developer/getToken') for method,path in requests)
            print('PASS: reader and access-link auth/club/revision/identity, mismatched centre returns no links, links without provider requests or disk changes, manual identity rejected, 3 documented GET queries, forecast not receipt, failure not empty, projection privacy, changed dossier discarded, no document scan or provider write')
        finally:
            if proc is not None:stop(proc)
            stub.shutdown();stub.server_close()


if __name__=='__main__':main()
