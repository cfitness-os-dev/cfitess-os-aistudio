//! Bounded JSON transport for the existing read-only Heitz integration.
//! Credentials travel over stdin, never as process arguments or error messages.
use serde_json::Value;
use std::io::{Read, Write};
use std::process::{Command, Stdio};

const MAX_RESPONSE: usize = 8 * 1024 * 1024;
fn quoted(value: &str) -> String {
    let mut result = String::from("\"");
    for c in value.chars() {
        match c {
            '\\' => result.push_str("\\\\"),
            '"' => result.push_str("\\\""),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            _ => result.push(c),
        }
    }
    result.push('"');
    result
}
fn config(
    base: &str,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<&str>,
) -> Result<String, String> {
    let rest = base
        .strip_prefix("https://")
        .or_else(|| base.strip_prefix("http://"))
        .ok_or("Adresse Heitz non prise en charge.")?;
    if rest.is_empty()
        || rest.contains(['/', '?', '#', '@', '\\'])
        || base.chars().any(|c| c.is_whitespace() || c.is_control())
        || !path.starts_with("/api/")
        || path.contains(['#', '\\'])
        || path.chars().any(|c| c.is_whitespace() || c.is_control())
        || path
            .split('?')
            .next()
            .unwrap_or("")
            .split('/')
            .any(|p| p == ".." || p == ".")
    {
        return Err("Adresse de lecture Heitz invalide.".into());
    }
    if !((method == "GET" && body.is_none())
        || (method == "POST"
            && path == "/api/developer/getToken?v=2"
            && body.is_some()
            && token.is_none()))
    {
        return Err("Opération exclue du connecteur de lecture Heitz.".into());
    }
    if token.is_some_and(|t| t.is_empty() || t.len() > 8192 || t.chars().any(char::is_control))
        || body.is_some_and(|b| b.len() > 64 * 1024)
    {
        return Err("Paramètres de connexion Heitz invalides.".into());
    }
    let mut result = format!(
        "url = {}\nrequest = {}\nheader = \"Content-Type: application/json\"\n",
        quoted(&format!("{base}{path}")),
        quoted(method)
    );
    if let Some(token) = token {
        result.push_str(&format!(
            "header = {}\n",
            quoted(&format!("Authorization: {token}"))
        ));
    }
    if let Some(body) = body {
        result.push_str(&format!("data-raw = {}\n", quoted(body)));
    }
    Ok(result)
}
fn decode(bytes: &[u8]) -> Result<Value, String> {
    let split = bytes
        .iter()
        .rposition(|b| *b == b'\n')
        .ok_or("Réponse Heitz incomplète.")?;
    if split > MAX_RESPONSE {
        return Err("Réponse Heitz trop volumineuse ; lecture non confirmée.".into());
    }
    if !matches!(&bytes[split + 1..], b"200" | b"201") {
        return Err("Le service Heitz a refusé la lecture ou retourné un statut inattendu.".into());
    }
    serde_json::from_slice(&bytes[..split])
        .map_err(|_| "Réponse JSON Heitz non reconnue ; lecture non confirmée.".into())
}
pub async fn request(
    base: String,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<&str>,
    timeout: u64,
) -> Result<Value, String> {
    let config = config(&base, method, path, token, body)?;
    tokio::task::spawn_blocking(move || {
        let mut child = Command::new("curl")
            .args([
                "--disable",
                "--silent",
                "--proto",
                "=http,https",
                "--max-time",
            ])
            .arg(timeout.clamp(1, 60).to_string())
            .args([
                "--max-filesize",
                &MAX_RESPONSE.to_string(),
                "--config",
                "-",
                "--write-out",
                "\n%{http_code}",
            ])
            .env_remove("HEITZ_DEV_ID")
            .env_remove("HEITZ_DEV_KEY")
            .env_remove("HEITZ_WS_TOKEN")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Transport de lecture Heitz indisponible.".to_string())?;
        let mut input = child
            .stdin
            .take()
            .ok_or("Canal de connexion Heitz indisponible.")?;
        if input.write_all(config.as_bytes()).is_err() {
            drop(input);
            let _ = child.kill();
            let _ = child.wait();
            return Err("Connexion de lecture Heitz interrompue.".into());
        }
        drop(input);
        let mut bytes = Vec::new();
        let read = child
            .stdout
            .take()
            .ok_or("Canal de réponse Heitz indisponible.")?
            .take((MAX_RESPONSE + 5) as u64)
            .read_to_end(&mut bytes);
        if read.is_err() || bytes.len() > MAX_RESPONSE + 4 {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "Réponse Heitz trop volumineuse ou interrompue ; lecture non confirmée.".into(),
            );
        }
        let status = child
            .wait()
            .map_err(|_| "Transport de lecture Heitz interrompu.".to_string())?;
        if !status.success() {
            return Err(
                "Lecture Heitz échouée : connexion, délai ou taille de réponse à vérifier.".into(),
            );
        }
        decode(&bytes)
    })
    .await
    .map_err(|_| "Tâche de lecture Heitz interrompue.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    fn serve(response: Vec<u8>) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let thread = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                .unwrap();
            let mut data = Vec::new();
            let mut b = [0u8; 4096];
            while let Ok(n) = socket.read(&mut b) {
                if n == 0 {
                    break;
                }
                data.extend_from_slice(&b[..n]);
                if data.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let _ = socket.write_all(&response);
            String::from_utf8_lossy(&data).into_owned()
        });
        (base, thread)
    }
    #[tokio::test]
    async fn reads_chunked_json_and_does_not_follow_redirects() {
        let (base,t) = serve(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n4\r\n{\"n\"\r\n3\r\n:0}\r\n0\r\n\r\n".to_vec());
        assert_eq!(
            request(base, "GET", "/api/test", Some("fictive-token"), None, 2)
                .await
                .unwrap()["n"],
            0
        );
        assert!(t.join().unwrap().contains("Authorization: fictive-token"));
        let (base,t) = serve(b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/private\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".to_vec());
        assert!(request(base, "GET", "/api/test", None, None, 2)
            .await
            .is_err());
        t.join().unwrap();
    }
    #[tokio::test]
    async fn rejects_truncated_oversized_or_error_bodies_without_echoing_private_content() {
        for response in [
            b"HTTP/1.1 200 OK\r\nContent-Length: 99\r\nConnection: close\r\n\r\n{}".to_vec(),
            b"HTTP/1.1 200 OK\r\nContent-Length: 99999999\r\nConnection: close\r\n\r\n{}".to_vec(),
            b"HTTP/1.1 403 Forbidden\r\nContent-Length: 14\r\nConnection: close\r\n\r\nPRIVATE-SECRET".to_vec(),
        ] { let (base,t)=serve(response); let error=request(base,"GET","/api/test",None,None,2).await.unwrap_err(); assert!(!error.contains("PRIVATE")); t.join().unwrap(); }
        assert!(decode(&vec![b'x'; MAX_RESPONSE + 6]).is_err());
        assert!(decode(b"{\n\"amount\":-12.5}\n200").is_ok());
    }
    #[test]
    fn only_read_routes_and_authentication_are_allowed_and_config_values_are_escaped() {
        assert!(config("file:///tmp/x", "GET", "/api/test", None, None).is_err());
        assert!(config(
            "https://user:secret@heitz.test",
            "GET",
            "/api/test",
            None,
            None
        )
        .is_err());
        assert!(config("https://heitz.test", "GET", "/api/../private", None, None).is_err());
        assert!(config(
            "https://heitz.test",
            "GET",
            "/api/test",
            Some("x\r\nInjected: y"),
            None
        )
        .is_err());
        assert!(config("https://heitz.test", "POST", "/api/sales", None, Some("{}")).is_err());
        let c = config(
            "https://heitz.test",
            "POST",
            "/api/developer/getToken?v=2",
            None,
            Some("{\"key\":\"fictive\\secret\"}\n"),
        )
        .unwrap();
        assert_eq!(c.lines().count(), 4);
        assert!(c.contains("data-raw = \"{\\\"key\\\""));
    }
}
