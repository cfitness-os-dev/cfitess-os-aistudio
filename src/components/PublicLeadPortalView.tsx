import React, { useEffect, useState } from 'react';
import { CheckCircle2, Lock, Calendar, FileText } from 'lucide-react';

interface PublicFormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select' | 'checkbox';
  required: boolean;
  options?: string[];
}

interface PublicFormSchema {
  id: string;
  name: string;
  clubId: 'carre-de-soie' | 'beynost';
  published: boolean;
  sectionTitles?: string[];
  fields: PublicFormField[];
}

export function PublicLeadPortalView({ pathname }: { pathname: string }) {
  const parts = pathname.split('/').filter(Boolean);
  const kind = parts[0]; // 'forms' | 'book'
  const clubSlug = parts[1] ?? '';
  const itemId = parts[2] ?? '';

  const [loading, setLoading] = useState(true);
  const [notFoundErr, setNotFoundErr] = useState<string | null>(null);
  const [formSchema, setFormSchema] = useState<PublicFormSchema | null>(null);
  const [bookInfo, setBookInfo] = useState<{ label: string; durationMinutes: number } | null>(null);

  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [bookDate, setBookDate] = useState(() => {
    const d = new Date(Date.now() + 2 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [bookTime, setBookTime] = useState('10:00');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFoundErr(null);

    if (kind === 'book') {
      void fetch(`/api/public/book/${encodeURIComponent(clubSlug)}/${encodeURIComponent(itemId)}`)
        .then(async (res) => {
          if (cancelled) return;
          if (!res.ok) {
            setNotFoundErr('Lien de réservation introuvable.');
            return;
          }
          const data = (await res.json()) as { label: string; durationMinutes: number };
          setBookInfo(data);
        })
        .catch(() => {
          if (!cancelled) setNotFoundErr('Serveur de réservation indisponible.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      void fetch(`/api/public/forms/${encodeURIComponent(clubSlug)}/${encodeURIComponent(itemId)}`)
        .then(async (res) => {
          if (cancelled) return;
          if (!res.ok) {
            setNotFoundErr('Formulaire indisponible ou non publié.');
            return;
          }
          const data = (await res.json()) as PublicFormSchema;
          setFormSchema(data);
        })
        .catch(() => {
          if (!cancelled) setNotFoundErr('Serveur de formulaires indisponible.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [kind, clubSlug, itemId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-4 text-xs">
        Chargement depuis le serveur…
      </div>
    );
  }

  if (notFoundErr) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-red-500/40 p-6 space-y-3 text-center">
          <Lock className="w-8 h-8 text-red-400 mx-auto" />
          <h1 className="text-base font-bold">{notFoundErr}</h1>
          <p className="text-xs text-slate-400">
            Ce lien public ({pathname}) n&apos;est pas actif. Aucun accès interne n&apos;est exposé.
          </p>
        </div>
      </div>
    );
  }

  if (kind === 'book' && bookInfo) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
            <Calendar className="w-5 h-5" />
            <span>Réservation publique — {clubSlug === 'beynost' ? 'C.Fitness Beynost' : 'C.Fitness Carré de Soie'}</span>
          </div>
          <p className="text-xs text-slate-400">
            Créneau <strong>{bookInfo.label}</strong> ({bookInfo.durationMinutes} min) · Persistance serveur partagée.
          </p>
          {submitted ? (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Créneau réservé le {bookDate} à {bookTime} et enregistré côté serveur pour le club.</span>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fullName = String(values.name || '').trim();
                const email = String(values.email || '').trim();
                if (!fullName || !email) {
                  setErrorMsg('Nom et e-mail requis.');
                  return;
                }
                setSubmitting(true);
                setErrorMsg(null);
                try {
                  const res = await fetch(
                    `/api/public/book/${encodeURIComponent(clubSlug)}/${encodeURIComponent(itemId)}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        fullName,
                        email,
                        date: bookDate,
                        startTime: bookTime,
                      }),
                    }
                  );
                  if (!res.ok) {
                    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                    setErrorMsg(errBody.error || `Refus serveur (HTTP ${res.status}).`);
                    return;
                  }
                  setSubmitted(true);
                } catch {
                  setErrorMsg('Erreur réseau : réservation non enregistrée.');
                } finally {
                  setSubmitting(false);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-slate-300">Date</span>
                  <input
                    type="date"
                    value={bookDate}
                    onChange={(e) => setBookDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">Heure</span>
                  <input
                    type="time"
                    value={bookTime}
                    onChange={(e) => setBookTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                  />
                </label>
              </div>
              <input
                type="text"
                placeholder="Nom complet"
                value={String(values.name || '')}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
              />
              <input
                type="email"
                placeholder="Email"
                value={String(values.email || '')}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
              />
              {errorMsg && <div className="text-red-300 font-semibold">{errorMsg}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                {submitting ? 'Enregistrement…' : 'Confirmer ma réservation'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!formSchema) return null;
  const fields = formSchema.fields;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h1 className="text-base font-extrabold">{formSchema.name}</h1>
              <p className="text-[11px] text-slate-400">
                {formSchema.clubId === 'beynost' ? 'C.Fitness Beynost' : 'C.Fitness Carré de Soie'} · Formulaire public connecté serveur
              </p>
            </div>
          </div>
        </div>

        {submitted ? (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Merci ! Votre réponse a été enregistrée côté serveur pour {formSchema.name}.</span>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              for (const f of fields) {
                const v = values[f.id];
                if (f.required) {
                  if (f.type === 'checkbox' && v !== true) {
                    setErrorMsg(`Le champ « ${f.label} » est obligatoire.`);
                    return;
                  }
                  if (f.type !== 'checkbox' && !String(v || '').trim()) {
                    setErrorMsg(`Le champ « ${f.label} » est obligatoire.`);
                    return;
                  }
                }
              }
              setErrorMsg(null);
              const nameParts: string[] = [];
              let resolvedEmail = '';
              let resolvedPhone = '';
              let resolvedRgpd = false;
              for (const f of fields) {
                const val = values[f.id];
                const lbl = f.label.toLowerCase();
                if (f.type === 'email' || lbl.includes('email') || lbl.includes('e-mail')) {
                  if (!resolvedEmail) resolvedEmail = String(val || '').trim();
                } else if (f.type === 'tel' || lbl.includes('tél') || lbl.includes('tel') || lbl.includes('phone')) {
                  if (!resolvedPhone) resolvedPhone = String(val || '').trim();
                } else if (
                  f.type === 'checkbox' &&
                  (lbl.includes('rgpd') || lbl.includes('accord') || lbl.includes('consent'))
                ) {
                  resolvedRgpd = val === true;
                } else if (lbl.includes('prénom') || lbl.includes('prenom') || lbl.includes('nom')) {
                  const s = String(val || '').trim();
                  if (s) nameParts.push(s);
                }
              }
              const fullName = nameParts.join(' ') || 'Contact public';
              setSubmitting(true);
              try {
                const res = await fetch(
                  `/api/public/forms/${encodeURIComponent(clubSlug)}/${encodeURIComponent(itemId)}/submit`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      fullName,
                      email: resolvedEmail,
                      phone: resolvedPhone,
                      rgpdConsent: resolvedRgpd,
                      answers: values,
                    }),
                  }
                );
                if (!res.ok) {
                  const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                  setErrorMsg(errBody.error || `Erreur serveur (HTTP ${res.status}).`);
                  return;
                }
                setSubmitted(true);
              } catch {
                setErrorMsg('Erreur réseau : réponse non enregistrée.');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-3 text-xs"
          >
            {fields.map((f) => (
              <div key={f.id} className="space-y-1">
                {f.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(values[f.id])}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.checked }))}
                    />
                    <span>
                      {f.label} {f.required && <span className="text-red-400">*</span>}
                    </span>
                  </label>
                ) : f.type === 'select' ? (
                  <label className="block space-y-1">
                    <span className="text-slate-300">
                      {f.label} {f.required && <span className="text-red-400">*</span>}
                    </span>
                    <select
                      value={String(values[f.id] || '')}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                    >
                      <option value="">-- Sélectionner --</option>
                      {(f.options ?? ['Option 1', 'Option 2']).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block space-y-1">
                    <span className="text-slate-300">
                      {f.label} {f.required && <span className="text-red-400">*</span>}
                    </span>
                    <input
                      type={f.type}
                      value={String(values[f.id] || '')}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
                    />
                  </label>
                )}
              </div>
            ))}
            {errorMsg && <div className="text-red-300 font-semibold">{errorMsg}</div>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold cursor-pointer"
            >
              {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
