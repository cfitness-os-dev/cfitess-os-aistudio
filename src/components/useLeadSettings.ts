import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { clientApi } from '../domain/clientApi';
import type { LeadClubId } from '../domain/leadSettings';
import { LeadSettingsEditor } from '../domain/leadSettingsEditor';

export function useLeadSettings(actorId: string, clubId: LeadClubId) {
  const editor = useMemo(() => {
    const auth = { actorId, siteId: clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie' };
    return new LeadSettingsEditor(clubId, {
      load: () => clientApi.getLeadSettings(auth, clubId),
      save: settings => clientApi.putLeadSettings(auth, clubId, settings),
    });
  }, [actorId, clubId]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => { void editor.load(); return editor.cancel; }, [editor]);
  return { editor, state };
}
