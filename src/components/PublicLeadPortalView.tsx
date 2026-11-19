import React, { useState } from 'react';
import { CheckCircle2, Lock, Calendar, FileText } from 'lucide-react';
import { validateAppointmentBooking, type AppointmentSlotRecord } from '../domain/leadAuditRegistry';

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
  published?: boolean;
  status?: 'published' | 'draft';
  sections?: number | string[];
  sectionTitles?: string[];
  fields?: PublicFormField[];
  responsesCount: number;
  lastResponsePreview?: string;
  sampleResponses?: Array<{
    id: string;
    fullName: string;
    email: string;
    phone: string;
    rgpdConsent: boolean;
    submittedAt: string;
  }>;
}

const DEFAULT_PUBLIC_FORMS: StoredLeadForm[] = [
  {
    id: 'frm-1',
    name: 'Séance Découverte Carré de Soie',
    clubId: 'carre-de-soie',
    published: true,
    sectionTitles: ['Coordonnées', 'Objectif fitness', 'Consentement RGPD'],
    fields: [
      { id: 'fld-fn', label: 'Prénom', type: 'text', required: true },
      { id: 'fld-ln', label: 'Nom', type: 'text', required: true },
      { id: 'fld-em', label: 'Email', type: 'email', required: true },
      { id: 'fld-ph', label: 'Téléphone', type: 'tel', required: false },
      { id: 'fld-rgpd', label: 'J’accepte le traitement RGPD de mes données', type: 'checkbox', required: true },
    ],
    responsesCount: 42,
    sampleResponses: [
      {
        id: 'rep-1',
        fullName: 'Camille Garnier',
        email: 'camille.garnier@exemple.fr',
        phone: '0611223344',
        rgpdConsent: true,
        submittedAt: '2026-11-16 14:20',
      },
    ],
  },
  {
    id: 'frm-2',
    name: 'Bilan Checkup Beynost',
    clubId: 'beynost',
    published: true,
    sectionTitles: ['Identité', 'Disponibilités', 'Accord RGPD'],
    fields: [
      { id: 'fld-fn2', label: 'Prénom', type: 'text', required: true },
      { id: 'fld-em2', label: 'Email', type: 'email', required: true },
      { id: 'fld-rgpd2', label: 'Accord RGPD obligatoire', type: 'checkbox', required: true },
    ],
    responsesCount: 19,
    sampleResponses: [
      {
        id: 'rep-2',
        fullName: 'Hugo Lefebvre',
        email: 'hugo.lefebvre@exemple.fr',
        phone: '0677889900',
        rgpdConsent: true,
        submittedAt: '2026-11-15 11:05',
      },
    ],
  },
  {
    id: 'frm-3',
    name: 'Offre Rentrée Coaching (Brouillon)',
    clubId: 'carre-de-soie',
    published: false,
    sectionTitles: ['Identité'],
    fields: [{ id: 'fld-fn3', label: 'Prénom', type: 'text', required: true }],
    responsesCount: 0,
    sampleResponses: [],
  },
];

export function PublicLeadPortalView({ pathname }: { pathname: string }) {
  const parts = pathname.split('/').filter(Boolean);
  const kind = parts[0]; // 'forms' | 'book'
  const clubSlug: 'carre-de-soie' | 'beynost' = parts[1] === 'beynost' ? 'beynost' : 'carre-de-soie';
  const itemId = parts[2] ?? '';

  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [bookDate, setBookDate] = useState(() => {
    const d = new Date(Date.now() + 2 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [bookTime, setBookTime] = useState('10:00');
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (kind === 'book') {
    const slotLabel = itemId.includes('checkup')
      ? 'Bilan Checkup Technogym'
      : 'Séance Découverte Coaching';
    const durationMinutes = 60;
    const coachId = clubSlug === 'beynost' ? 'emp-sarah' : 'emp-karim';

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
            <Calendar className="w-5 h-5" />
            <span>Réservation publique — {clubSlug === 'beynost' ? 'C.Fitness Beynost' : 'C.Fitness Carré de Soie'}</span>
          </div>
          <p className="text-xs text-slate-400">
            Créneau <strong>{slotLabel}</strong> ({durationMinutes} min) · Page publique isolée (aucune donnée interne exposée).
          </p>
          {submitted ? (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Créneau réservé le {bookDate} à {bookTime} et enregistré dans l&apos;agenda du club.</span>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fullName = String(values.name || '').trim();
                const email = String(values.email || '').trim();
                if (!fullName || !email) {
                  setErrorMsg('Nom et e-mail requis.');
                  return;
                }
                let existingSlots: AppointmentSlotRecord[] = [];
                try {
                  const raw = localStorage.getItem('cfos_lead_rdv_slots_v1');
                  if (raw) existingSlots = JSON.parse(raw) as AppointmentSlotRecord[];
                } catch {
                  // ignore
                }
                const decision = validateAppointmentBooking(existingSlots, {
                  clubId: clubSlug,
                  coachId,
                  typeName: slotLabel,
                  date: bookDate,
                  startTime: bookTime,
                  durationMinutes,
                  hoursBeforeSlot: 24,
                  minDelayHours: 2,
                  capacityMax: 1,
                  requiresStripePayment: false,
                  stripePaidConfirmed: false,
                  referenceNow: new Date(),
                });
                if (!decision.accepted) {
                  setErrorMsg(decision.reason);
                  return;
                }
                const nextSlot: AppointmentSlotRecord = {
                  id: `slot-pub-${Date.now()}`,
                  clubId: clubSlug,
                  coachId,
                  typeName: slotLabel,
                  date: bookDate,
                  startTime: bookTime,
                  durationMinutes,
                  capacityMax: 1,
                  currentBookedCount: 1,
                  paidRequired: false,
                  paymentStatus: 'non_requis',
                };
                try {
                  localStorage.setItem(
                    'cfos_lead_rdv_slots_v1',
                    JSON.stringify([nextSlot, ...existingSlots])
                  );
                } catch {
                  // ignore
                }
                setErrorMsg(null);
                setSubmitted(true);
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
                className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold cursor-pointer"
              >
                Confirmer ma réservation
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
  const isFormPublished = form
    ? form.published !== undefined
      ? form.published
      : form.status === 'published'
    : false;

  if (!form || !isFormPublished) {
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
          { id: 'fld-ph', label: 'Téléphone', type: 'tel', required: false },
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
            <span>Merci ! Votre réponse structurée a été enregistrée pour {form.name}.</span>
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
              const fullName = [values['fld-fn'], values['fld-ln'], values['fld-fn2'], values['fld-fn3']]
                .map((x) => String(x || '').trim())
                .filter(Boolean)
                .join(' ') || 'Contact public';
              const email = String(values['fld-em'] || values['fld-em2'] || '').trim();
              const phone = String(values['fld-ph'] || '').trim();
              const structuredResponse = {
                id: `rep-${Date.now()}`,
                fullName,
                email,
                phone,
                rgpdConsent: Boolean(values['fld-rgpd'] ?? values['fld-rgpd2'] ?? true),
                submittedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
              };
              try {
                const updatedForms = forms.map((item) =>
                  item.id === form.id
                    ? {
                        ...item,
                        responsesCount: item.responsesCount + 1,
                        lastResponsePreview: `${fullName} · ${email}`,
                        sampleResponses: [structuredResponse, ...(item.sampleResponses ?? [])],
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
                      type={f.type === 'select' ? 'text' : f.type}
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
