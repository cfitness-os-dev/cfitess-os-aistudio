//! Structured email documents. No network access; HTML fragments are sanitized.
use super::*;
use base64::Engine as _;

pub const KINDS: &[&str] = &[
    "texte",
    "bouton",
    "entete",
    "reseaux",
    "pied",
    "html",
    "image",
    "image_texte",
    "fond_image",
    "navbar",
    "separateur",
    "espace",
];
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    pub version: u32,
    pub blocks: Vec<Block>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Link {
    pub label: String,
    pub url: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Style {
    pub font: String,
    pub font_size: u16,
    pub align: String,
    pub text_color: String,
    pub background_color: String,
    pub radius: u16,
    pub padding: [u16; 4],
    pub image_width: u16,
    pub height: u16,
    pub image_position: String,
    pub thickness: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Block {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub label: String,
    pub url: String,
    pub image: String,
    pub alt: String,
    pub html: String,
    pub links: Vec<Link>,
    pub style: Style,
}
pub fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|c| c.is_ascii_hexdigit())
}
pub fn safe_url(s: &str) -> bool {
    if matches!(s, "%url-club%" | "%url-rdv-club%" | "%unsubscribe-url%") {
        return true;
    }
    ammonia::url::Url::parse(s)
        .map(|url| {
            url.scheme() == "https"
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && !s.chars().any(|c| {
                    c.is_whitespace()
                        || c.is_control()
                        || matches!(c, '<' | '>' | '"' | '\'' | '\\')
                })
        })
        .unwrap_or(false)
}
fn image_bytes(s: &str) -> Option<usize> {
    if s.is_empty() || safe_url(s) {
        return Some(0);
    }
    let (data, png) = if let Some(b) = s.strip_prefix("data:image/png;base64,") {
        (b, true)
    } else {
        (s.strip_prefix("data:image/jpeg;base64,")?, false)
    };
    if data.len() > 2_800_000 {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .ok()?;
    if bytes.len() > 2 * 1024 * 1024
        || (png && !bytes.starts_with(b"\x89PNG\r\n\x1a\n"))
        || (!png && !bytes.starts_with(&[0xff, 0xd8, 0xff]))
    {
        return None;
    }
    Some(bytes.len())
}
pub fn validate(d: &Document) -> Result<(), Failure> {
    let bad = || {
        err_resp(StatusCode::UNPROCESSABLE_ENTITY, "Document email invalide : vérifiez les blocs, dimensions, liens HTTPS et images JPEG/PNG (2 Mo au total).")
    };
    if d.version != 1
        || d.blocks.is_empty()
        || d.blocks.len() > 100
        || serde_json::to_vec(d)
            .map(|s| s.len() > 4 * 1024 * 1024)
            .unwrap_or(true)
    {
        return Err(bad());
    }
    let mut ids = HashSet::new();
    let mut images = 0;
    for b in &d.blocks {
        if b.id.is_empty()
            || b.id.len() > 100
            || !ids.insert(&b.id)
            || !KINDS.contains(&b.kind.as_str())
            || b.text.encode_utf16().count() > 20000
            || b.html.encode_utf16().count() > 20000
            || b.label.encode_utf16().count() > 120
            || b.alt.encode_utf16().count() > 300
            || b.url.len() > 2000
            || b.links.len() > 10
        {
            return Err(bad());
        }
        let s = &b.style;
        if s.font.is_empty()
            || s.font.len() > 80
            || !s
                .font
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '-')
            || !(8..=72).contains(&s.font_size)
            || !matches!(s.align.as_str(), "left" | "center" | "right")
            || !color(&s.text_color)
            || !color(&s.background_color)
            || s.padding.iter().any(|n| *n > 100)
            || s.radius > 100
            || !(1..=1200).contains(&s.image_width)
            || s.height > 600
            || s.thickness > 20
            || !matches!(s.image_position.as_str(), "left" | "right")
        {
            return Err(bad());
        }
        if (!b.url.is_empty() && !safe_url(&b.url))
            || b.links.iter().any(|l| {
                l.label.trim().is_empty()
                    || l.label.encode_utf16().count() > 120
                    || l.url.len() > 2000
                    || !safe_url(&l.url)
            })
        {
            return Err(bad());
        }
        images += image_bytes(&b.image).ok_or_else(bad)?;
        if images > 2 * 1024 * 1024 {
            return Err(bad());
        }
        if matches!(
            b.kind.as_str(),
            "image" | "entete" | "image_texte" | "fond_image"
        ) && b.image.is_empty()
        {
            return Err(bad());
        }
        if b.kind == "bouton" && (b.label.trim().is_empty() || b.url.is_empty()) {
            return Err(bad());
        }
        if matches!(
            b.kind.as_str(),
            "texte" | "pied" | "image_texte" | "fond_image"
        ) && b.text.trim().is_empty()
        {
            return Err(bad());
        }
        if b.kind == "html" && b.html.trim().is_empty() {
            return Err(bad());
        }
        if matches!(b.kind.as_str(), "navbar" | "reseaux") && b.links.is_empty() {
            return Err(bad());
        }
        for text in [&b.text, &b.label, &b.alt, &b.html] {
            messages::validate_text(text)?;
        }
        for link in &b.links {
            messages::validate_text(&link.label)?;
        }
    }
    if text(d).encode_utf16().count() > 20000 {
        return Err(bad());
    }
    Ok(())
}
pub fn sanitized(fragment: &str) -> String {
    ammonia::Builder::default()
        .url_schemes(["https"].into_iter().collect())
        .url_relative(ammonia::UrlRelative::Deny)
        .clean(fragment)
        .to_string()
}
fn sanitized_preview(fragment: &str) -> String {
    ammonia::Builder::default()
        .url_schemes(["https"].into_iter().collect())
        .url_relative(ammonia::UrlRelative::Deny)
        .rm_tag_attributes("a", &["href"])
        .clean(fragment)
        .to_string()
}
pub fn text(d: &Document) -> String {
    d.blocks
        .iter()
        .map(|b| match b.kind.as_str() {
            "bouton" => format!("{} : {}", b.label, b.url),
            "navbar" | "reseaux" => b
                .links
                .iter()
                .map(|l| format!("{} : {}", l.label, l.url))
                .collect::<Vec<_>>()
                .join("\n"),
            "pied" => format!("{}\nSe désabonner : %unsubscribe-url%", b.text),
            "html" => {
                let mut inside = false;
                sanitized(&b.html)
                    .chars()
                    .filter(|c| {
                        if *c == '<' {
                            inside = true;
                            false
                        } else if *c == '>' {
                            inside = false;
                            false
                        } else {
                            !inside
                        }
                    })
                    .collect()
            }
            "image" | "entete" => b.alt.clone(),
            _ => b.text.clone(),
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}
pub fn render(
    d: &Document,
    values: &HashMap<String, String>,
    preview: bool,
) -> Result<String, String> {
    validate(d).map_err(|_| "Document email invalide.".to_string())?;
    let resolve = |s: &str| messages::render(s, values);
    let link_url = |s: &str| -> Result<String, String> {
        let resolved = resolve(s)?;
        if !safe_url(&resolved) || resolved.starts_with('%') {
            return Err("Lien email indisponible ou invalide.".into());
        }
        Ok(escape(&resolved))
    };
    let mut output = String::from("<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>.mail-row{display:flex;gap:16px;align-items:center}.mail-row>*{min-width:0;flex:1}img{max-width:100%;height:auto}@media(max-width:767px){.mail-row{display:block}}a{overflow-wrap:anywhere}</style></head><body style=\"margin:0;background:#f1f5f9\"><main style=\"max-width:640px;margin:auto;background:#fff\">");
    for b in &d.blocks {
        let s = &b.style;
        let style = format!("font-family:'{}',sans-serif;font-size:{}px;text-align:{};color:{};background-color:{};border-radius:{}px;padding:{}px {}px {}px {}px;overflow-wrap:anywhere", s.font, s.font_size, s.align, s.text_color, s.background_color, s.radius, s.padding[0], s.padding[1], s.padding[2], s.padding[3]);
        let txt = escape(&resolve(&b.text)?).replace('\n', "<br>");
        let image = if !b.image.is_empty() {
            if preview && !b.image.starts_with("data:") {
                format!("<div style=\"border:1px dashed #64748b;padding:16px\">Image distante non chargée · {}</div>", escape(&resolve(&b.alt)?))
            } else {
                format!("<img src=\"{}\" alt=\"{}\" width=\"{}\" style=\"width:{}px;max-width:100%;border-radius:{}px\">", if b.image.starts_with("data:") { escape(&b.image) } else { link_url(&b.image)? }, escape(&resolve(&b.alt)?), s.image_width, s.image_width, s.radius)
            }
        } else {
            String::new()
        };
        let href = if preview { "data-link" } else { "href" };
        let content = match b.kind.as_str() {
            "texte" => txt,
            "bouton" => format!("<a {href}=\"{}\" style=\"display:inline-block;color:{};background:{};padding:12px 20px;border-radius:{}px\">{}</a>", link_url(&b.url)?, s.text_color, s.background_color, s.radius, escape(&resolve(&b.label)?)),
            "image" | "entete" => if b.url.is_empty() { image } else { format!("<a {href}=\"{}\">{image}</a>", link_url(&b.url)?) },
            "image_texte" => if s.image_position == "left" { format!("<div class=\"mail-row\"><div>{image}</div><div>{txt}</div></div>") } else { format!("<div class=\"mail-row\"><div>{txt}</div><div>{image}</div></div>") },
            "fond_image" => if preview && !b.image.starts_with("data:") { format!("{image}<div>{txt}</div>") } else { format!("<div style=\"background-image:url('{}');background-size:cover;background-position:center;min-height:{}px;padding:20px\">{txt}</div>", if b.image.starts_with("data:") { escape(&b.image) } else { link_url(&b.image)? }, s.height) },
            "pied" => format!("{txt}<p><a {href}=\"{}\">Se désabonner</a></p>", link_url("%unsubscribe-url%")?),
            "navbar" | "reseaux" => b.links.iter().map(|l| Ok(format!("<a {href}=\"{}\" style=\"display:inline-block;margin:8px;color:{}\">{}</a>", link_url(&l.url)?, s.text_color, escape(&resolve(&l.label)?)))).collect::<Result<Vec<_>, String>>()?.join(" "),
            "separateur" => format!("<hr style=\"border:0;border-top:{}px solid {}\">", s.thickness, s.text_color),
            "espace" => format!("<div style=\"height:{}px\"></div>", s.height),
            "html" => { let escaped_values = values.iter().map(|(k,v)| (k.clone(), escape(v))).collect(); let fragment=messages::render(&b.html, &escaped_values)?;if preview {sanitized_preview(&fragment)} else {sanitized(&fragment)} },
            _ => return Err("Bloc inconnu.".into()),
        };
        output.push_str(&format!("<section style=\"{style}\">{content}</section>"));
    }
    output.push_str("</main></body></html>");
    Ok(output)
}
pub fn preview_document(html: &str) -> String {
    // Sandbox alone is not enough: deny all remote resources, forms and executable content.
    html.replacen("<head>", "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\"><style>a{pointer-events:none}</style>", 1)
}
