"""Real HTTP recipe on a fresh synthetic server. No provider credentials inherited."""
import concurrent.futures,json,os,secrets,socket,subprocess,tempfile,time,urllib.error,urllib.request
from pathlib import Path

def main():
    binary=str(Path(os.environ["CFITNESS_TEST_BINARY"]).resolve());checks=[]
    with socket.socket() as sock:sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
    base=f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="lead-contacts-http-",dir=os.environ["TMPDIR"]) as folder:
        env={k:os.environ[k] for k in ("PATH","TMPDIR","HOME","LANG","SYSTEMROOT","SystemRoot") if k in os.environ}
        env.update(CFITNESS_ENV="demo",CFITNESS_DEMO_MODE="1",CFITNESS_STRICT_SESSION="1",
            CFITNESS_BIND_ADDR=f"127.0.0.1:{port}",CFITNESS_DATA_DIR=folder,
            CFITNESS_HEITZ_LIVE_READS_ENABLED="0",CFITNESS_HEITZ_WORKER="0",CFITNESS_AUTOMATION_SCHEDULER="0",
            CFITNESS_SCENARIOS_WORKER="0",CFITNESS_CAMPAIGNS_WORKER="0",CFITNESS_RH_SCHEDULER="0",
            HEITZ_WS_URL="http://127.0.0.1:9",OLLAMA_BASE_URL="http://127.0.0.1:9",RUST_LOG="error")
        def call(method,path,token=None,body=None):
            headers={"Content-Type":"application/json"}
            if token:headers["Authorization"]="Bearer "+token
            req=urllib.request.Request(base+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
            except urllib.error.HTTPError as e:
                try:data=json.loads(e.read())
                except (ValueError,UnicodeDecodeError):data=None
                return e.code,data
        def start():
            p=subprocess.Popen([binary],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call("GET","/api/health")[0]==200:return p
                except OSError:pass
                time.sleep(.05)
            p.terminate();p.wait(timeout=5);raise RuntimeError("Synthetic local server unavailable")
        def login(who,key):
            code,v=call("POST","/api/auth/login",body={"emailOrId":who,"pinOrPassword":os.environ[key]})
            assert code==200,("login",who,code)
            return v["sessionToken"]
        def command(**fields):
            return {"operationId":secrets.token_hex(16),"fields":{"clubId":"carre-de-soie","firstName":"Contact","lastName":"Fictif",
                "phone":"0600000991","email":"contact-http@example.invalid","source":"Tablette accueil",
                "goal":"Objectif distinct","notes":"Note distincte","rgpdConsent":False,**fields}}
        def workspace(token):
            code,v=call("GET","/api/lead/workspace",token);assert code==200;return v["prospects"]
        proc=start()
        try:
            a=login("emp-mario","CFITNESS_TEST_ADMIN_SECRET")
            m=login("emp-maxime","CFITNESS_TEST_MAXIME_SECRET")
            c=login("emp-chloe","CFITNESS_TEST_COMMERCIAL_SECRET")
            p=command()
            assert call("POST","/api/lead/contacts",body=p)[0]==401
            assert call("POST","/api/lead/contacts",c,p)[0]==403
            code,v=call("POST","/api/lead/contacts",m,p);assert code==200,("create",code,v)
            row=v["contact"];contact_id=row["id"];path="/api/lead/contacts/"+contact_id
            assert row["goal"]=="Objectif distinct" and row["notes"]=="Note distincte" and row["rgpdConsent"] is False
            assert row["assignedToId"] not in ("emp-karim","emp-greg")
            assert any(r["id"]==contact_id and r["revision"]==row["revision"] for r in workspace(a))
            assert call("PATCH",path,c,{"operationId":secrets.token_hex(16),"expectedRevision":row["revision"],"fields":{"notes":"refused"}})[0]==403
            checks.append("commercial creation, independent admin reread, exact goal/notes, qualified assignment, bearer and cross-club denial")
            bey=command(clubId="beynost",phone="0600000994",email="bey-http@example.invalid")
            assert call("POST","/api/lead/contacts",m,bey)[0]==403
            code,b=call("POST","/api/lead/contacts",c,bey);assert code==200,("Beynost delegated commercial creation",code,b)
            assert b["contact"]["canEdit"] is True
            bey_patch={"operationId":secrets.token_hex(16),"expectedRevision":b["contact"]["revision"],"fields":{"notes":"Beynost delegated note"}}
            assert call("PATCH","/api/lead/contacts/"+b["contact"]["id"],c,bey_patch)[0]==200
            assert b["contact"]["clubId"]=="beynost" and any(r["id"]==b["contact"]["id"] for r in workspace(a))
            checks.append("Beynost delegated employee-standard commercial creates/edits own club without RH elevation; Maxime remains denied in Beynost")

            assert call("POST","/api/lead/contacts",m,p)[1]["replayed"] is True
            changed={**p,"fields":{**p["fields"],"lastName":"Changed"}}
            assert call("POST","/api/lead/contacts",m,changed)[0]==409
            assert call("POST","/api/lead/contacts",m,command(phone="+33 6 00 00 09 91",email="other@example.invalid"))[0]==409
            patch={"operationId":secrets.token_hex(16),"expectedRevision":row["revision"],"fields":{"notes":"Note modifiée","stage":"Contacté","segments":["Suivi","Suivi"]}}
            code,v=call("PATCH",path,m,patch);assert code==200,("patch",code,v)
            updated=v["contact"];assert updated["stage"]=="Contacté" and updated["segments"]==["Suivi"]
            assert updated["goal"]=="Objectif distinct" and updated["notes"]=="Note modifiée"
            assert call("PATCH",path,m,patch)[1]["replayed"] is True
            assert call("PATCH",path,m,{**patch,"operationId":secrets.token_hex(16)})[0]==409
            checks.append("normalised duplicate refusal, operation identity/replay, edit/segments persisted and stale revision conflict")
            for fields in ({"stage":"Adhérent"},{"clubId":"beynost"},{"notes":"x"*10001},{"phone":"wrong"}):
                code,_=call("PATCH",path,m,{"operationId":secrets.token_hex(16),"expectedRevision":updated["revision"],"fields":fields})
                assert code==400,("validation",list(fields),code)
            assert call("POST","/api/lead/contacts",m,command(notes="x"*70000))[0]==413
            checks.append("manual Heitz conversion, implicit transfer, invalid fields and oversized HTTP body refused")
            disk=Path(folder,"cfitness_state.json");before=disk.read_bytes();blocker=Path(folder,"cfitness_state.json.tmp");blocker.mkdir()
            failed=command(phone="0600000992",email="retry-http@example.invalid")
            assert call("POST","/api/lead/contacts",m,failed)[0]==500
            assert disk.read_bytes()==before and not any(r["email"]=="retry-http@example.invalid" for r in workspace(a))
            assert call("PATCH",path,m,{"operationId":secrets.token_hex(16),"expectedRevision":updated["revision"],"fields":{"notes":"not persisted"}})[0]==500
            assert disk.read_bytes()==before
            assert next(r for r in workspace(a) if r["id"]==contact_id)["notes"]=="Note modifiée"
            blocker.rmdir();assert call("POST","/api/lead/contacts",m,failed)[0]==200
            checks.append("disk failure leaves memory/disk/receipt unchanged for create and edit, same operation can retry")
            same=command(phone="0600000993",email="concurrent-http@example.invalid")
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(lambda _:call("POST","/api/lead/contacts",m,same),range(2)))
            assert all(r[0]==200 for r in results) and len({r[1]["contact"]["id"] for r in results})==1
            checks.append("concurrent identical requests create one record")
            proc.terminate();proc.wait(timeout=5);proc=start()
            m=login("emp-maxime","CFITNESS_TEST_MAXIME_SECRET");a=login("emp-mario","CFITNESS_TEST_ADMIN_SECRET")
            assert call("POST","/api/lead/contacts",m,p)[1]["contact"]["id"]==contact_id
            reread=next(r for r in workspace(a) if r["id"]==contact_id)
            assert reread["notes"]=="Note modifiée" and reread["stage"]=="Contacté" and reread["revision"]==updated["revision"]
            checks.append("new sessions after process restart retain record, notes, stage, revision and idempotency receipt")
        finally:
            if proc.poll() is None:proc.terminate();proc.wait(timeout=5)
    print(json.dumps({"status":"PASS","checks":checks,"externalProviders":"disabled","realData":False},ensure_ascii=False))
if __name__=="__main__":main()
