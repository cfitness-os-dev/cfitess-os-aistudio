import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runGraftedSystemsCompatibilityAudit } from '../systemSecurityCompatibility';
import {
  INITIAL_EMPLOYEES,
  INITIAL_HEITZ_MEMBERS,
  INITIAL_HEITZ_KPI_TICKETS,
  INITIAL_HR_DOCUMENTS,
} from '../../data/seed';
import { BackupReplicaNode } from '../../types/cfos';

describe('systemSecurityCompatibility domain engine', () => {
  it('audits all 8 grafted systems and 4 active security layers with 100/100 score', () => {
    const sampleReplicas: BackupReplicaNode[] = [
      {
        id: 'rep-1',
        deviceName: 'PC Accueil Center',
        deviceType: 'pc_secours',
        clubId: 'carre-de-soie',
        ipOrHolder: '10.10.0.11',
        storageEngine: 'IndexedDB + JSON SHA-256',
        lastSyncedAt: new Date().toISOString(),
        lastChecksum: 'sha256-ok',
        snapshotSizeKb: 420,
        status: 'synchronise',
        autoSyncEnabled: true,
        recordsMirrored: {
          members: INITIAL_HEITZ_MEMBERS.length,
          employees: INITIAL_EMPLOYEES.length,
          prospects: 4,
          shifts: 12,
          offlinePunches: 0,
        },
      },
    ];

    const report = runGraftedSystemsCompatibilityAudit({
      employees: INITIAL_EMPLOYEES,
      heitzMembers: INITIAL_HEITZ_MEMBERS,
      heitzKpiTickets: INITIAL_HEITZ_KPI_TICKETS,
      hrDocuments: INITIAL_HR_DOCUMENTS,
      backupReplicas: sampleReplicas,
      serverPowerStatus: 'nominal',
    });

    assert.equal(report.totalSystemsCount, 8);
    assert.equal(report.compatibleSystemsCount, 8);
    assert.equal(report.totalSecurityLayersCount, 4);
    assert.equal(report.activeSecurityLayersCount, 4);
    assert.equal(report.overallScore, 100);
    assert.ok(report.systems.every((s) => s.status === 'COMPATIBLE_SECURISE'));
    assert.ok(report.systems.every((s) => s.verificationSteps.length >= 3));
  });
});
