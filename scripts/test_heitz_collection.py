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
    phase=[0];requests=[]
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
                self.reply([row])
            elif path=='/api/ticket':self.reply([{'id':900,'creationIdCenter':3845,'printTotal':None if phase[0]==5 else -15}])
            elif path.startswith('/api/fmi/date/'):self.reply({'internalIn':{'H24':0},'internalPresent':{'H0':0}})
            elif path in ['/api/userPassages/browse','/api/employee/list','/api/planning/configuration/rooms']:self.reply([])
            else:self.reply({'error':'Unexpected read path'},404)
    stub=ThreadingHTTPServer(('127.0.0.1',0),HeitzStub);threading.Thread(target=stub.serve_forever,daemon=True).start()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='heitz-collection-',dir=os.environ['TMPDIR']) as directory:
        statefile=Path(directory)/'cfitness_state.json'
        env={**os.environ,'CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':directory,'CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1','CFITNESS_HEITZ_WORKER':'0','CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0','HEITZ_DEV_ID':'fictive-id','HEITZ_DEV_KEY':'fictive-key','HEITZ_WS_URL':f'http://127.0.0.1:{stub.server_port}','HEITZ_CENTER_ID_CDS':'3845','HEITZ_CENTER_ID_BEY':'4967','OLLAMA_BASE_URL':'http://127.0.0.1:9'}
        env["CFITNESS_HEITZ_LOOPBACK_TESTS"]="1"
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
            kpis=json.loads(statefile.read_text())['kpis']
            code,summary=call('POST','/api/heitz/sync-live',admin);assert code==200,(code,summary)
            assert summary['financialCollection']=={'balancesRead':1,'ticketsRead':1,'paymentsCollected':False,'contractsCollected':False,'termsCollected':False,'revenueCalculated':False}
            def case():
                code,rows=call('GET','/api/recovery/cases',admin);assert code==200
                return next(c for c in rows if c['memberId']=='hz-501')
            initial=case();route='/api/recovery/cases/'+initial['id']+'/evidence'
            def evidence():
                code,v=call('GET',route,admin);assert code==200;return v
            for kind in ['contract','terms','debt_detail','payments']:
                code,v=call('POST',route,admin,{'expectedRevision':evidence()['revision'],'reviewConfirmed':True,'reason':'Recette fictive','command':{'action':'record','kind':kind,'reference':'REFERENCE-FICTIVE','version':'2026-01','signedOn':'2026-01-01'}});assert code==200,(code,v)
            assert evidence()['documented']
            for mode in [1,2]:
                phase[0]=mode;before=statefile.read_bytes()
                assert call('POST','/api/heitz/sync-live',admin)[0]==502
                assert statefile.read_bytes()==before and evidence()['documented']
            phase[0]=3;assert call('POST','/api/heitz/sync-live',admin)[0]==200
            settled=case();assert settled['amountDueEur']==0 and settled['status']=='regularise'
            phase[0]=4;assert call('POST','/api/heitz/sync-live',admin)[0]==200
            reopened=case();assert reopened['id']==initial['id'] and reopened['status']=='a_relancer' and reopened['amountDueEur']==80
            assert len({initial['sourceBalanceRevision'],settled['sourceBalanceRevision'],reopened['sourceBalanceRevision']})==3
            check=evidence();assert not check['documented']
            assert {r['kind']:r['verified'] for r in check['requirements']}=={'contract':True,'terms':True,'debt_detail':False,'payments':False}
            phase[0]=5;code,summary=call('POST','/api/heitz/sync-live',admin);assert code==200 and summary['partialSync'] and summary['financialCollection']['ticketsRead'] is None
            assert json.loads(statefile.read_text())['kpis']==kpis
            assert case()['sourceBalanceRevision']==reopened['sourceBalanceRevision']
            phase[0]=4;code,overview=call('GET','/api/heitz/live-overview',admin);assert code==200,(code,overview)
            assert overview['recentTickets'][0]['amountTtcEur']==-15 and not overview['recentTickets'][0]['representsPayment']
            stop(proc);proc=None;proc=start();admin=login('emp-mario',os.environ['CFITNESS_TEST_ADMIN_SECRET'])
            assert case()['sourceBalanceRevision']==reopened['sourceBalanceRevision'] and not evidence()['documented']
            assert all(method=='GET' or (method=='POST' and path=='/api/developer/getToken') for method,path in requests)
            print('PASS: read-only provider calls, route authorization, explicit incomplete coverage, invalid/conflicting balances atomic refusal, zero/reopen/same-amount proof invalidation, malformed tickets partial, signed credit and KPI preservation, restart')
        finally:
            if proc is not None:stop(proc)
            stub.shutdown();stub.server_close()


if __name__=='__main__':main()
