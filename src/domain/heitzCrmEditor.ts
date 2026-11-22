import type { HeitzMember } from '../types/cfos';
import type { HeitzIntegration, HeitzSnapshotRow } from './heitzCrm';

export class HeitzCrmEditor {
  private state = { status: 'loading' as 'loading' | 'ready' | 'error', rows: [] as HeitzMember[],
    integration: null as HeitzIntegration | null, saving: false, error: null as string | null, saved: false };
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(private transport: {
    members: () => Promise<HeitzMember[]>;
    integration: () => Promise<HeitzIntegration>;
    import: (rows: HeitzSnapshotRow[]) => Promise<{ added: number; updated: number; totalProcessed: number }>;
  }) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<typeof this.state>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  cancel = () => { ++this.generation; this.publish({ status: 'error', rows: [], integration: null }); };
  load = async () => {
    const generation = ++this.generation;
    this.publish({ status: 'loading', rows: [], integration: null, error: null, saved: false, saving: false });
    try {
      const [rows, integration] = await Promise.all([this.transport.members(), this.transport.integration()]);
      if (generation === this.generation) this.publish({ status: 'ready', rows, integration });
    } catch (error) {
      if (generation === this.generation) this.publish({ status: 'error', error: error instanceof Error ? error.message : 'Chargement impossible.' });
    }
  };
  import = async (rows: HeitzSnapshotRow[]) => {
    if (this.state.status !== 'ready' || this.state.saving || !this.state.integration?.canImportSnapshot) return false;
    const generation = this.generation;
    this.publish({ saving: true, saved: false, error: null });
    try {
      const reply = await this.transport.import(rows);
      if (reply.totalProcessed !== rows.length || reply.added + reply.updated !== rows.length)
        throw new Error('Le serveur n’a pas confirmé le traitement complet de l’export. Rechargez les dossiers.');
      const confirmed = await this.transport.members();
      if (generation !== this.generation) return false;
      this.publish({ rows: confirmed, saving: false, saved: true });
      return true;
    } catch (error) {
      if (generation === this.generation) this.publish({ saving: false,
        error: error instanceof Error ? error.message : 'Import impossible. Réessayez ou rechargez les dossiers.' });
      return false;
    }
  };
}
