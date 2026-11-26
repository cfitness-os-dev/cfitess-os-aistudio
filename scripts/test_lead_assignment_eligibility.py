"""Public-form assignment recipe on fresh synthetic state; no external calls or credentials."""
import copy, json, os, socket, subprocess, tempfile, time, urllib.request
from datetime import datetime
from itertools import product
from pathlib import Path
from zoneinfo import ZoneInfo

def main():
    binary=str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    checks=[]
    with tempfile.TemporaryDirectory(prefix='lead-assignment-',dir=os.environ['TMPDIR']) as root:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        base=f'http://127.0.0.1:{port}'
        def call(method,path,body=None):
            req=urllib.request.Request(base+path,method=method,headers={'Content-Type':'application/json'},
                data=None if body is None else json.dumps(body).encode())
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
        def start(folder):
            env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'TMPDIR':os.environ['TMPDIR'],
                'CFITNESS_ENV':'demo','CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1',
                'CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':str(folder),
                'CFITNESS_HEITZ_LIVE_READS_ENABLED':'0','CFITNESS_HEITZ_WORKER':'0',
                'CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0',
                'CFITNESS_CAMPAIGNS_WORKER':'0','CFITNESS_RH_SCHEDULER':'0',
                'HEITZ_WS_URL':'http://127.0.0.1:9','OLLAMA_BASE_URL':'http://127.0.0.1:9','RUST_LOG':'error'}
            proc=subprocess.Popen([binary],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call('GET','/api/health')[0]==200:return proc
                except OSError:pass
                time.sleep(.05)
            proc.terminate();proc.wait(timeout=5);raise RuntimeError('Local server unavailable')
        seed_folder=Path(root,'seed');seed_folder.mkdir();proc=start(seed_folder)
        proc.terminate();proc.wait(timeout=5)
        initial=json.loads(Path(seed_folder,'cfitness_state.json').read_text())
        for club, mode in product(['carre-de-soie','beynost'], ['inactive','club_removed','accepted','one_available','disabled']):
            site='club-carre-soie' if club=='carre-de-soie' else 'club-beynost'
            form='frm-1' if club=='carre-de-soie' else 'frm-2'
            chosen='emp-karim' if club=='carre-de-soie' else 'emp-chloe'
            roster={'emp-maxime','emp-karim','emp-sarah'} if club=='carre-de-soie' else {'emp-chloe','emp-greg','emp-sarah'}
            other_club_id='beynost' if club=='carre-de-soie' else 'carre-de-soie'
            fixture=copy.deepcopy(initial)
            fixture['leadProspects']=[p for p in fixture['leadProspects'] if p['clubId']!=club]
            fixture['leaveRequests']=[]
            if mode in ['inactive','club_removed','one_available']:
                for employee in fixture['employees']:
                    if employee['id'] in roster:
                        if mode=='inactive' or (mode=='one_available' and employee['id']!=chosen):
                            employee['active']=False
                        if mode=='club_removed':
                            employee['siteAccesses']=[a for a in employee['siteAccesses'] if a['siteId']!=site]
            if mode=='accepted':
                today=datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
                fixture['leaveRequests']=[{'id':'test-'+who,'employeeId':who,'siteId':site,
                    'motive':'Absence fictive','startDate':today,'endDate':today,'status':'accepted','comment':''} for who in roster]
            fixture['leadSettingsByClub'][club]['autoAssignEnabled']=mode!='disabled'
            folder=Path(root,club+'-'+mode);folder.mkdir()
            state_file=Path(folder,'cfitness_state.json');state_file.write_text(json.dumps(fixture))
            other_club=[p for p in fixture['leadProspects'] if p['clubId']==other_club_id]
            proc=start(folder)
            try:
                status,result=call('POST',f'/api/public/forms/{club}/{form}/submit',
                    {'fullName':'Recette Fictive','email':mode+'@example.test','phone':'','rgpdConsent':True})
                assert status==201
                state=json.loads(state_file.read_text())
                prospect=next(p for p in state['leadProspects'] if p['id']==result['prospectId'])
                expected=chosen if mode=='one_available' else 'file_attente_'+club
                assert prospect['assignedToId']==expected,(mode,prospect['assignedToId'])
                activity=next(a for a in state['leadActivities'] if a.get('prospectId')==prospect['id'])
                assert activity['assignedToId']==expected
                assert [p for p in state['leadProspects'] if p['clubId']==other_club_id]==other_club
            finally:proc.terminate();proc.wait(timeout=5)
            checks.append(club+' / '+mode+': public prospect + follow-up activity persisted with correct assignee; other club unchanged')
    print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
