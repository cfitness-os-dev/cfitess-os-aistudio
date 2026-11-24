#!/usr/bin/env python3
"""
Recette HTTP — Durcissement Sécurité P1 & Diagnostic Bascule Production
Vérifie sur un binaire C.Fitness OS réel :
1. En-têtes HTTP P1 sur `/api/*` : `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`,
   et `Strict-Transport-Security` dès que `X-Forwarded-Proto: https` est présent (ou hors mode démo).
2. Cookie de session `cfos_session` (`HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; Secure`) émis par `/api/auth/login`
   et accepté par toutes les routes protégées sous `CFITNESS_STRICT_SESSION=1` sans en-tête `Authorization: Bearer`.
3. Scellement SHA-256 et signature HMAC-SHA256 des sauvegardes (`GET /api/admin/backup` & `POST /api/admin/restore`)
   lorsque `CFITNESS_BACKUP_SIGNING_KEY` est configuré.
4. Endpoint admin `GET /api/admin/production-readiness` (401 anonyme, 403 non-admin, 200 admin avec liste des contrôles).
5. Rate-limiting par IP proxy (`X-Forwarded-For`) sous `CFITNESS_TRUST_PROXY=1` et purge cookie au logout (`Max-Age=0`).
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

PORT = 18159
BASE = f"http://127.0.0.1:{PORT}"


def req(method: str, path: str, body=None, headers=None):
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(f"{BASE}{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, dict(resp.headers), (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"raw": raw}
        return err.code, dict(err.headers), parsed


def wait_ready():
    for _ in range(40):
        try:
            st, _, payload = req("GET", "/api/health")
            if st == 200 and payload.get("status") == "ok":
                return
        except Exception:
            pass
        time.sleep(0.25)
    raise RuntimeError("Le serveur C.Fitness OS n'a pas démarré à temps.")


def main():
    bin_path = os.path.join("src-rust", "target", "debug", "cfitness-os.exe" if os.name == "nt" else "cfitness-os")
    if not os.path.exists(bin_path):
        bin_path = os.path.join("target", "debug", "cfitness-os.exe" if os.name == "nt" else "cfitness-os")
    if not os.path.exists(bin_path):
        raise RuntimeError(f"Binaire introuvable : {bin_path}")

    with tempfile.TemporaryDirectory() as tmpdir:
        env = os.environ.copy()
        env["CFITNESS_BIND_ADDR"] = f"127.0.0.1:{PORT}"
        env["CFITNESS_DATA_DIR"] = tmpdir
        env["CFITNESS_STRICT_SESSION"] = "1"
        env["CFITNESS_DEMO_MODE"] = "1"
        env["CFITNESS_BACKUP_SIGNING_KEY"] = "cf_bkp_recette_p1_signing_secret_key_2026"
        env["CFITNESS_TRUST_PROXY"] = "1"
        env["CFITNESS_LEAD_API_KEY"] = "cf_lead_recette_p1_secret_key_2026"
        env["CFITNESS_INBOUND_WEBHOOK_SECRET"] = "cf_inb_recette_p1_secret_key_2026"
        env["CFITNESS_HEITZ_WEBHOOK_SECRET"] = "cf_hz_recette_p1_secret_key_2026"
        env["CFITNESS_ALLOWED_ORIGINS"] = f"http://127.0.0.1:{PORT}"

        proc = subprocess.Popen([bin_path], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            wait_ready()

            # 1. En-têtes HTTP P1 (Cache-Control: no-store + HSTS sous X-Forwarded-Proto: https)
            st, hdrs, _ = req("GET", "/api/health", headers={"X-Forwarded-Proto": "https"})
            assert st == 200, f"Attendu 200 sur /api/health, reçu {st}"
            lower_hdrs = {k.lower(): v for k, v in hdrs.items()}
            assert "no-store" in lower_hdrs.get("cache-control", ""), f"Cache-Control no-store manquant: {lower_hdrs}"
            assert "max-age=31536000" in lower_hdrs.get("strict-transport-security", ""), f"HSTS manquant: {lower_hdrs}"
            print("[OK 1/5] En-têtes Cache-Control: no-store et Strict-Transport-Security validés.")

            # 2. Login émet un cookie cfos_session HttpOnly; SameSite=Strict; Secure et ce cookie authentifie sans Bearer
            st, login_hdrs, login_body = req(
                "POST",
                "/api/auth/login",
                {"emailOrId": "emp-mario", "pinOrPassword": "1010", "roleRequested": "admin"},
                headers={"X-Forwarded-Proto": "https"},
            )
            assert st == 200 and login_body.get("authenticated") is True, f"Login Mario échoué: {st} {login_body}"
            lower_login_hdrs = {k.lower(): v for k, v in login_hdrs.items()}
            set_cookie = lower_login_hdrs.get("set-cookie", "")
            assert "cfos_session=cfos_" in set_cookie, f"Cookie cfos_session absent: {set_cookie}"
            assert "HttpOnly" in set_cookie and "SameSite=Strict" in set_cookie and "Secure" in set_cookie, set_cookie
            cookie_pair = set_cookie.split(";")[0].strip()
            cookie_only_headers = {
                "Cookie": cookie_pair,
                "x-cfitness-site-id": "club-carre-soie",
            }
            st_sess, _, sess_body = req("GET", "/api/session", headers=cookie_only_headers)
            assert st_sess == 200 and sess_body.get("actorEmployeeId") == "emp-mario", f"Session par cookie échouée: {st_sess} {sess_body}"
            print("[OK 2/5] Authentification par cookie HttpOnly cfos_session (sans Bearer) validée.")

            # 3. Scellement SHA-256 et signature HMAC-SHA256 des sauvegardes
            st_bkp, _, bkp = req("GET", "/api/admin/backup", headers=cookie_only_headers)
            assert st_bkp == 200 and bkp.get("signed") is True, f"Backup signé échoué: {st_bkp}"
            assert len(bkp.get("sha256", "")) == 64 and len(bkp.get("hmacSignature", "")) == 64

            # Sans signature HMAC -> 400
            st_nosig, _, _ = req(
                "POST",
                "/api/admin/restore",
                {"backupJson": bkp["backupJson"], "expectedSha256": bkp["sha256"]},
                headers=cookie_only_headers,
            )
            assert st_nosig == 400, f"Attendu 400 sans signature HMAC, reçu {st_nosig}"

            # Avec SHA-256 et HMAC valides -> 200
            st_rest, _, rest_body = req(
                "POST",
                "/api/admin/restore",
                {
                    "backupJson": bkp["backupJson"],
                    "expectedSha256": bkp["sha256"],
                    "hmacSignature": bkp["hmacSignature"],
                },
                headers=cookie_only_headers,
            )
            assert st_rest == 200 and rest_body.get("verifiedSha256") == bkp["sha256"], f"Restore signé échoué: {st_rest} {rest_body}"
            print("[OK 3/5] Scellement SHA-256 et vérification HMAC-SHA256 des sauvegardes validés.")

            # 4. Diagnostic /api/admin/production-readiness (401 sans session, 403 non-admin, 200 admin)
            st_anon, _, _ = req("GET", "/api/admin/production-readiness")
            assert st_anon == 401, f"Attendu 401 anonyme sur production-readiness, reçu {st_anon}"

            _, chloe_hdrs, _ = req(
                "POST",
                "/api/auth/login",
                {"emailOrId": "emp-chloe", "pinOrPassword": "5320", "roleRequested": "employee"},
            )
            chloe_cookie = {k.lower(): v for k, v in chloe_hdrs.items()}["set-cookie"].split(";")[0].strip()
            st_chloe, _, _ = req("GET", "/api/admin/production-readiness", headers={"Cookie": chloe_cookie})
            assert st_chloe == 403, f"Attendu 403 non-admin sur production-readiness, reçu {st_chloe}"

            st_rdy, _, rdy = req("GET", "/api/admin/production-readiness", headers=cookie_only_headers)
            assert st_rdy == 200 and rdy.get("strictSessionEnabled") is True and rdy.get("backupSigningKeyConfigured") is True
            print("[OK 4/5] Endpoint /api/admin/production-readiness (401/403/200) validé.")

            # 5. Rate-limit par IP proxy (X-Forwarded-For) et purge cookie au logout
            for idx in range(15):
                st_fail, _, _ = req(
                    "POST",
                    "/api/auth/login",
                    {"emailOrId": f"probe-{idx}", "pinOrPassword": "wrong", "roleRequested": ""},
                    headers={"X-Forwarded-For": "198.51.100.42"},
                )
                assert st_fail == 401
            st_lim, _, lim_body = req(
                "POST",
                "/api/auth/login",
                {"emailOrId": "emp-sarah", "pinOrPassword": "3141", "roleRequested": ""},
                headers={"X-Forwarded-For": "198.51.100.42"},
            )
            assert st_lim == 429 and lim_body.get("role") == "rate_limited", f"Attendu 429 IP rate-limit, reçu {st_lim}"

            st_out, out_hdrs, out_body = req("POST", "/api/auth/logout", headers=cookie_only_headers)
            assert st_out == 200 and out_body.get("revoked") is True
            assert "Max-Age=0" in {k.lower(): v for k, v in out_hdrs.items()}.get("set-cookie", "")
            st_after, _, _ = req("GET", "/api/session", headers=cookie_only_headers)
            assert st_after == 401
            print("[OK 5/5] Rate-limit par IP proxy (X-Forwarded-For -> 429) et purge cookie logout validés.")
            print("RECETTE SÉCURITÉ P1 : 5/5 SUCCÈS.")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()


if __name__ == "__main__":
    main()
