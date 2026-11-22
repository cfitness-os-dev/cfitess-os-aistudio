import { leadSettingsError, parseLeadSettings, type LeadClubId, type LeadSettings } from './leadSettings';

export interface LeadSettingsReply { ok: boolean; clubId: string; settings: unknown }
export interface LeadSettingsState {
  status: 'loading' | 'ready' | 'error';
  settings: LeadSettings | null;
  saving: boolean;
  dirty: boolean;
  error: string | null;
  saved: boolean;
}

/** An editor belongs to exactly one actor/club pair, never to a shared local cache. */
export class LeadSettingsEditor {
  private state: LeadSettingsState = { status: 'loading', settings: null, saving: false, dirty: false, error: null, saved: false };
  private listeners = new Set<() => void>();
  private generation = 0;
  constructor(readonly clubId: LeadClubId, private transport: {
    load: () => Promise<LeadSettingsReply>;
    save: (settings: LeadSettings) => Promise<LeadSettingsReply>;
  }) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: LeadSettingsState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private decode(reply: LeadSettingsReply) {
    if (!reply.ok || reply.clubId !== this.clubId) throw new Error('Réponse du serveur incohérente avec le club sélectionné.');
    return parseLeadSettings(reply.settings, this.clubId);
  }
  load = async () => {
    const generation = ++this.generation;
    this.publish({ status: 'loading', settings: null, saving: false, dirty: false, error: null, saved: false });
    try {
      const settings = this.decode(await this.transport.load());
      if (generation === this.generation) this.publish({ ...this.state, status: 'ready', settings });
    } catch (error) {
      if (generation === this.generation) this.publish({ ...this.state, status: 'error', error: error instanceof Error ? error.message : 'Chargement impossible.' });
    }
  };
  cancel = () => { ++this.generation; };
  update = (change: (settings: LeadSettings) => LeadSettings) => {
    if (this.state.status !== 'ready' || this.state.saving || !this.state.settings) return;
    this.publish({ ...this.state, settings: change(this.state.settings), dirty: true, saved: false, error: null });
  };
  save = async () => {
    if (this.state.status !== 'ready' || this.state.saving || !this.state.settings) return false;
    const settings = this.state.settings;
    const invalid = leadSettingsError(settings, this.clubId);
    if (invalid) { this.publish({ ...this.state, error: invalid, saved: false }); return false; }
    const generation = this.generation;
    this.publish({ ...this.state, saving: true, saved: false, error: null });
    try {
      const confirmed = this.decode(await this.transport.save(settings));
      if (generation !== this.generation) return false;
      this.publish({ ...this.state, settings: confirmed, saving: false, dirty: false, saved: true });
      return true;
    } catch (error) {
      if (generation === this.generation) this.publish({ ...this.state, saving: false, error: error instanceof Error ? error.message : 'Enregistrement impossible.' });
      return false;
    }
  };
}
