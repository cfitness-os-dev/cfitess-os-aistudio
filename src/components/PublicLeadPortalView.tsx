import React, { useState } from 'react';
import { CheckCircle2, Lock, Calendar, FileText } from 'lucide-react';

interface PublicFormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select' | 'checkbox';
  required: boolean;
}

interface StoredLeadForm {
  id: string;
  name: string;
  clubId: 'carre-de-soie' | 'beynost';
  status: 'published' | 'draft';
  sections: string[];
  fields?: PublicFormField[];
  responsesCount: number;
  lastResponsePreview: string;
}

const DEFAULT_PUBLIC_FORMS: StoredLeadForm[] = [
  {
    id: 'frm-1',
    name: 'Séance Découverte Carré de Soie',
    clubId: 'carre-de-soie',
    status: 'published',
    sections: ['Coordonnées', 'Objectif fitness', 'Consentement RGPD'],
    fields: [
      { id: 'fld-fn', label: 'Prénom', type: 'text', required: true },
      { id: 'fld-ln', label: 'Nom', type: 'text', required: true },
      { id: 'fld-em', label: 'Email', type: 'email', required: true },
      { id: 'fld-ph', label: 'Téléphone', type: 'tel', required: false },
      { id: 'fld-rgpd', label: 'J’accepte le traitement RGPD de mes données', type: 'checkbox', required: true },
    ],
    responsesCount: 42,
    lastResponsePreview: 'Camille Garnier · 0611223344 · Objectif perte de poids · RGPD=true',
  },
  {
    id: 'frm-2',
    name: 'Bilan Checkup Beynost',
    clubId: 'beynost',
    status: 'published',
    sections: ['Identité', 'Disponibilités', 'Accord RGPD'],
    fields: [
      { id: 'fld-fn2', label: 'Prénom', type: 'text', required: true },
      { id: 'fld-em2', label: 'Email', type: 'email', required: true },
      { id: 'fld-rgpd2', label: 'Accord RGPD obligatoire', type: 'checkbox', required: true },
    ],
    responsesCount: 19,
    lastResponsePreview: 'Hugo Lefebvre · 0677889900 · Checkup Technogym · RGPD=true',
  },
  {
    id: 'frm-3',
    name: 'Offre Rentrée Coaching (Brouillon)',
    clubId: 'carre-de-soie',
    status: 'draft',
    sections: ['Identité'],
    fields: [{ id: 'fld-fn3', label: 'Prénom', type: 'text', required: true }],
    responsesCount: 0,
    lastResponsePreview: 'Aucune réponse collectée.',
  },
];

export function PublicLeadPortalView({ pathname }: { pathname: string }) {
  const parts = pathname.split('/').filter(Boolean);
  const kind = parts[0]; // 'forms' | 'book'
  const clubSlug = parts[1] === 'beynost' ? 'beynost' : 'carre-de-soie';
  const itemId = parts[2] ?? '';

  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (kind === 'book') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
            <Calendar className="w-5 h-5" />
            <span>Réservation publique — {clubSlug === 'beynost' ? 'C.Fitness Beynost' : 'C.Fitness Carré de Soie'}</span>
          </div>
          <p className="text-xs text-slate-400">
            Page publique isolée pour le créneau <span className="font-mono text-slate-200">{itemId || 'séance'}</span> (aucune donnée interne exposée).
          </p>
          {submitted ? (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Demande de créneau enregistrée en mode démonstration.</span>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!String(values.name || '').trim() || !String(values.email || '').trim()) {
                  setErrorMsg('Nom et e-mail requis.');
                  return;
                }
                setErrorMsg(null);
                setSubmitted(true);
              }}
              className="space-y-3 text-xs"
            >
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
              {errorMsg && <div className="text-red-300">{errorMsg}</div>}
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold cursor-pointer"
              >
                Confirmer ma demande de créneau
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  let forms: StoredLeadForm[] = DEFAULT_PUBLIC_FORMS;
  try {
    const raw = localStorage.getItem('cfos_lead_forms_v1');
    if (raw) forms = JSON.parse(raw) as StoredLeadForm[];
  } catch {
    // fallback default
  }

  const form = forms.find((f) => f.id === itemId && f.clubId === clubSlug);
  if (!form || form.status !== 'published') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-red-500/40 p-6 space-y-3 text-center">
          <Lock className="w-8 h-8 text-red-400 mx-auto" />
          <h1 className="text-base font-bold">Formulaire indisponible ou non publié</h1>
          <p className="text-xs text-slate-400">
            Ce lien public ({pathname}) ne correspond à aucun formulaire publié actif. Aucun accès interne n&apos;est exposé.
          </p>
        </div>
      </div>
    );
  }

  const fields: PublicFormField[] =
    form.fields && form.fields.length > 0
      ? form.fields
      : [
          { id: 'fld-fn', label: 'Prénom', type: 'text', required: true },
          { id: 'fld-em', label: 'Email', type: 'email', required: true },
          { id: 'fld-rgpd', label: 'Consentement RGPD obligatoire', type: 'checkbox', required: true },
        ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h1 className="text-base font-extrabold">{form.name}</h1>
              <p className="text-[11px] text-slate-400">
                {form.clubId === 'beynost' ? 'C.Fitness Beynost' : 'C.Fitness Carré de Soie'} · Formulaire public isolé
              </p>
            </div>
          </div>
        </div>

        {submitted ? (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Merci ! Votre réponse a été enregistrée pour {form.name} (démonstration locale).</span>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
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
              try {
                const updatedForms = forms.map((item) =>
                  item.id === form.id
                    ? {
                        ...item,
                        responsesCount: item.responsesCount + 1,
                        lastResponsePreview: Object.values(values).filter(Boolean).join(' · ').slice(0, 100),
                      }
                    : item
                );
                localStorage.setItem('cfos_lead_forms_v1', JSON.stringify(updatedForms));
              } catch {
                // ignore
              }
              setSubmitted(true);
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
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
            >
              Envoyer ma demande
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
