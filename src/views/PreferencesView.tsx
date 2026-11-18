import {
  Bell,
  CalendarSync,
  CheckCircle2,
  Globe,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCfos } from '../context/CfosContext';
import { cleanUiTree } from '../domain/cleanModeSanitizer';
import { ApiClientError, clientApi, type ApiAuthContext } from '../domain/clientApi';
import type { UserPreferences } from '../domain/types';

interface PreferencesViewProps {
  auth: ApiAuthContext;
  preferences: UserPreferences;
  onRefreshDashboard: () => Promise<void>;
}

const LANGUAGES = [
  'Français',
  'English',
  'Español',
  'Deutsch',
  'Italiano',
  'Português',
  'Nederlands',
  'Polski',
  'العربية',
  '中文',
  '日本語',
];

export function PreferencesView({
  auth,
  preferences,
  onRefreshDashboard,
}: PreferencesViewProps) {
  const { isTechnicalMode } = useCfos();
  const [draft, setDraft] = useState<UserPreferences>(preferences);
  const [currentSecret, setCurrentSecret] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  async function handleSavePrefs() {
    setFeedback(null);
    try {
      const updated = await clientApi.updateOwnPreferences(auth, draft);
      setDraft(updated);
      await onRefreshDashboard();
      setFeedback({
        kind: 'ok',
        text: 'Préférences enregistrées côté serveur et tracées (MC13 / TST29).',
      });
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof ApiClientError ? e.message : String(e),
      });
    }
  }

  async function handleRevokeCalendar() {
    setFeedback(null);
    try {
      const updated = await clientApi.revokeCalendarToken(auth);
      setDraft(updated);
      await onRefreshDashboard();
      setFeedback({
        kind: 'ok',
        text: `Ancien lien .ics révoqué. Nouveau jeton actif : ${updated.calendarFeedToken}`,
      });
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof ApiClientError ? e.message : String(e),
      });
    }
  }

  async function handleChangePassword() {
    setFeedback(null);
    try {
      await clientApi.changeOwnPassword(auth, currentSecret, newSecret);
      setCurrentSecret('');
      setNewSecret('');
      await onRefreshDashboard();
      setFeedback({
        kind: 'ok',
        text: 'Mot de passe renouvelé avec succès côté serveur (UTI05 / OS185).',
      });
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof ApiClientError ? e.message : String(e),
      });
    }
  }

  const calendarUrl = `https://club.cfitness-fictif.local/ics/${draft.calendarFeedToken}.ics`;

  return cleanUiTree(
    <div className="space-y-5">
      <div className="cf-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          {isTechnicalMode && (
            <div className="text-xs cf-mono text-violet-300">
              MC13 • UTI01–UTI05 • EXT03 • EX32
            </div>
          )}
          <h1 className="text-xl font-bold mt-0.5">
            Mes préférences personnelles, calendrier &amp; sécurité
          </h1>
          <p className="text-xs cf-muted mt-1">
            Paramètres individuels : langue (11 choix), canaux de notification,
            révocation du flux .ics, mot de passe et SSO.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSavePrefs}
          className="cf-brand-gradient text-white text-xs font-semibold px-4 py-2.5 rounded-btn"
        >
          Enregistrer mes préférences
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-card border text-xs flex items-center gap-2.5 ${
            feedback.kind === 'ok'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/50 border-red-500/50 text-red-200'
          }`}
        >
          {feedback.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Langue & Notifications */}
        <div className="cf-card p-5 space-y-4">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            Langue d’interface (UTI01 — 11 langues)
          </div>
          <select
            value={draft.language}
            onChange={(e) =>
              setDraft((p) => ({ ...p, language: e.target.value }))
            }
            className="cf-input w-full px-3 py-2 text-xs"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          <div className="pt-2 border-t border-[var(--cf-border)] space-y-3">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-400" />
              Notifications (UTI03 / TST29)
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between cf-card-secondary p-3">
                <span>Notifications par e-mail</span>
                <input
                  type="checkbox"
                  checked={draft.notifications.emailEnabled}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      notifications: {
                        ...p.notifications,
                        emailEnabled: e.target.checked,
                      },
                    }))
                  }
                  className="accent-violet-500"
                />
              </label>

              <label className="flex items-center justify-between cf-card-secondary p-3">
                <span>Alertes SMS urgentes (remplacements)</span>
                <input
                  type="checkbox"
                  checked={draft.notifications.smsEnabled}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      notifications: {
                        ...p.notifications,
                        smsEnabled: e.target.checked,
                      },
                    }))
                  }
                  className="accent-violet-500"
                />
              </label>

              <label className="flex items-center justify-between cf-card-secondary p-3">
                <span>Inclure le rapport d’activité périodique</span>
                <input
                  type="checkbox"
                  checked={draft.notifications.includeActivityReport}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      notifications: {
                        ...p.notifications,
                        includeActivityReport: e.target.checked,
                      },
                    }))
                  }
                  className="accent-violet-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="cf-muted block mb-1">Fréquence</label>
                <select
                  value={draft.notifications.frequency}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      notifications: {
                        ...p.notifications,
                        frequency: e.target
                          .value as UserPreferences['notifications']['frequency'],
                      },
                    }))
                  }
                  className="cf-input w-full px-3 py-2"
                >
                  <option value="immediate">Immédiate</option>
                  <option value="daily">Quotidienne</option>
                  <option value="weekly">Hebdomadaire</option>
                </select>
              </div>
              <div>
                <label className="cf-muted block mb-1">Heure d’envoi</label>
                <input
                  type="time"
                  value={draft.notifications.digestHour}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      notifications: {
                        ...p.notifications,
                        digestHour: e.target.value,
                      },
                    }))
                  }
                  className="cf-input w-full px-3 py-2 cf-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Synchronisation calendrier + Mot de passe + SSO */}
        <div className="space-y-4">
          <div className="cf-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-2">
                <CalendarSync className="w-4 h-4 text-emerald-400" />
                Flux calendrier privé .ics (UTI04 / EX32)
              </div>
              <label className="text-xs flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={draft.calendarFeedEnabled}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      calendarFeedEnabled: e.target.checked,
                    }))
                  }
                  className="accent-violet-500"
                />
                Actif
              </label>
            </div>

            <div className="cf-card-secondary p-3 cf-mono text-[11px] break-all text-cyan-300">
              {calendarUrl}
            </div>

            <button
              type="button"
              onClick={handleRevokeCalendar}
              className="cf-card-secondary px-3.5 py-2 text-xs font-semibold text-amber-300 hover:border-amber-500/60 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Révoquer et régénérer l’URL .ics (EX32)
            </button>
          </div>

          <div className="cf-card p-5 space-y-3">
            <div className="font-semibold text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-rose-400" />
              Changement de mot de passe (UTI05 / OS185)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <input
                type="password"
                placeholder="Mot de passe actuel"
                value={currentSecret}
                onChange={(e) => setCurrentSecret(e.target.value)}
                className="cf-input px-3 py-2"
              />
              <input
                type="password"
                placeholder="Nouveau secret (≥ 12 car.)"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                className="cf-input px-3 py-2"
              />
            </div>
            <button
              type="button"
              onClick={handleChangePassword}
              className="cf-card-secondary px-3.5 py-2 text-xs font-semibold hover:border-violet-500/60"
            >
              Valider le nouveau mot de passe
            </button>
          </div>

          <div className="cf-card p-5 space-y-2.5 text-xs">
            <div className="font-semibold text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              Authentification SSO (EXT03 — OIDC / SAML)
            </div>
            <p className="cf-muted">
              Fournisseur : <span className="cf-mono">{draft.ssoProvider}</span> •
              Statut :{' '}
              <span className="cf-mono text-amber-300">
                {draft.ssoEnabled ? 'Activé' : 'En attente de configuration'}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>,
    isTechnicalMode
  );
}
