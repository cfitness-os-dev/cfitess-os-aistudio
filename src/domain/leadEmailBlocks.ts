export const EMAIL_BLOCK_KINDS = ['texte', 'bouton', 'entete', 'reseaux', 'pied', 'html', 'image', 'image_texte', 'fond_image', 'navbar', 'separateur', 'espace'] as const;
export type EmailBlockKind = typeof EMAIL_BLOCK_KINDS[number];
export interface EmailBlockStyle { font: string; fontSize: number; align: 'left' | 'center' | 'right'; textColor: string; backgroundColor: string; radius: number; padding: [number, number, number, number]; imageWidth: number; height: number; imagePosition: 'left' | 'right'; thickness: number }
export interface EmailBlock { id: string; kind: EmailBlockKind; text: string; label: string; url: string; image: string; alt: string; html: string; links: Array<{ label: string; url: string }>; style: EmailBlockStyle }
export interface EmailDocument { version: 1; blocks: EmailBlock[] }
export function createEmailBlock(kind: EmailBlockKind, id: string): EmailBlock {
  return { id, kind, text: kind === 'pied' ? 'Mentions légales du club' : '', label: kind === 'bouton' ? 'En savoir plus' : '', url: '', image: '', alt: '', html: '', links: [], style: { font: 'Arial', fontSize: 16, align: 'left', textColor: '#1e293b', backgroundColor: '#ffffff', radius: 0, padding: [16, 16, 16, 16], imageWidth: 400, height: 40, imagePosition: 'left', thickness: 1 } };
}
export function safeEmailUrl(value: string): boolean {
  if (['%url-club%', '%url-rdv-club%', '%unsubscribe-url%'].includes(value)) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !/[\s<>"'\\]/.test(value); } catch { return false; }
}
export function validateEmailDocument(value: unknown): string[] {
  const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!record(value) || Object.keys(value).some(k=>!['version','blocks'].includes(k)) || value.version !== 1 || !Array.isArray(value.blocks)) return ['Document email invalide.'];
  for (const b of value.blocks) {
    if (!record(b) || Object.keys(b).some(k=>!['id','kind','text','label','url','image','alt','html','links','style'].includes(k)) || ['id','kind','text','label','url','image','alt','html'].some(k=>typeof b[k]!=='string') || !record(b.style) || !Array.isArray(b.links)) return ['Bloc email invalide.'];
    const s=b.style;
    if (Object.keys(s).some(k=>!['font','fontSize','align','textColor','backgroundColor','radius','padding','imageWidth','height','imagePosition','thickness'].includes(k)) || ['font','align','textColor','backgroundColor','imagePosition'].some(k=>typeof s[k]!=='string') || ['fontSize','radius','imageWidth','height','thickness'].some(k=>typeof s[k]!=='number') || !Array.isArray(s.padding) || s.padding.some(n=>typeof n!=='number') || b.links.some(l=>!record(l)||Object.keys(l).some(k=>!['label','url'].includes(k))||typeof l.label!=='string'||typeof l.url!=='string')) return ['Propriétés de bloc invalides.'];
  }
  const doc=value as unknown as EmailDocument;
  const errors: string[] = []; const ids = new Set<string>(); let embedded = 0;
  if (doc.version !== 1 || !doc.blocks.length || doc.blocks.length > 100 || new TextEncoder().encode(JSON.stringify(doc)).length > 4 * 1024 * 1024) return ['Ajoutez de 1 à 100 blocs dans un document de 4 Mo maximum.'];
  doc.blocks.forEach((b, index) => {
    const bad = () => errors.push(`Bloc ${index + 1} : vérifiez le contenu, les liens et les dimensions.`);
    if (!b.id || b.id.length > 100 || ids.has(b.id) || !EMAIL_BLOCK_KINDS.includes(b.kind)) bad(); ids.add(b.id);
    const s = b.style;
    if (!/^[A-Za-z0-9 -]{1,80}$/.test(s.font) || !Number.isInteger(s.fontSize) || s.fontSize < 8 || s.fontSize > 72 || !['left','center','right'].includes(s.align) || ![s.textColor,s.backgroundColor].every(c=>/^#[0-9a-fA-F]{6}$/.test(c)) || s.padding.length !== 4 || s.padding.some(n=>!Number.isInteger(n)||n<0||n>100) || !Number.isInteger(s.radius)||s.radius<0||s.radius>100 || !Number.isInteger(s.imageWidth)||s.imageWidth<1||s.imageWidth>1200 || !Number.isInteger(s.height)||s.height<0||s.height>600 || !Number.isInteger(s.thickness)||s.thickness<0||s.thickness>20 || !['left','right'].includes(s.imagePosition)) bad();
    if (b.text.length > 20000 || b.html.length > 20000 || b.label.length > 120 || b.alt.length > 300 || b.url.length > 2000 || b.links.length > 10 || (b.url && !safeEmailUrl(b.url)) || b.links.some(l=>!l.label.trim()||l.label.length>120||l.url.length>2000||!safeEmailUrl(l.url))) bad();
    if (b.image && !safeEmailUrl(b.image)) {
      const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.image);
      if (!match) bad(); else embedded += Math.floor(match[2].length * 3 / 4) - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
    }
    if (['image','entete','image_texte','fond_image'].includes(b.kind) && !b.image) bad();
    if (b.kind === 'bouton' && (!b.label.trim() || !b.url)) bad();
    if (['texte','pied','image_texte','fond_image'].includes(b.kind) && !b.text.trim()) bad();
    if (b.kind === 'html' && !b.html.trim()) bad();
    if (['navbar','reseaux'].includes(b.kind) && !b.links.length) bad();
  });
  if (embedded > 2 * 1024 * 1024) errors.push('Les images intégrées sont limitées à 2 Mo au total.');
  return [...new Set(errors)];
}
/** Plain summary only. The authoritative HTML sanitizer and rendering live on the server. */
export function emailDocumentText(doc: EmailDocument): string {
  return doc.blocks.map(b => b.kind === 'bouton' ? `${b.label} : ${b.url}` : ['navbar','reseaux'].includes(b.kind) ? b.links.map(l=>`${l.label} : ${l.url}`).join('\n') : b.kind === 'html' ? b.html.replace(/<[^>]*>/g, '') : ['image','entete'].includes(b.kind) ? b.alt : b.kind === 'pied' ? `${b.text}\nSe désabonner : %unsubscribe-url%` : b.text).filter(Boolean).join('\n\n');
}
