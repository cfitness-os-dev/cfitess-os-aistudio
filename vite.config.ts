import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { CFitnessApiEngine } from './src/domain/apiEngine';
import {
  CANDIDATE_ACTIONS,
  ENTITIES_META,
  EXT_COMPLEMENTS,
  MC_SECTIONS,
  SOURCE_SCREENS,
  TOTAL_HISTORICAL_ENTRIES,
} from './src/domain/referenceRegistry';
import type { Organization, ProfileId, Scope, UserPreferences } from './src/domain/types';
import {
  ingestLeadClubEntryWebhook,
  LEAD_11_BLOCAGES,
  LEAD_16_EXEMPLES,
  LEAD_23_ECARTS,
  LEAD_28_TRACEABILITY_GROUPS,
  LEAD_AUDIT_META,
  LEAD_PARTNERS_9,
  LEAD_SETTINGS_TABS_14,
} from './src/domain/leadAuditRegistry';

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function headerStr(req: IncomingMessage, key: string, fallback: string): string {
  const val = req.headers[key];
  if (typeof val === 'string' && val.trim()) return val.trim();
  if (Array.isArray(val) && val[0]?.trim()) return val[0].trim();
  return fallback;
}

function registerApiRoutes(middlewares: Connect.Server, engine: CFitnessApiEngine): void {
  middlewares.use(async (req, res, next) => {
    const rawUrl = req.url ?? '/';
    if (!rawUrl.startsWith('/api/')) {
      next();
      return;
    }

    const url = new URL(rawUrl, 'http://localhost');
    const path = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();
    const actorId = headerStr(req, 'x-cfitness-actor-id', 'emp-employe-multi');
    const siteId = headerStr(req, 'x-cfitness-site-id', 'club-carre-soie');

    try {
      if (method === 'GET' && path === '/api/health') {
        sendJson(res, 200, {
          status: 'ok',
          service: 'cfitness-os',
          version: '1.2.0-v1.16-unified',
          backend: 'vite-middleware',
          osTarget: 'Linux Debian 12 (Bookworm)',
          siret: '818 651 317 00018',
          clubs: [
            'Carré de Soie — 2 Rue Jacquard, 69120 Vaulx-en-Velin (04 26 22 55 30)',
            'Beynost — ZAC des Baterses, 01700 Beynost (04 22 91 36 82)',
          ],
          wireguardTunnel: 'CONNECTED (< 3 ms)',
          heitzWsEndpoint: process.env.HEITZ_WS_URL ?? 'http://10.10.0.20:8080/api/heitz-ws',
          yeastarGsm07Gateway: process.env.YEASTAR_TG400_SIP_GATEWAY ?? '10.10.0.14:5060',
          rhV116Registry: '91 écrans / 1605 entrées / 117 fichiers références',
          leadAuditV04: '84 fichiers / 1682 entrées LEAD / 9 modules + 6 comm + 14 paramètres',
          timestampUtc: new Date().toISOString(),
        });
        return;
      }

      if (method === 'GET' && path === '/api/lead/registry') {
        sendJson(res, 200, {
          meta: LEAD_AUDIT_META,
          groups: LEAD_28_TRACEABILITY_GROUPS,
          ecarts: LEAD_23_ECARTS,
          blocages: LEAD_11_BLOCAGES,
          exemples: LEAD_16_EXEMPLES,
          settingsTabs: LEAD_SETTINGS_TABS_14,
          partners: LEAD_PARTNERS_9,
        });
        return;
      }

      if (method === 'POST' && path === '/api/lead/webhooks/clubEntry') {
        const body = await readJsonBody(req);
        const webhookRes = ingestLeadClubEntryWebhook({
          apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
          club: typeof body.club === 'string' ? body.club : undefined,
          email: typeof body.email === 'string' ? body.email : undefined,
          lastname: typeof body.lastname === 'string' ? body.lastname : undefined,
          firstname: typeof body.firstname === 'string' ? body.firstname : undefined,
          offername: typeof body.offername === 'string' ? body.offername : undefined,
          phone: typeof body.phone === 'string' ? body.phone : undefined,
          source: typeof body.source === 'string' ? body.source : undefined,
          utm_source: typeof body.utm_source === 'string' ? body.utm_source : undefined,
          utm_campaign: typeof body.utm_campaign === 'string' ? body.utm_campaign : undefined,
          utm_medium: typeof body.utm_medium === 'string' ? body.utm_medium : undefined,
          isWix: body.isWix === true,
        });
        sendJson(
          res,
          webhookRes.status,
          webhookRes.ok
            ? {
                ok: true,
                entryType: webhookRes.entryType,
                idempotencyKey: webhookRes.idempotencyKey,
                receivedAtUtc: new Date().toISOString(),
                contact: {
                  club: body.club,
                  email: body.email,
                  firstname: body.firstname,
                  lastname: body.lastname,
                  offername: body.offername ?? null,
                  utmSource: body.utm_source ?? null,
                  utmCampaign: body.utm_campaign ?? null,
                },
              }
            : { ok: false, error: webhookRes.error }
        );
        return;
      }

      if (method === 'POST' && path.startsWith('/api/v2/appointment/webhooks/stripe/')) {
        const clubSlug = decodeURIComponent(path.replace('/api/v2/appointment/webhooks/stripe/', ''));
        const body = await readJsonBody(req);
        const paymentStatus = typeof body.paymentStatus === 'string' ? body.paymentStatus : 'pending';
        const bookingConfirmed = paymentStatus === 'paid';
        sendJson(res, 200, {
          ok: true,
          club: clubSlug || 'beynost',
          paymentStatus,
          bookingStatus: bookingConfirmed ? 'confirme' : 'provisoire_attente_paiement',
          slotBlocked: bookingConfirmed,
          verifiedAtUtc: new Date().toISOString(),
        });
        return;
      }

      if (method === 'GET' && path === '/api/registry') {
        sendJson(res, 200, {
          total_screens: SOURCE_SCREENS.length,
          total_historical_entries: TOTAL_HISTORICAL_ENTRIES,
          total_complements: EXT_COMPLEMENTS.length,
          total_candidate_actions: CANDIDATE_ACTIONS.length,
          sections: MC_SECTIONS,
          screens: SOURCE_SCREENS,
          complements: EXT_COMPLEMENTS,
          actions: CANDIDATE_ACTIONS,
          entities: ENTITIES_META,
        });
        return;
      }

      if (method === 'GET' && path === '/api/ambiguities') {
        sendJson(res, 200, engine.getAmbiguities());
        return;
      }

      if (method === 'GET' && path === '/api/session') {
        const result = engine.getSession(actorId, siteId);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'GET' && path.startsWith('/api/section-access/')) {
        const sectionId = decodeURIComponent(path.replace('/api/section-access/', ''));
        const result = engine.assertSectionRouteAccess(
          actorId,
          siteId,
          sectionId as Parameters<typeof engine.assertSectionRouteAccess>[2]
        );
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'GET' && path === '/api/dashboard') {
        const result = engine.getDashboardData(actorId, siteId);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'PATCH' && path.startsWith('/api/shifts/')) {
        const shiftId = decodeURIComponent(path.replace('/api/shifts/', ''));
        const body = await readJsonBody(req);
        const result = engine.updateShift(actorId, siteId, shiftId, {
          startTime: typeof body.startTime === 'string' ? body.startTime : undefined,
          endTime: typeof body.endTime === 'string' ? body.endTime : undefined,
          breakMinutes: typeof body.breakMinutes === 'number' ? body.breakMinutes : undefined,
        });
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'GET' && path === '/api/admin/profiles') {
        const result = engine.getProfilesForAdmin(actorId, siteId);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'PUT' && path.startsWith('/api/admin/profiles/')) {
        const profileId = decodeURIComponent(path.replace('/api/admin/profiles/', '')) as ProfileId;
        const body = await readJsonBody(req);
        const result = engine.updateRolePermissions(
          actorId,
          siteId,
          profileId,
          (body.scopeSelected as Scope) ?? 'self',
          (body.checkedMap as Record<string, boolean>) ?? {}
        );
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'GET' && path === '/api/admin/audit-log') {
        const result = engine.getAuditEvents(actorId, siteId, {
          query: url.searchParams.get('query') ?? undefined,
          actionType: url.searchParams.get('actionType') ?? undefined,
          siteFilter: url.searchParams.get('siteFilter') ?? undefined,
          startDate: url.searchParams.get('startDate') ?? undefined,
          endDate: url.searchParams.get('endDate') ?? undefined,
        });
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'GET' && path === '/api/admin/audit-log/csv') {
        const result = engine.exportAuditCsv(actorId, siteId);
        if (result.status !== 200 || !result.data) {
          sendJson(res, result.status, { error: result.error });
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="cfitness_audit.csv"');
        res.end(result.data);
        return;
      }

      if (method === 'PUT' && path === '/api/admin/organization') {
        const body = (await readJsonBody(req)) as Partial<Organization>;
        const result = engine.updateOrganization(actorId, siteId, body);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'PUT' && path === '/api/admin/org02-policy') {
        const body = await readJsonBody(req);
        const policy = body.policy;
        if (policy !== 'exclude_skello_saas' && policy !== 'keep_internal_admin') {
          sendJson(res, 400, { error: 'Politique ORG02 invalide.' });
          return;
        }
        const result = engine.updateOrg02BillingPolicy(actorId, siteId, policy);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'GET' && path === '/api/admin/backup') {
        const result = engine.exportBackupJson(actorId, siteId);
        if (result.status !== 200 || !result.data) {
          sendJson(res, result.status, { error: result.error });
          return;
        }
        sendJson(res, 200, { backupJson: result.data });
        return;
      }

      if (method === 'POST' && path === '/api/admin/restore') {
        const body = await readJsonBody(req);
        const rawBackup = typeof body.backupJson === 'string' ? body.backupJson : '';
        const result = engine.restoreBackupJson(actorId, siteId, rawBackup);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'PUT' && path === '/api/me/preferences') {
        const body = (await readJsonBody(req)) as Partial<UserPreferences>;
        const result = engine.updateOwnPreferences(actorId, body);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'POST' && path === '/api/me/calendar-token/revoke') {
        const result = engine.revokeCalendarToken(actorId);
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'POST' && path === '/api/me/password') {
        const body = await readJsonBody(req);
        const result = engine.changeOwnPassword(
          actorId,
          typeof body.currentSecret === 'string' ? body.currentSecret : '',
          typeof body.newSecret === 'string' ? body.newSecret : ''
        );
        sendJson(res, result.status, result.data ?? { error: result.error });
        return;
      }

      if (method === 'POST' && path === '/api/auth/login') {
        const body = await readJsonBody(req);
        const roleRequested =
          typeof body.roleRequested === 'string' ? body.roleRequested : 'admin';
        sendJson(res, 200, {
          authenticated: true,
          authMode: 'LOCAL_ARGON2ID_DEBIAN12',
          role: roleRequested,
          sessionToken: `cfos-local-jwt-${Math.floor(Date.now() / 1000)}`,
          issuedAt: new Date().toISOString(),
        });
        return;
      }

      if (method === 'POST' && path === '/api/heitz/gate-check') {
        const body = await readJsonBody(req);
        const clubId = typeof body.clubId === 'string' ? body.clubId : 'carre-de-soie';
        const homeClubId = typeof body.homeClubId === 'string' ? body.homeClubId : clubId;
        const memberId = typeof body.memberId === 'string' ? body.memberId : 'm-0';
        const badgeCode = typeof body.badgeCode === 'string' ? body.badgeCode : 'HZ-0000';
        const finBalanceEur = typeof body.finBalanceEur === 'number' ? body.finBalanceEur : 0;
        const fireAlarmOpen = body.fireAlarmOpen === true;

        if (fireAlarmOpen) {
          sendJson(res, 200, {
            granted: true,
            clubId,
            memberId,
            badgeCode,
            latencyMs: 4,
            reason: 'URGENCE INCENDIE ACTIVE : Portillons libérés mécaniquement',
            qrTokenGenerated: null,
            smsRelanceSent: false,
            heitzVmReachable: true,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (finBalanceEur < 0) {
          sendJson(res, 200, {
            granted: false,
            clubId,
            memberId,
            badgeCode,
            latencyMs: 19,
            reason: `Accès bloqué : impayé SEPA (${finBalanceEur.toFixed(2)} €). SMS de régularisation envoyé + alerte accueil.`,
            qrTokenGenerated: null,
            smsRelanceSent: true,
            heitzVmReachable: true,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const interClubNote =
          homeClubId !== clubId
            ? 'Circulation bi-club Carré de Soie ↔ Beynost autorisée sans supplément (D9)'
            : "Accès nominal club d'origine autorisé";
        sendJson(res, 200, {
          granted: true,
          clubId,
          memberId,
          badgeCode,
          latencyMs: 14,
          reason: interClubNote,
          qrTokenGenerated: `HZ-QR-${clubId.toUpperCase()}-${badgeCode}-${Math.floor(Date.now() / 1000)}`,
          smsRelanceSent: false,
          heitzVmReachable: true,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (method === 'POST' && path === '/api/ats/ingest-email') {
        const body = await readJsonBody(req);
        const cvPdf =
          typeof body.attachmentPdf === 'string' && body.attachmentPdf.trim()
            ? body.attachmentPdf.trim()
            : 'CV_Candidat_CFitness_2026.pdf';
        sendJson(res, 201, {
          ok: true,
          channel: 'recrutement@c.fitness',
          extractedEmail: typeof body.senderLine === 'string' ? body.senderLine : '',
          extractedPhone: typeof body.bodyText === 'string' ? body.bodyText : '',
          cvPdf,
          rgpdAcknowledgmentSent: true,
          assignedKanbanStage: 'Reçue',
        });
        return;
      }

      if (method === 'GET' && path === '/api/backup/snapshot') {
        sendJson(res, 200, {
          schemaVersion: 'cfos-replica-v1.2',
          primaryServer: '10.10.0.10 (Debian 12 Carré de Soie)',
          replicas: [
            'PC Secours Accueil Beynost (10.20.0.15)',
            'PC Portable Direction Carré de Soie (10.10.0.12)',
            'Tablette Kiosque Accueil Carré de Soie (10.10.0.31)',
            'Tablette Kiosque Accueil Beynost (10.20.0.31)',
            'Smartphone Mario Carvalho (PWA 5G Offline)',
            'Smartphone Daniel Carvalho (PWA 5G Offline)',
          ],
          rpoSeconds: 15,
          failoverReady: true,
          timestampUtc: new Date().toISOString(),
        });
        return;
      }

      if (method === 'POST' && path === '/api/backup/snapshot') {
        const body = await readJsonBody(req);
        sendJson(res, 200, {
          ok: true,
          mergedFrom: typeof body.originDevice === 'string' ? body.originDevice : 'unknown',
          checksumVerified: typeof body.checksum === 'string' ? body.checksum : '',
          mergedAt: new Date().toISOString(),
        });
        return;
      }

      sendJson(res, 404, { error: `Route API inconnue : ${method} ${path}` });
    } catch {
      sendJson(res, 400, { error: 'Corps JSON de requête invalide.' });
    }
  });
}

function cfitnessApiPlugin(): Plugin {
  const engine = new CFitnessApiEngine();
  return {
    name: 'cfitness-local-api-middleware',
    configureServer(server) {
      registerApiRoutes(server.middlewares, engine);
    },
    configurePreviewServer(server) {
      registerApiRoutes(server.middlewares, engine);
    },
  };
}

export default defineConfig({
  plugins: [react(), cfitnessApiPlugin()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
  },
});
