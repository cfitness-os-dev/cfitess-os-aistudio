import type { ClubId } from '../types/cfos';
import type { EmployeeCounter } from './hrEmployeeDossier';
export interface VerifiedCredit { days: number; reference: string }
export interface AccrualPolicy {
    enabled: boolean;
    unit: 'unconfigured' | 'ouvrables' | 'ouvres' | 'calendaires';
    monthlyDays: number | null;
    rounding: 'nearest' | 'up' | 'down';
    periodStartMonth: number | null;
    carryMode: 'keep_all' | 'limit' | 'none';
    carryLimit: number | null;
    priorCarryMode: 'keep' | 'expire';
    reference: string;
    absenceAcquisition?: Record<string, boolean | null>;
}
export interface AccrualSnapshot {
    actorId: string;
    siteId: string;
    revision: string;
    canEdit: boolean;
    policy: AccrualPolicy;
    motives: Array<{ id: string; label: string; active: boolean }>;
    employees: Array<{
        id: string;
        name: string;
        primary: boolean;
        counter: EmployeeCounter;
        account: null | {
            activePeriod: string | null;
            closedThrough: string | null;
            epoch: number;
        };
    }>;
    history: Array<{
        id: string;
        employeeId: string;
        kind: string;
        month: string;
        amount: number;
        carried: number;
        expired: number;
        reason: string;
        timestamp: string;
        verifiedCredit?: VerifiedCredit | null;
    }>;
}
export interface AccrualRequest {
    employeeId: string;
    kind: 'accrue' | 'rollover';
    month: string;
    verifiedCredit?: VerifiedCredit;
}
export interface AccrualPreview {
    revision: string;
    plan: {
        employeeId: string;
        siteId: string;
        kind: string;
        month: string;
        periodStart: string;
        periodEnd: string;
        nextPeriod: string;
        before: EmployeeCounter;
        after: EmployeeCounter;
        amount: number;
        carried: number;
        expired: number;
        baselineRequired: boolean;
        absenceReviewRequired: boolean;
        absenceCount: number;
        unverifiedAbsenceCount: number;
        verifiedCredit?: VerifiedCredit | null;
    };
}
export function validateVerifiedCredit(credit: VerifiedCredit): string | null {
    return !credit || typeof credit.days !== 'number' || !Number.isFinite(credit.days) || credit.days < 0 || credit.days > 100 || Math.abs(credit.days * 100 - Math.round(credit.days * 100)) > 1e-6 || typeof credit.reference !== 'string' || !credit.reference.trim() || credit.reference.length > 1000 ? 'Renseignez un montant vérifié entre 0 et 100 jours (deux décimales) et sa référence de calcul.' : null;
}
export function validateAccrualPolicy(p: AccrualPolicy): string | null {
    if (p.absenceAcquisition !== undefined && (!p.absenceAcquisition || typeof p.absenceAcquisition !== 'object' || Array.isArray(p.absenceAcquisition) || Object.keys(p.absenceAcquisition).length > 1000 || Object.values(p.absenceAcquisition).some(v => v !== null && typeof v !== 'boolean')))
        return 'Effet des motifs sur l’acquisition invalide.';
    if (typeof p.enabled !== 'boolean' || typeof p.reference !== 'string')
        return 'Règles d’acquisition incomplètes.';
    if (!['unconfigured', 'ouvrables', 'ouvres', 'calendaires'].includes(p.unit) || !['nearest', 'up', 'down'].includes(p.rounding) || !['keep_all', 'limit', 'none'].includes(p.carryMode) || !['keep', 'expire'].includes(p.priorCarryMode))
        return 'Règle de congés inconnue.';
    if (p.monthlyDays !== null && (!Number.isFinite(p.monthlyDays) || p.monthlyDays < .01 || p.monthlyDays > 100 || Math.abs(p.monthlyDays * 10000 - Math.round(p.monthlyDays * 10000)) > 1e-6))
        return 'Acquisition mensuelle : de 0,01 à 100 jours, quatre décimales maximum.';
    if (p.periodStartMonth !== null && (!Number.isInteger(p.periodStartMonth) || p.periodStartMonth < 1 || p.periodStartMonth > 12))
        return 'Mois de début de période invalide.';
    if (p.carryLimit !== null && (!Number.isFinite(p.carryLimit) || p.carryLimit < 0 || p.carryLimit > 100 || Math.abs(p.carryLimit * 100 - Math.round(p.carryLimit * 100)) > 1e-6))
        return 'Plafond de report invalide.';
    if (p.carryMode === 'limit' && p.carryLimit === null)
        return 'Renseignez le plafond de report.';
    if (p.reference.length > 1000)
        return 'Référence trop longue.';
    if (p.enabled && (p.unit === 'unconfigured' || p.monthlyDays === null || p.periodStartMonth === null || !p.reference.trim()))
        return 'Vérifiez le taux, l’unité, la période et la référence avant d’activer.';
    return null;
}
function counterValid(v: unknown): v is EmployeeCounter {
    if (!v || typeof v !== 'object')
        return false;
    return ['cpNAcquired', 'cpNTaken', 'cpNMinus1Remaining'].every(k => typeof Reflect.get(v, k) === 'number' && Number.isFinite(Reflect.get(v, k)));
}
export function validateAccrualSnapshot(value: unknown, actorId: string, club: ClubId): AccrualSnapshot {
    const v = value as AccrualSnapshot;
    const site = club === 'beynost' ? 'club-beynost' : 'club-carre-soie';
    if (!v || v.actorId !== actorId || v.siteId !== site || typeof v.revision !== 'string' || !/^[a-f0-9]{64}$/.test(v.revision) || typeof v.canEdit !== 'boolean' || !v.policy || validateAccrualPolicy(v.policy) || !Array.isArray(v.motives) || !v.motives.every(m => typeof m.id === 'string' && typeof m.label === 'string' && typeof m.active === 'boolean') || Object.keys(v.policy.absenceAcquisition ?? {}).some(id => !v.motives.some(m => m.id === id)) || !Array.isArray(v.employees) || !Array.isArray(v.history) || !v.employees.every(e => typeof e.id === 'string' && typeof e.name === 'string' && typeof e.primary === 'boolean' && counterValid(e.counter)))
        throw new Error('Les règles ou les droits reçus ne correspondent pas à ce compte et à ce club.');
    return v;
}
export function validateAccrualPreview(value: unknown, request: AccrualRequest, club: ClubId): AccrualPreview {
    const v = value as AccrualPreview;
    const p = v?.plan;
    if (request.verifiedCredit ? !p?.verifiedCredit || validateVerifiedCredit(p.verifiedCredit) || p.verifiedCredit.days !== request.verifiedCredit.days || p.verifiedCredit.reference !== request.verifiedCredit.reference || p.amount !== request.verifiedCredit.days : p?.verifiedCredit != null)
        throw new Error('Le montant ou la référence de calcul reçus ne correspondent pas à votre demande.');
    if (!v || typeof v.revision !== 'string' || !/^[a-f0-9]{64}$/.test(v.revision) || !p || p.employeeId !== request.employeeId || p.kind !== request.kind || p.month !== request.month || p.siteId !== (club === 'beynost' ? 'club-beynost' : 'club-carre-soie') || !counterValid(p.before) || !counterValid(p.after) || typeof p.baselineRequired !== 'boolean' || typeof p.absenceReviewRequired !== 'boolean' || !Number.isInteger(p.absenceCount) || p.absenceCount < 0 || !Number.isInteger(p.unverifiedAbsenceCount) || p.unverifiedAbsenceCount < 0 || p.unverifiedAbsenceCount > p.absenceCount || (p.absenceReviewRequired !== (p.absenceCount > 0)) || ![p.amount, p.carried, p.expired].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0))
        throw new Error('L’aperçu reçu ne correspond pas à l’opération demandée.');
    return v;
}
async function call(actor: string, club: ClubId, method: string, suffix = '', body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    if (!token || window.sessionStorage.getItem('cfos_bearer_actor_id') !== actor)
        throw new Error('Reconnectez-vous pour consulter les acquisitions de congés.');
    const res = await fetch('/api/hr/leave-accrual/' + club + suffix, { method, signal, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data: unknown = await res.json();
    if (!res.ok)
        throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Opération non confirmée.');
    return data;
}
export async function loadAccrual(actor: string, club: ClubId, signal?: AbortSignal) { return validateAccrualSnapshot(await call(actor, club, 'GET', '', undefined, signal), actor, club); }
export async function saveAccrualPolicy(actor: string, club: ClubId, expectedRevision: string, policy: AccrualPolicy) {
    const error = validateAccrualPolicy(policy);
    if (error)
        throw new Error(error);
    return validateAccrualSnapshot(await call(actor, club, 'PUT', '', { expectedRevision, policy }), actor, club);
}
export async function previewAccrual(actor: string, club: ClubId, request: AccrualRequest) {
    if (request.verifiedCredit && (request.kind !== 'accrue' || validateVerifiedCredit(request.verifiedCredit)))
        throw new Error('Vérifiez le montant proratisé et sa référence avant de calculer l’aperçu.');
    return validateAccrualPreview(await call(actor, club, 'POST', '/preview', request), request, club);
}
export async function applyAccrual(actor: string, club: ClubId, input: {
    request: AccrualRequest;
    expectedPreview: string;
    baselineConfirmed: boolean;
    absenceReviewed: boolean;
    periodReviewed: boolean;
    confirmLoss: boolean;
    reason: string;
    calculationConfirmed?: boolean;
}) {
    const v = await call(actor, club, 'POST', '/apply', input);
    if (!v || typeof v !== 'object' || !('operationId' in v) || typeof v.operationId !== 'string' || !('employeeId' in v) || v.employeeId !== input.request.employeeId || !('snapshot' in v))
        throw new Error('Confirmation inattendue. Actualisez avant de recommencer.');
    return validateAccrualSnapshot(v.snapshot, actor, club);
}
