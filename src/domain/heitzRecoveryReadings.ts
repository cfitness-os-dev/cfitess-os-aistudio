import type { ClubId } from '../types/cfos';
export interface Forecast {
    date: string;
    valuePayment: number;
    valueSale: number;
    valuePoints: number;
}
export interface Schedule {
    id: number;
    next: string | null;
    last: string | null;
    label: string | null;
    totalSale: string | null;
    totalPayment: string | null;
    totalPoints: string | null;
    access: string | null;
    period: string | null;
    processManually: boolean | null;
}
export interface Subscription {
    id: number;
    accessLabel: string | null;
}
export type SourceSection<T> = {
    status: 'loaded';
    items: T[];
    completeHistoryVerified: false;
} | {
    status: 'unavailable';
    items: null;
    message: string;
    completeHistoryVerified: false;
};
export interface HeitzRecoveryReadings {
    actorId: string;
    caseId: string;
    clubId: ClubId;
    revision: string;
    collectedAtUtc: string;
    partial: boolean;
    provisional: SourceSection<Forecast>;
    display: SourceSection<Schedule>;
    subscriptions: SourceSection<Subscription>;
    paymentsCollected: false;
    contractOriginalsCollected: false;
    termsOriginalsCollected: false;
    signatureStatus: 'not_checked';
    documents: {
        status: 'targeting_to_qualify';
        message: string;
    };
    notice: string;
}
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const text = (v: unknown) => v === null || typeof v === 'string';
const section = (s: SourceSection<unknown>, valid: (r: Record<string, unknown>) => boolean) => !!s && s.completeHistoryVerified === false && (s.status === 'unavailable' ? s.items === null && typeof s.message === 'string' : s.status === 'loaded' && Array.isArray(s.items) && s.items.length <= 2000 && s.items.every(r => r && typeof r === 'object' && valid(r as Record<string, unknown>)));
export function validateHeitzRecoveryReadings(value: unknown, actor: string, id: string, club: ClubId, revision: string): HeitzRecoveryReadings {
    const v = value as HeitzRecoveryReadings;
    if (!v || v.actorId !== actor || v.caseId !== id || v.clubId !== club || v.revision !== revision || !date(v.collectedAtUtc) || typeof v.partial !== 'boolean' || v.paymentsCollected !== false || v.contractOriginalsCollected !== false || v.termsOriginalsCollected !== false || v.signatureStatus !== 'not_checked' || v.documents?.status !== 'targeting_to_qualify' || typeof v.documents.message !== 'string' || typeof v.notice !== 'string' || !section(v.provisional, r => date(r.date) && ['valuePayment', 'valueSale', 'valuePoints'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]))) || !section(v.display, r => typeof r.id === 'number' && Number.isSafeInteger(r.id) && r.id > 0 && ['label', 'totalSale', 'totalPayment', 'totalPoints', 'access', 'period'].every(k => text(r[k])) && [r.next, r.last].every(d => d === null || date(d)) && (r.processManually === null || typeof r.processManually === 'boolean')) || !section(v.subscriptions, r => typeof r.id === 'number' && Number.isSafeInteger(r.id) && r.id > 0 && text(r.accessLabel)) || v.partial !== [v.provisional, v.display, v.subscriptions].some(s => s.status === 'unavailable'))
        throw new Error('Les sources reçues ne correspondent pas au dossier et au club demandés. Actualisez le dossier.');
    for (const s of [v.display, v.subscriptions])
        if (s.status === 'loaded' && new Set(s.items.map(r => r.id)).size !== s.items.length)
            throw new Error('Les références Heitz sont répétées. Actualisez les sources.');
    return v;
}
export async function fetchHeitzRecoveryReadings(actor: string, id: string, club: ClubId, revision: string, signal: AbortSignal): Promise<HeitzRecoveryReadings> {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    if (!token || window.sessionStorage.getItem('cfos_bearer_actor_id') !== actor)
        throw new Error('Reconnectez-vous pour consulter les sources Heitz.');
    const res = await fetch('/api/recovery/cases/' + encodeURIComponent(id) + '/heitz-readings?revision=' + encodeURIComponent(revision), { signal, headers: { Authorization: 'Bearer ' + token } });
    const value: unknown = await res.json();
    if (!res.ok)
        throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'La lecture Heitz n’a pas été confirmée.');
    return validateHeitzRecoveryReadings(value, actor, id, club, revision);
}
