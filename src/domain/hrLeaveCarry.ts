import type { ClubId } from '../types/cfos';
export interface CarryRecord {
    id: string;
    employeeId: string;
    siteId: string;
    sourceStart: string;
    sourceEnd: string;
    initialDays: number;
    remainingDays: number;
    availableUntil: string;
    reference: string;
    status: 'open' | 'closed';
    notice: null | {
        notifiedOn: string;
        medium: string;
        evidence: string;
    };
    createdAt: string;
    updatedAt: string;
}
export interface CarryEmployee {
    id: string;
    name: string;
    primary: boolean;
    revision: string;
    priorBalance: number;
    protectedDays: number;
    cases: Array<{
        record: CarryRecord;
        balanceChanged: boolean;
        deadlinePassed: boolean;
    }>;
    history: Array<{
        id: string;
        employeeId: string;
        action: string;
        reason: string;
        timestamp: string;
        before: CarryRecord | null;
        after: CarryRecord;
    }>;
}
export interface CarrySnapshot {
    actorId: string;
    siteId: string;
    asOf: string;
    employees: CarryEmployee[];
}
export type CarryCommand = {
    action: 'create';
    sourceStart: string;
    sourceEnd: string;
    days: number;
    availableUntil: string;
    reference: string;
} | {
    action: 'reconcile';
    id: string;
    remainingDays: number;
} | {
    action: 'extend';
    id: string;
    availableUntil: string;
} | {
    action: 'notice';
    id: string;
    notifiedOn: string;
    medium: 'bulletin' | 'courrier' | 'email' | 'remise';
    evidence: string;
} | {
    action: 'close';
    id: string;
};
export interface CarryInput {
    employeeId: string;
    expectedRevision: string;
    reviewConfirmed: boolean;
    reason: string;
    command: CarryCommand;
}
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
const amount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
function record(v: CarryRecord, employeeId: string): boolean {
    return !!v && typeof v.id === 'string' && v.employeeId === employeeId && ['club-carre-soie', 'club-beynost'].includes(v.siteId) && date(v.sourceStart) && date(v.sourceEnd) && date(v.availableUntil) && v.sourceStart <= v.sourceEnd && v.sourceEnd <= v.availableUntil && amount(v.initialDays) && v.initialDays > 0 && amount(v.remainingDays) && v.remainingDays <= v.initialDays && ['open', 'closed'].includes(v.status) && (v.status !== 'closed' || v.remainingDays === 0) && typeof v.reference === 'string' && !!v.reference.trim() && timestamp(v.createdAt) && timestamp(v.updatedAt) && (v.notice === null || (!!v.notice && date(v.notice.notifiedOn) && ['bulletin', 'courrier', 'email', 'remise'].includes(v.notice.medium) && typeof v.notice.evidence === 'string' && !!v.notice.evidence.trim()));
}
export function validateCarrySnapshot(value: unknown, actor: string, club: ClubId): CarrySnapshot {
    const v = value as CarrySnapshot;
    if (!v || v.actorId !== actor || v.siteId !== (club === 'beynost' ? 'club-beynost' : 'club-carre-soie') || !date(v.asOf) || !Array.isArray(v.employees) || !v.employees.every(e => !!e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.primary === 'boolean' && typeof e.revision === 'string' && /^[a-f0-9]{64}$/.test(e.revision) && amount(e.priorBalance) && amount(e.protectedDays) && Array.isArray(e.cases) && e.cases.every(c => !!c && record(c.record, e.id) && typeof c.balanceChanged === 'boolean' && typeof c.deadlinePassed === 'boolean') && Math.abs(e.protectedDays - e.cases.reduce((n, c) => n + (c.record.status === 'open' ? c.record.remainingDays : 0), 0)) < 1e-6 && Array.isArray(e.history) && e.history.every(h => !!h && h.employeeId === e.id && typeof h.id === 'string' && typeof h.action === 'string' && typeof h.reason === 'string' && timestamp(h.timestamp) && record(h.after, e.id) && (h.before === null || record(h.before, e.id)))))
        throw new Error('Le suivi reçu ne correspond pas à ce compte et à ce club. Actualisez les données.');
    if (new Set(v.employees.map(e => e.id)).size !== v.employees.length || v.employees.some(e => new Set(e.cases.map(c => c.record.id)).size !== e.cases.length)) throw new Error('Le suivi reçu contient des dossiers dupliqués. Actualisez les données.');
    return v;
}
export function validateCarryInput(input: CarryInput): string | null {
    if (!input.employeeId || !/^[a-f0-9]{64}$/.test(input.expectedRevision) || !input.reviewConfirmed || !input.reason.trim() || input.reason.length > 1000)
        return 'Confirmez la vérification et renseignez un motif.';
    const c = input.command;
    if (c.action === 'create' && (!date(c.sourceStart) || !date(c.sourceEnd) || !date(c.availableUntil) || c.sourceStart > c.sourceEnd || c.availableUntil < c.sourceEnd || !amount(c.days) || c.days === 0 || !c.reference.trim() || c.reference.length > 1000))
        return 'Vérifiez la période, les jours concernés, l’échéance et la référence.';
    if (c.action !== 'create' && !c.id)
        return 'Choisissez un suivi existant.';
    if (c.action === 'reconcile' && !amount(c.remainingDays))
        return 'Vérifiez les jours encore concernés.';
    if (c.action === 'extend' && !date(c.availableUntil))
        return 'Renseignez la nouvelle échéance.';
    if (c.action === 'notice' && (!date(c.notifiedOn) || !['bulletin', 'courrier', 'email', 'remise'].includes(c.medium) || !c.evidence.trim() || c.evidence.length > 1000))
        return 'Renseignez la date, le support et la référence de l’information déjà remise.';
    return null;
}
async function call(actor: string, club: ClubId, input?: CarryInput, signal?: AbortSignal): Promise<CarrySnapshot> {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    if (!token || window.sessionStorage.getItem('cfos_bearer_actor_id') !== actor)
        throw new Error('Reconnectez-vous pour consulter les reports.');
    const res = await fetch('/api/hr/carryovers/' + club, { method: input ? 'POST' : 'GET', signal, headers: { Authorization: 'Bearer ' + token, ...(input ? { 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined });
    const value: unknown = await res.json();
    if (!res.ok)
        throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'Suivi non confirmé.');
    return validateCarrySnapshot(value, actor, club);
}
export const loadCarry = (actor: string, club: ClubId, signal?: AbortSignal) => call(actor, club, undefined, signal);
export function saveCarry(actor: string, club: ClubId, input: CarryInput) { const error = validateCarryInput(input); if (error)
    throw new Error(error); return call(actor, club, input); }
