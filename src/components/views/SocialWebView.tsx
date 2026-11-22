import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  Globe,
  Instagram,
  Plus,
  Save,
  Share2,
  Star,
  Trash2,
  Video,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';

interface ClubSocialChannels {
  clubId: string;
  websiteUrl: string;
  clubPageUrl: string;
  instagramHandle: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokHandle: string;
  tiktokUrl: string;
  youtubeUrl: string;
  googleBusinessUrl: string;
  googleRating: number;
  googleReviewsCount: number;
  updatedAt: string;
}

interface SocialPostRecord {
  id: string;
  clubId: string;
  platform: string;
  format: string;
  title: string;
  caption: string;
  scheduledDate: string;
  status: 'brouillon' | 'a_valider' | 'programme' | 'publie';
  authorName: string;
  createdAt: string;
}

const LEGAL_CLUB_INFO = {
  'carre-de-soie': {
    name: 'C.FITNESS Carré de Soie',
    legalName: 'C.FITNESS (SAS)',
    siret: '818 651 317 00013',
    vat: 'FR02818651317',
    address: 'Pôle de Loisirs et de Commerce Carré de Soie, 2 Rue Jacquard, 69120 Vaulx-en-Velin',
    phone: '04 26 22 55 30',
  },
  beynost: {
    name: 'C.FITNESS Beynost',
    legalName: 'C.FITNESS BEYNOST (SAS)',
    siret: '852 722 529 00025',
    vat: 'FR82852722529',
    address: 'Centre Commercial Beynost, ZAC des Baterses, 01700 Beynost',
    phone: '04 22 91 36 82',
  },
} as const;

const STATUS_LABELS: Record<SocialPostRecord['status'], { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'bg-slate-500/20 text-slate-300' },
  a_valider: { label: 'À valider Direction', cls: 'bg-amber-500/20 text-amber-300' },
  programme: { label: 'Programmé', cls: 'bg-sky-500/20 text-sky-300' },
  publie: { label: 'Publié', cls: 'bg-emerald-500/20 text-emerald-300' },
};

function buildAuthHeaders(actorId: string, clubId: 'carre-de-soie' | 'beynost'): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-cfitness-actor-id': actorId,
    'x-cfitness-site-id': clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie',
  };
  try {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore
  }
  return headers;
}

export function SocialWebView() {
  const { clubFilter, authorizedClubIds, currentUser } = useCfos();
  const activeClub: 'carre-de-soie' | 'beynost' =
    clubFilter === 'beynost' || (clubFilter === 'all' && authorizedClubIds[0] === 'beynost')
      ? 'beynost'
      : 'carre-de-soie';
  const clubInfo = LEGAL_CLUB_INFO[activeClub];
  const canEditChannels = currentUser.role === 'admin' || currentUser.role === 'manager';

  const [activeTab, setActiveTab] = useState<'vitrine' | 'calendrier' | 'reputation'>('vitrine');
  const [channels, setChannels] = useState<ClubSocialChannels | null>(null);
  const [posts, setPosts] = useState<SocialPostRecord[]>([]);
  const [savingChannels, setSavingChannels] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [newPlatform, setNewPlatform] = useState('Instagram');
  const [newFormat, setNewFormat] = useState('Reel / Vidéo');
  const [newTitle, setNewTitle] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [platformFilter, setPlatformFilter] = useState('Tous');

  useEffect(() => {
    let cancelled = false;
    const headers = buildAuthHeaders(currentUser.id, activeClub);
    setFeedback(null);

    void Promise.all([
      fetch(`/api/social-web/channels/${activeClub}`, { headers }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch('/api/social-web/posts', { headers }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([chData, postsData]) => {
        if (cancelled) return;
        if (chData) setChannels(chData as ClubSocialChannels);
        if (Array.isArray(postsData)) setPosts(postsData as SocialPostRecord[]);
      })
      .catch(() => {
        // fallback silencieux
      });

    return () => {
      cancelled = true;
    };
  }, [activeClub, currentUser.id]);

  const clubPosts = posts.filter(
    (p) =>
      p.clubId === activeClub &&
      (platformFilter === 'Tous' || p.platform === platformFilter)
  );

  const handleSaveChannels = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channels || !canEditChannels) return;
    setSavingChannels(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/social-web/channels/${activeClub}`, {
        method: 'PUT',
        headers: buildAuthHeaders(currentUser.id, activeClub),
        body: JSON.stringify({
          websiteUrl: channels.websiteUrl,
          clubPageUrl: channels.clubPageUrl,
          instagramHandle: channels.instagramHandle,
          instagramUrl: channels.instagramUrl,
          facebookUrl: channels.facebookUrl,
          tiktokHandle: channels.tiktokHandle,
          tiktokUrl: channels.tiktokUrl,
          youtubeUrl: channels.youtubeUrl,
          googleBusinessUrl: channels.googleBusinessUrl,
          googleRating: channels.googleRating,
          googleReviewsCount: channels.googleReviewsCount,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || 'Impossible d’enregistrer les canaux digitaux.');
      }
      const saved = (await res.json()) as ClubSocialChannels;
      setChannels(saved);
      setFeedback({
        kind: 'ok',
        text: `Liens Site Web, Réseaux Sociaux et fiche Google enregistrés pour ${clubInfo.name}.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Erreur réseau lors de la sauvegarde.',
      });
    } finally {
      setSavingChannels(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setFeedback(null);
    try {
      const res = await fetch('/api/social-web/posts', {
        method: 'POST',
        headers: buildAuthHeaders(currentUser.id, activeClub),
        body: JSON.stringify({
          clubId: activeClub,
          platform: newPlatform,
          format: newFormat,
          title: newTitle.trim(),
          caption: newCaption.trim(),
          scheduledDate: newDate,
          status: canEditChannels ? 'programme' : 'a_valider',
        }),
      });
      if (!res.ok) throw new Error('Création de la publication refusée.');
      const created = (await res.json()) as SocialPostRecord;
      setPosts((prev) => [created, ...prev]);
      setNewTitle('');
      setNewCaption('');
      setFeedback({
        kind: 'ok',
        text: `Publication « ${created.title} » ajoutée au calendrier éditorial (${clubInfo.name}).`,
      });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Erreur lors de la création.',
      });
    }
  };

  const handleUpdatePostStatus = async (postId: string, nextStatus: SocialPostRecord['status']) => {
    try {
      const res = await fetch(`/api/social-web/posts/${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: buildAuthHeaders(currentUser.id, activeClub),
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as SocialPostRecord;
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
    } catch {
      // ignore
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const res = await fetch(`/api/social-web/posts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(currentUser.id, activeClub),
      });
      if (!res.ok) return;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-cyan-400 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <span>Présence Digitale &amp; ADN des Clubs · {clubInfo.name}</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Site Web &amp; Réseaux Sociaux</h1>
          <p className="text-xs cf-muted mt-1">
            Pilotez le site officiel <span className="font-semibold text-cyan-300">c.fitness</span>, le calendrier éditorial (Instagram, Facebook, TikTok, YouTube) et la e-réputation Google du club.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={channels?.websiteUrl || 'https://c.fitness'}
            target="_blank"
            rel="noopener noreferrer"
            className="cf-brand-gradient text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Ouvrir c.fitness</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Navigation locale */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'vitrine' as const, label: 'Site Web & Canaux du club', icon: Globe },
          { id: 'calendrier' as const, label: `Calendrier éditorial (${clubPosts.length})`, icon: Calendar },
          { id: 'reputation' as const, label: 'Avis Google & E-réputation', icon: Star },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                activeTab === tab.id
                  ? 'cf-brand-gradient text-white shadow'
                  : 'cf-card-secondary hover:border-cyan-500/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          role={feedback.kind === 'err' ? 'alert' : 'status'}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.kind === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Onglet 1 : Site Web & Canaux */}
      {activeTab === 'vitrine' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="cf-card p-5 space-y-4">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Share2 className="w-4 h-4 text-cyan-400" />
              <span>Accès rapides — {clubInfo.name}</span>
            </h2>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Site officiel', value: channels?.websiteUrl || 'https://c.fitness', url: channels?.websiteUrl || 'https://c.fitness' },
                { label: 'Page locale club', value: channels?.clubPageUrl || 'https://c.fitness', url: channels?.clubPageUrl || 'https://c.fitness' },
                { label: 'Instagram', value: channels?.instagramHandle || '@c.fitness', url: channels?.instagramUrl || 'https://www.instagram.com/' },
                { label: 'TikTok', value: channels?.tiktokHandle || '@c.fitness', url: channels?.tiktokUrl || 'https://www.tiktok.com/' },
                { label: 'Facebook', value: 'Page officielle du club', url: channels?.facebookUrl || 'https://www.facebook.com/' },
                { label: 'YouTube', value: 'Chaîne vidéo C.Fitness', url: channels?.youtubeUrl || 'https://www.youtube.com/' },
                { label: 'Google Business Profile', value: `${channels?.googleRating ?? 4.8} ★ (${channels?.googleReviewsCount ?? 0} avis)`, url: channels?.googleBusinessUrl || 'https://www.google.com/maps' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cf-card-secondary p-2.5 flex items-center justify-between gap-2 hover:border-cyan-500/50 transition"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{link.label}</div>
                    <div className="cf-muted truncate">{link.value}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                </a>
              ))}
            </div>

            <div className="pt-3 border-t border-[var(--cf-border)] text-[11px] space-y-1 cf-muted">
              <div className="font-semibold text-slate-200">{clubInfo.legalName}</div>
              <div>SIRET : <span className="cf-mono">{clubInfo.siret}</span> · TVA : <span className="cf-mono">{clubInfo.vat}</span></div>
              <div>{clubInfo.address}</div>
              <div>Tél. : {clubInfo.phone}</div>
            </div>
          </div>

          <form onSubmit={handleSaveChannels} className="cf-card p-5 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <Instagram className="w-4 h-4 text-pink-400" />
                <span>Configuration des liens officiels ({clubInfo.name})</span>
              </h2>
              {!canEditChannels && (
                <span className="text-[11px] cf-muted">Lecture seule (Direction / Manager)</span>
              )}
            </div>

            {channels ? (
              <fieldset disabled={!canEditChannels || savingChannels} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="cf-muted">Site officiel</span>
                  <input
                    type="url"
                    value={channels.websiteUrl}
                    onChange={(e) => setChannels({ ...channels, websiteUrl: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="cf-muted">Page club dédiée</span>
                  <input
                    type="url"
                    value={channels.clubPageUrl}
                    onChange={(e) => setChannels({ ...channels, clubPageUrl: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="cf-muted">Compte Instagram (@handle)</span>
                  <input
                    type="text"
                    value={channels.instagramHandle}
                    onChange={(e) => setChannels({ ...channels, instagramHandle: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="cf-muted">Lien Instagram</span>
                  <input
                    type="url"
                    value={channels.instagramUrl}
                    onChange={(e) => setChannels({ ...channels, instagramUrl: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="cf-muted">Compte TikTok (@handle)</span>
                  <input
                    type="text"
                    value={channels.tiktokHandle}
                    onChange={(e) => setChannels({ ...channels, tiktokHandle: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="cf-muted">Lien TikTok</span>
                  <input
                    type="url"
                    value={channels.tiktokUrl}
                    onChange={(e) => setChannels({ ...channels, tiktokUrl: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="cf-muted">Lien Facebook</span>
                  <input
                    type="url"
                    value={channels.facebookUrl}
                    onChange={(e) => setChannels({ ...channels, facebookUrl: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="cf-muted">Lien YouTube</span>
                  <input
                    type="url"
                    value={channels.youtubeUrl}
                    onChange={(e) => setChannels({ ...channels, youtubeUrl: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="cf-muted">Lien Fiche Google Business Profile</span>
                  <input
                    type="url"
                    value={channels.googleBusinessUrl}
                    onChange={(e) => setChannels({ ...channels, googleBusinessUrl: e.target.value })}
                    className="cf-input w-full px-3 py-2"
                  />
                </label>
              </fieldset>
            ) : (
              <div className="text-xs cf-muted">Chargement des canaux du club…</div>
            )}

            {canEditChannels && channels && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingChannels}
                  className="cf-brand-gradient text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingChannels ? 'Enregistrement…' : 'Enregistrer les liens du club'}</span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Onglet 2 : Calendrier éditorial & Tournages */}
      {activeTab === 'calendrier' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form onSubmit={handleCreatePost} className="cf-card p-5 space-y-3 text-xs">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Video className="w-4 h-4 text-violet-400" />
              <span>Planifier un contenu / tournage</span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="cf-muted">Canal</span>
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                  className="cf-input w-full px-2.5 py-2"
                >
                  <option>Instagram</option>
                  <option>TikTok</option>
                  <option>Facebook</option>
                  <option>YouTube</option>
                  <option>Site Web</option>
                  <option>Google</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="cf-muted">Format</span>
                <select
                  value={newFormat}
                  onChange={(e) => setNewFormat(e.target.value)}
                  className="cf-input w-full px-2.5 py-2"
                >
                  <option>Reel / Vidéo</option>
                  <option>Story</option>
                  <option>Post</option>
                  <option>Article Web</option>
                  <option>Actu Google</option>
                </select>
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="cf-muted">Titre de la publication</span>
              <input
                type="text"
                required
                placeholder="Ex. Challenge Hyrox du mois..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="cf-input w-full px-3 py-2"
              />
            </label>
            <label className="space-y-1 block">
              <span className="cf-muted">Date prévue</span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="cf-input w-full px-3 py-2"
              />
            </label>
            <label className="space-y-1 block">
              <span className="cf-muted">Texte / légende &amp; consignes tournage</span>
              <textarea
                rows={3}
                placeholder="Texte du post, hashtags, coachs concernés..."
                value={newCaption}
                onChange={(e) => setNewCaption(e.target.value)}
                className="cf-input w-full px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="w-full cf-brand-gradient text-white py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Ajouter au calendrier ({clubInfo.name})</span>
            </button>
          </form>

          <div className="cf-card p-5 lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-sm">Publications planifiées — {clubInfo.name}</h2>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {['Tous', 'Instagram', 'TikTok', 'Facebook', 'Site Web', 'Google'].map((pf) => (
                  <button
                    key={pf}
                    type="button"
                    onClick={() => setPlatformFilter(pf)}
                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                      platformFilter === pf
                        ? 'bg-cyan-600 text-white'
                        : 'cf-card-secondary hover:border-cyan-500/40'
                    }`}
                  >
                    {pf}
                  </button>
                ))}
              </div>
            </div>

            {clubPosts.length === 0 ? (
              <div className="p-6 text-center text-xs cf-muted cf-card-secondary">
                Aucune publication planifiée pour ce filtre sur {clubInfo.name}.
              </div>
            ) : (
              <div className="space-y-2.5">
                {clubPosts.map((post) => {
                  const st = STATUS_LABELS[post.status] ?? STATUS_LABELS.brouillon;
                  return (
                    <div
                      key={post.id}
                      className="cf-card-secondary p-3.5 flex flex-wrap items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-cyan-300">{post.platform}</span>
                          <span className="cf-muted">· {post.format}</span>
                          <span className="cf-mono cf-muted">· {post.scheduledDate}</span>
                          <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${st.cls}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="font-bold text-sm">{post.title}</div>
                        {post.caption && <p className="cf-muted">{post.caption}</p>}
                        <div className="text-[10px] cf-muted">Créé par {post.authorName}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          aria-label={`Statut de ${post.title}`}
                          value={post.status}
                          onChange={(e) =>
                            void handleUpdatePostStatus(
                              post.id,
                              e.target.value as SocialPostRecord['status']
                            )
                          }
                          className="cf-input px-2 py-1 text-[11px]"
                        >
                          <option value="brouillon">Brouillon</option>
                          <option value="a_valider">À valider</option>
                          <option value="programme">Programmé</option>
                          <option value="publie">Publié</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleDeletePost(post.id)}
                          aria-label={`Supprimer ${post.title}`}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Onglet 3 : E-Réputation & Avis Google */}
      {activeTab === 'reputation' && channels && (
        <form onSubmit={handleSaveChannels} className="cf-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                <span>Suivi Avis Google — {clubInfo.name}</span>
              </h2>
              <p className="text-xs cf-muted mt-0.5">
                Suivez la note publique de l’établissement et accédez directement à la fiche Google Business pour répondre aux adhérents.
              </p>
            </div>
            <a
              href={channels.googleBusinessUrl || 'https://www.google.com/maps'}
              target="_blank"
              rel="noopener noreferrer"
              className="cf-brand-gradient text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <span>Ouvrir la fiche Google</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="cf-card-secondary p-4">
              <div className="cf-muted">Note Google actuelle</div>
              <div className="text-2xl font-black text-amber-400 mt-1">
                {channels.googleRating.toFixed(1)} / 5 ★
              </div>
            </div>
            <div className="cf-card-secondary p-4">
              <div className="cf-muted">Nombre total d’avis</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">
                {channels.googleReviewsCount}
              </div>
            </div>
            <div className="cf-card-secondary p-4">
              <div className="cf-muted">Dernière mise à jour</div>
              <div className="text-lg font-bold mt-1 cf-mono">{channels.updatedAt}</div>
            </div>
          </div>

          {canEditChannels && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-[var(--cf-border)]">
              <label className="space-y-1">
                <span className="cf-muted">Mettre à jour la note Google (0 à 5)</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={channels.googleRating}
                  onChange={(e) =>
                    setChannels({ ...channels, googleRating: Number(e.target.value) || 0 })
                  }
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="cf-muted">Nombre d’avis Google</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={channels.googleReviewsCount}
                  onChange={(e) =>
                    setChannels({
                      ...channels,
                      googleReviewsCount: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    })
                  }
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingChannels}
                  className="cf-brand-gradient text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Enregistrer le relevé Google</span>
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
