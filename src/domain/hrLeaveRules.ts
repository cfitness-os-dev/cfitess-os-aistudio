import type { ClubId } from '../types/cfos';
export type CounterFamily = 'none' | 'cp' | 'rtt';
export interface LeaveAllocations {
    cpN: number;
    cpNMinus1: number;
    rtt: number;
}
export interface LeavePolicy {
    requestRevision: string;
    startPeriod: 'am' | 'pm';
    endPeriod: 'am' | 'pm';
    motiveId: string | null;
    active: boolean | null;
    counterFamily: CounterFamily;
    requiresDocument: boolean;
    missingDocument: boolean;
    documentIds: string[];
    documents: Array<{
        id: string;
        title: string;
        text: string | null;
    }>;
    canViewDocuments: boolean;
    policyRevision: string;
    canSettle: boolean;
    hasActiveSettlement: boolean;
    counter: null | {
        revision: string;
        values: {
            cpNAcquired: number;
            cpNTaken: number;
            cpNMinus1Remaining: number;
            rttDaysRemaining: number | null;
            annualizationBalanceHours: number | null;
        };
    };
    activeSettlement: null | {
        id: string;
        family: CounterFamily;
        allocations: LeaveAllocations;
        appliedAt: string;
    };
    settlementHistory: Array<{
        id: string;
        family: CounterFamily;
        allocations: LeaveAllocations;
        active: boolean;
        appliedAt: string;
        reason: string;
        reversedAt: string | null;
    }>;
}
export interface LeaveCounterRules {
    actorId: string;
    siteId: string;
    revision: string;
    canEdit: boolean;
    motives: Array<{
        id: string;
        label: string;
        active: boolean;
        employeeRequestable: boolean;
        requiresDocument: boolean;
        counterFamily: CounterFamily;
    }>;
}
export function validateLeaveCounterRules(value: unknown, actorId: string, clubId: ClubId): LeaveCounterRules {
    if (!value || typeof value !== 'object')
        throw new Error('Règles d’absence incomplètes.');
    const row = value as LeaveCounterRules;
    const site = clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie';
    if (row.actorId !== actorId || row.siteId !== site)
        throw new Error('Règles reçues pour un autre compte ou club.');
    if (typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision) || typeof row.canEdit !== 'boolean' ||
        !Array.isArray(row.motives) || !row.motives.every(m => typeof m.id === 'string' && typeof m.label === 'string' && typeof m.active === 'boolean' && typeof m.employeeRequestable === 'boolean' && typeof m.requiresDocument === 'boolean' && ['none', 'cp', 'rtt'].includes(m.counterFamily)))
        throw new Error('Règles de décompte ou autorisations incomplètes.');
    return row;
}
export function validAllocations(values: LeaveAllocations, family: CounterFamily): boolean {
    if (!Object.values(values).every(v => Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-7))
        return false;
    return family === 'cp' ? values.rtt === 0 && values.cpN + values.cpNMinus1 > 0 : family === 'rtt' ? values.cpN === 0 && values.cpNMinus1 === 0 && values.rtt > 0 : false;
}
function bearer(actorId: string): string {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    if (!token || window.sessionStorage.getItem('cfos_bearer_actor_id') !== actorId)
        throw new Error('Reconnectez-vous pour accéder aux règles d’absence.');
    return token;
}
async function call(actorId: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(path, { method, signal, headers: { Authorization: 'Bearer ' + bearer(actorId), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const value: unknown = await response.json();
    if (!response.ok)
        throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'Enregistrement impossible.');
    return value;
}
export async function getLeaveCounterRules(actorId: string, clubId: ClubId, signal?: AbortSignal): Promise<LeaveCounterRules> {
    return validateLeaveCounterRules(await call(actorId, '/api/hr/leave-rules/' + clubId, 'GET', undefined, signal), actorId, clubId);
}
export async function saveLeaveCounterRule(actorId: string, clubId: ClubId, body: {
    expectedRevision: string;
    motiveId: string;
    family: CounterFamily;
}): Promise<LeaveCounterRules> {
    return validateLeaveCounterRules(await call(actorId, '/api/hr/leave-rules/' + clubId, 'PUT', body), actorId, clubId);
}
export async function settleLeave(actorId: string, clubId: ClubId, requestId: string, body: {
    action: 'approve' | 'reverse';
    expectedRequestRevision: string;
    expectedCounterRevision: string;
    expectedPolicyRevision: string;
    allocations: LeaveAllocations;
    reason: string;
    nextStatus?: 'pending' | 'rejected';
}): Promise<void> {
    const result = await call(actorId, '/api/hr/leave-rules/' + clubId + '/requests/' + encodeURIComponent(requestId) + '/settle', 'POST', body);
    if (!result || typeof result !== 'object' || !('requestId' in result) || result.requestId !== requestId)
        throw new Error('La confirmation reçue ne correspond pas à cette demande. Actualisez avant toute nouvelle action.');
}
