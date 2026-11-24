import type {ScenarioWorkspace} from './leadScenariosApi';
import type {ScenarioClubId} from './leadScenarioDefinitions';

/** Only canonical, same-club records. A browser-only contact must not become actionable. */
export function prospectScenarios(workspace:ScenarioWorkspace,clubId:ScenarioClubId,prospectId:string) {
  const contact=workspace.clubId===clubId?workspace.prospects.find(p=>p.id===prospectId):undefined;
  const enrollments=contact?workspace.enrollments.filter(e=>e.clubId===clubId && e.prospectId===prospectId):[];
  const choices=contact?workspace.scenarios.filter(s=>s.clubId===clubId && s.active && !s.archived && !s.enrollmentLocked && s.versions.at(-1)?.definition.mode==='manual' && !enrollments.some(e=>e.scenarioId===s.id)):[];
  return {contact,enrollments,choices};
}
