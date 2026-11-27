"""Canonical delegation configuration and prospect writes on disposable local fixtures."""
import json,os,secrets,socket,subprocess,tempfile,time,urllib.error,urllib.request
from pathlib import Path
def main():
    binary=str(Path(os.environ["CFITNESS_TEST_BINARY"]).resolve());checks=[]
    with socket.socket() as sock:sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
    base=f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="lead-delegation-http-",dir=os.environ["TMPDIR"]) as folder:
        env={k:os.environ[k] for k in ("PATH","HOME","LANG","TMPDIR","SYSTEMROOT","SystemRoot") if k in os.environ}
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
                except ValueError:data=None
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
            code,value=call("POST","/api/auth/login",body={"emailOrId":who,"pinOrPassword":os.environ[key]})
            assert code==200;return value["sessionToken"]
        proc=start()
        try:
            admin=login("emp-mario","CFITNESS_TEST_ADMIN_SECRET");chloe=login("emp-chloe","CFITNESS_TEST_COMMERCIAL_SECRET")
            code,original=call("GET","/api/admin/delegations",admin);assert code==200
            base_policies=[d for d in original if not (d["employeeId"]=="emp-chloe" and d["module"]=="lead")]
            disk=Path(folder,"cfitness_state.json")
            original_access=next(e["siteAccesses"] for e in json.loads(disk.read_text())["employees"] if e["id"]=="emp-chloe")
            def policy(actions):
                return {"delegations":[*base_policies,{"employeeId":"emp-chloe","siteId":"club-beynost","module":"lead","actions":actions}]}
            assert call("PUT","/api/admin/delegations",chloe,policy(["edit"]))[0]==403
            code,body=call("PUT","/api/admin/delegations",admin,policy(["edit"]))
            assert code==200,("Canonical Lead edit policy must be configurable through API",code,body)
            command={"operationId":secrets.token_hex(16),"fields":{"clubId":"beynost","firstName":"Contact","lastName":"Delegue",
                "phone":"0600000661","email":"delegation-http@example.invalid","goal":"Fictitious goal","notes":"Fictitious note"}}
            code,created=call("POST","/api/lead/contacts",chloe,command);assert code==200,(code,created)
            row=created["contact"];path="/api/lead/contacts/"+row["id"]
            patch={"operationId":secrets.token_hex(16),"expectedRevision":row["revision"],"fields":{"notes":"Delegated edit"}}
            assert call("PATCH",path,chloe,patch)[0]==200
            assert original_access==next(e["siteAccesses"] for e in json.loads(disk.read_text())["employees"] if e["id"]=="emp-chloe")
            checks.append("admin canonical edit delegation configures employee-standard commercial without changing RH; employee cannot self-grant")
            assert call("PUT","/api/admin/delegations",admin,policy(["view"]))[0]==200
            assert call("POST","/api/lead/contacts",chloe,command)[0]==403
            assert call("PATCH",path,chloe,patch)[0]==403
            assert next(p for p in call("GET","/api/lead/workspace",chloe)[1]["prospects"] if p["id"]==row["id"])["canEdit"] is False
            checks.append("live revocation disables edit capability and even idempotent replay")
            proc.terminate();proc.wait(timeout=5);proc=start()
            admin=login("emp-mario","CFITNESS_TEST_ADMIN_SECRET");chloe=login("emp-chloe","CFITNESS_TEST_COMMERCIAL_SECRET")
            assert call("POST","/api/lead/contacts",chloe,command)[0]==403
            for actions in (["create"],["update"],["write"]):
                code,body=call("PUT","/api/admin/delegations",admin,policy(actions))
                assert code==200,("Lead granular action must be configurable",actions,code,body)
                create_code,_=call("POST","/api/lead/contacts",chloe,command)
                assert create_code==(403 if actions==["update"] else 200)
            assert call("PUT","/api/admin/delegations",admin,policy(["unknown-action"]))[0]==400
            checks.append("revocation survives restart; create/update/write are configurable and distinct; invalid action refused")
            maxime=login("emp-maxime","CFITNESS_TEST_MAXIME_SECRET")
            code,all_policies=call("GET","/api/admin/delegations",admin);assert code==200
            readonly=[d for d in all_policies if not (d["employeeId"]=="emp-maxime" and d["module"]=="lead")]
            readonly.append({"employeeId":"emp-maxime","siteId":"club-carre-soie","module":"lead","actions":["view"]})
            assert call("PUT","/api/admin/delegations",admin,{"delegations":readonly})[0]==200
            code,ws=call("GET","/api/lead/workspace",maxime);assert code==200
            slot=next(s for s in ws["appointments"] if s["clubId"]=="carre-de-soie")
            code,body=call("PATCH","/api/lead/appointments/"+slot["id"],maxime,{"startTime":"22:00"})
            assert code==403,("Explicit view policy must also refuse appointment writes despite planner fallback",code,body)
            checks.append("explicit readonly policy also revokes planner appointment writes")
            failures=[]
            scenarios=[
                ("create-only",[{"employeeId":"emp-maxime","siteId":"club-carre-soie","module":"lead","actions":["create"]}],200,403),
                ("other-club",[{"employeeId":"emp-maxime","siteId":"club-beynost","module":"lead","actions":["write"]}],403,403),
                ("multiple-grants",[
                    {"employeeId":"emp-maxime","siteId":"club-carre-soie","module":"lead","actions":["view"]},
                    {"employeeId":"emp-maxime","siteId":"club-carre-soie","module":"lead","actions":["write"]}],200,200)]
            for n,(label,grants,expected_contact,expected_rdv) in enumerate(scenarios):
                current=call("GET","/api/admin/delegations",admin)[1]
                preserved=[d for d in current if not (d["employeeId"]=="emp-maxime" and d["module"]=="lead")]
                assert call("PUT","/api/admin/delegations",admin,{"delegations":[*preserved,*grants]})[0]==200
                probe={"operationId":secrets.token_hex(16),"fields":{**command["fields"],"clubId":"carre-de-soie",
                    "phone":f"060000067{n}","email":f"policy-{n}@example.invalid"}}
                contact_code=call("POST","/api/lead/contacts",maxime,probe)[0]
                rdv_code=call("PATCH","/api/lead/appointments/"+slot["id"],maxime,{"startTime":"22:00"})[0]
                if (contact_code,rdv_code)!=(expected_contact,expected_rdv):
                    failures.append({"scenario":label,"contactActual":contact_code,"contactExpected":expected_contact,
                        "appointmentActual":rdv_code,"appointmentExpected":expected_rdv})
            assert not failures,("Contacts/RDV must use identical canonical action and scope semantics",failures)
            checks.append("create-only cannot update appointments; other-club policy has no planner fallback; multiple grants use canonical union")


        finally:
            if proc.poll() is None:proc.terminate();proc.wait(timeout=5)
    print(json.dumps({"status":"PASS","checks":checks,"providers":"disabled","realData":False},ensure_ascii=False))
if __name__=="__main__":main()
