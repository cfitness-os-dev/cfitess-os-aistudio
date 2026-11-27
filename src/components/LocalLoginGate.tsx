import React, { useState } from 'react';
import { useCfos } from '../context/CfosContext';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Building2,
  Smartphone,
  Tablet,
  PhoneCall,
  LayoutDashboard,
  AlertTriangle,
  Unlock,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { ShellMode } from '../types/cfos';
import { CFITNESS_LEGAL_IDENTITY } from '../domain/rules';
import { ThemeColorControl } from './ThemeColorControl';

type RoleCategoryFilter = 'TOUS' | 'DIRECTEUR' | 'EMPLOYE' | 'COACH';

export function LocalLoginGate({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated,
    employees,
    loginWithLocalCredentials,
    unlockEmployeePin,
    setActiveSection,
    unlockArchitectSpace,
    lockArchitectSpace,
    themeMode,
  } = useCfos();

  const isDark = themeMode === 'dark';

  const [roleCategory, setRoleCategory] = useState<RoleCategoryFilter>('TOUS');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('emp-mario');
  const [secretInput, setSecretInput] = useState<string>('1010');
  const [totpCode, setTotpCode] = useState<string>('482 910');
  const [targetShell, setTargetShell] = useState<ShellMode>('admin');
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const nonKioskEmployees = employees.filter((e) => e.role !== 'kiosque');

  const filteredProfiles = nonKioskEmployees.filter((emp) => {
    if (roleCategory === 'DIRECTEUR') {
      return emp.role === 'admin' || emp.role === 'manager';
    }
    if (roleCategory === 'EMPLOYE') {
      return emp.role === 'commercial';
    }
    if (roleCategory === 'COACH') {
      return emp.role === 'coach' || emp.role === 'apprenti';
    }
    return true;
  });

  const selectedEmployee =
    employees.find((e) => e.id === selectedEmpId) || nonKioskEmployees[0];

  const getRoleCategoryBadge = (role: string) => {
    if (role === 'admin' || role === 'manager') {
      return {
        label: role === 'admin' ? 'DIRECTION' : 'RESPONSABLE',
        color: 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white',
        permissions:
          'Les rubriques disponibles dépendent des droits accordés dans chaque club.',
      };
    }
    if (role === 'commercial') {
      return {
        label: 'EMPLOYÉ COMMERCIAL',
        color: 'bg-blue-600 text-white',
        permissions:
          'Prospects, rendez-vous et espace personnel, selon les droits attribués dans le club.',
      };
    }
    return {
      label: 'COACH SPORTIF / BPJEPS',
      color: 'bg-emerald-600 text-white',
      permissions:
        'Planning, suivi sportif, formations et espace personnel, selon les droits attribués.',
    };
  };

  const handleOpenArchitectSpace = async (autoUnlock = false) => {
    const adminEmp = employees.find((e) => e.role === 'admin') || nonKioskEmployees[0];
    if (!adminEmp) return;
    const res = await loginWithLocalCredentials({
      employeeId: adminEmp.id,
      secretOrPin: adminEmp.pinCode,
      preferredShell: 'admin',
    });
    if (!res.ok) {
      setErrorFeedback(res.message);
      return;
    }
    if (autoUnlock) {
      unlockArchitectSpace();
    } else {
      lockArchitectSpace();
      setActiveSection('governance');
    }
  };

  const handleSelectProfile = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    setSelectedEmpId(emp.id);
    setSecretInput(emp.pinCode);
    setErrorFeedback(null);
    if (emp.role === 'admin' || emp.role === 'manager') {
      setTargetShell('admin');
    } else if (emp.role === 'commercial') {
      setTargetShell('admin');
    } else if (emp.role === 'coach' || emp.role === 'apprenti') {
      setTargetShell('admin');
    }
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secretInput.trim() === '0766') {
      await handleOpenArchitectSpace(true);
      return;
    }
    if (!selectedEmployee) return;
    const res = await loginWithLocalCredentials({
      employeeId: selectedEmployee.id,
      secretOrPin: secretInput,
      preferredShell: targetShell,
    });
    if (!res.ok) {
      setErrorFeedback(res.message);
    }
  };

  const handleQuickRoleLogin = async (empId: string, shell?: ShellMode) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const res = await loginWithLocalCredentials({
      employeeId: emp.id,
      secretOrPin: emp.pinCode,
      preferredShell: shell,
    });
    if (!res.ok) {
      setSelectedEmpId(emp.id);
      setErrorFeedback(res.message);
    }
  };

  const handleKeypadDigit = (digit: string) => {
    setErrorFeedback(null);
    setSecretInput((prev) => (prev.length >= 12 ? prev : prev + digit));
  };

  const roleMeta = getRoleCategoryBadge(selectedEmployee.role);

  return (
    <div
      className={`min-h-screen cfos-adaptive-shell flex flex-col justify-between p-4 sm:p-6 lg:p-8 transition-colors duration-200 ${
        isDark
          ? 'cfos-dark bg-[#0B0F17] text-slate-100'
          : 'bg-[#EEF0F7] text-slate-900'
      }`}
    >
      {/* Top Sovereign Infrastructure Bar */}
      <header
        className={`max-w-6xl w-full mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b ${
          isDark ? 'border-slate-800/80' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 via-indigo-600 to-sky-500 flex items-center justify-center font-black text-lg tracking-tighter text-white shrink-0 shadow-sm">
            C
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-base">C.Fitness OS</span>
              <span className="text-[11px] text-slate-400">Une vision unifiée</span>
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-400 text-[10px] font-semibold">
                Carré de Soie &amp; Beynost
              </span>
            </div>
            <div className="text-xs text-slate-400">
              {CFITNESS_LEGAL_IDENTITY.raisonSociale} · SIRET {CFITNESS_LEGAL_IDENTITY.siret} · C.Fitness Carré de Soie &amp; Beynost
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono">
          <ThemeColorControl variant="full" />

          <button
            type="button"
            onClick={() => handleOpenArchitectSpace(false)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-sans font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Paramètres · Mon Espace</span>
          </button>
          <span
            className={`px-2.5 py-1.5 rounded-xl border text-emerald-500 ${
              isDark ? 'bg-[#131826] border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            Démonstration
          </span>
        </div>
      </header>

      {/* Main Centered Login Grid */}
      <main className="max-w-6xl w-full mx-auto my-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Role Selector (Directeur, Employé, Coach) */}
        <div
          className={`lg:col-span-7 border rounded-2xl p-5 sm:p-6 space-y-5 ${
            isDark
              ? 'bg-[#131826] border-slate-800/90'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
              Votre espace C.Fitness
            </div>
            <h1 className="text-lg sm:text-xl font-bold mt-1">
              Choisissez votre profil
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Retrouvez les rubriques de votre club selon les droits attribués à votre profil.
            </p>
          </div>

          {/* Role Filter Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'TOUS', label: 'Tous (' + nonKioskEmployees.length + ')' },
                { id: 'DIRECTEUR', label: 'Direction et responsables' },
                { id: 'EMPLOYE', label: 'Équipe commerciale' },
                { id: 'COACH', label: 'Coach & BPJEPS' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoleCategory(tab.id)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  roleCategory === tab.id
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs'
                    : isDark
                    ? 'bg-[#191F31] text-slate-300 hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Profile Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredProfiles.map((emp) => {
              const isSelected = emp.id === selectedEmployee.id;
              const badge = getRoleCategoryBadge(emp.role);
              return (
                <div
                  key={emp.id}
                  role="group"
                  aria-label={emp.firstName + ' ' + emp.lastName}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? isDark
                        ? 'border-violet-500 bg-[#191F31] ring-1 ring-violet-500'
                        : 'border-violet-500 bg-violet-50/60 ring-1 ring-violet-500'
                      : isDark
                      ? 'border-slate-800 bg-[#0F1420] hover:border-slate-700'
                      : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {emp.clubId === 'carre-de-soie' ? 'Carré de Soie' : 'Beynost'}
                      </span>
                    </div>

                    <div className="mt-2 font-bold text-sm flex items-center justify-between">
                      <button type="button" onClick={() => handleSelectProfile(emp.id)}
                        aria-pressed={isSelected} className="text-left min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
                        {emp.firstName} {emp.lastName}
                      </button>
                      <span className="font-mono text-xs text-violet-400">
                        PIN : {emp.pinCode}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{emp.jobTitle}</div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                      {emp.email}
                    </div>
                  </div>

                  <div
                    className={`pt-2 border-t flex items-center justify-between gap-2 ${
                      isDark ? 'border-slate-800/80' : 'border-slate-200'
                    }`}
                  >
                    <span className="text-[11px] text-emerald-500 font-medium">
                      {emp.totpEnabled ? 'Accès direction' : 'Profil de démonstration'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickRoleLogin(emp.id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Essayer ce profil</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Direct Kiosk / Field Shell Quick Launchers */}
          <details
            className={`pt-3 border-t space-y-2 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <summary className="cursor-pointer text-sm font-semibold text-slate-400">
              Autres interfaces de démonstration
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickRoleLogin('emp-maxime', 'tablette')}
                className={`p-3 rounded-xl border hover:border-emerald-500 text-left flex items-center gap-2.5 cursor-pointer ${
                  isDark ? 'bg-[#0F1420] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <Tablet className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold">Tablette d’accueil</div>
                  <div className="text-[11px] text-slate-400">Pointages et séances d’essai</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleLogin('emp-karim', 'employe')}
                className={`p-3 rounded-xl border hover:border-violet-500 text-left flex items-center gap-2.5 cursor-pointer ${
                  isDark ? 'bg-[#0F1420] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <Smartphone className="w-4 h-4 text-violet-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold">App Mobile &amp; Tablette</div>
                  <div className="text-[11px] text-slate-400">Planning, absences et formations</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleLogin('emp-maxime', 'telephone')}
                className={`p-3 rounded-xl border hover:border-blue-500 text-left flex items-center gap-2.5 cursor-pointer ${
                  isDark ? 'bg-[#0F1420] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <PhoneCall className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold">Téléphonie</div>
                  <div className="text-[11px] text-slate-400">Interface de démonstration</div>
                </div>
              </button>
            </div>
          </details>
        </div>

        {/* Right Column: Local Credential & PIN Verification Form */}
        <div
          className={`lg:col-span-5 border rounded-2xl p-5 sm:p-6 space-y-5 ${
            isDark
              ? 'bg-[#131826] border-slate-800/90'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div
            className={`flex items-start justify-between gap-2 border-b pb-4 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${roleMeta.color}`}
              >
                {roleMeta.label}
              </span>
              <h2 className="text-base sm:text-lg font-bold mt-1.5">
                {selectedEmployee.firstName} {selectedEmployee.lastName}
              </h2>
              <p className="text-xs text-slate-400">{selectedEmployee.jobTitle}</p>
            </div>
            <div className="text-right font-mono text-xs">
              <div className="text-slate-400">Club :</div>
              <div className="font-bold">
                {selectedEmployee.clubId === 'carre-de-soie' ? 'C.Fitness Carré de Soie' : 'C.Fitness Beynost'}
              </div>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border text-xs space-y-1 ${
              isDark ? 'bg-[#0F1420] border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              Vos accès :
            </div>
            <p className="text-slate-400 leading-relaxed">{roleMeta.permissions}</p>
          </div>

          <form onSubmit={handleSubmitLogin} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-400 mb-1">
                Identifiant
              </label>
              <input
                id="login-identifier"
                type="text"
                readOnly
                value={selectedEmployee.email}
                className={`w-full px-3.5 py-2.5 rounded-xl border font-mono ${
                  isDark
                    ? 'bg-[#0F1420] border-slate-800 text-slate-300'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-secret" className="font-semibold text-slate-400 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-violet-400" />
                  Code d’accès du profil
                </label>
                <span className="font-mono text-[11px] text-violet-400">
                  PIN : {selectedEmployee.pinCode} (ou cfitness2026)
                </span>
              </div>
              <input
                id="login-secret"
                type="password"
                value={secretInput}
                onChange={(e) => {
                  setSecretInput(e.target.value);
                  setErrorFeedback(null);
                }}
                placeholder="Saisir le code d’accès"
                className={`w-full px-3.5 py-2.5 rounded-xl border focus:border-violet-500 font-mono text-sm tracking-widest ${
                  isDark
                    ? 'bg-[#0F1420] border-slate-700 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
            </div>

            {/* Numeric Touch Keypad for Tablet / Mobile convenience */}
            <div className="grid grid-cols-6 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleKeypadDigit(d)}
                  className={`py-2 rounded-lg font-mono font-bold text-xs cursor-pointer ${
                    isDark
                      ? 'bg-[#191F31] hover:bg-slate-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                  }`}
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSecretInput(selectedEmployee.pinCode)}
                className={`py-2 rounded-lg text-emerald-500 font-mono font-bold text-[11px] cursor-pointer ${
                  isDark ? 'bg-[#191F31] hover:bg-slate-700' : 'bg-emerald-50 hover:bg-emerald-100'
                }`}
                title="Pré-remplir le PIN du profil sélectionné"
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setSecretInput('')}
                className={`py-2 rounded-lg text-rose-400 font-mono font-bold text-[11px] cursor-pointer ${
                  isDark ? 'bg-[#191F31] hover:bg-rose-900/60' : 'bg-rose-50 hover:bg-rose-100'
                }`}
              >
                Effacer
              </button>
            </div>

            {selectedEmployee.totpEnabled && (
              <div>
                <label className="block font-semibold text-slate-400 mb-1">
                  Code de vérification
                </label>
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border font-mono text-emerald-500 ${
                    isDark ? 'bg-[#0F1420] border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>
            )}

            <details>
              <summary className="cursor-pointer font-semibold text-slate-400 mb-2">
                Espace à ouvrir
              </summary>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'admin', label: 'Espace de travail', icon: LayoutDashboard },
                    { id: 'employe', label: 'Espace collaborateur', icon: Smartphone },
                    { id: 'telephone', label: 'Téléphonie', icon: PhoneCall },
                    { id: 'tablette', label: 'Tablette d’accueil', icon: Tablet },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTargetShell(item.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 text-[11px] font-semibold cursor-pointer ${
                        targetShell === item.id
                          ? 'border-violet-500 bg-violet-600/20 text-violet-500'
                          : isDark
                          ? 'border-slate-800 bg-[#0F1420] text-slate-400 hover:text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </details>

            {errorFeedback && (
              <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-700 text-rose-200 text-xs flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  {errorFeedback}
                </span>
                {selectedEmployee.pinLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      unlockEmployeePin(selectedEmployee.id);
                      setErrorFeedback(null);
                    }}
                    className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Unlock className="w-3 h-3" />
                    Débloquer PIN
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
            >
              <Lock className="w-4 h-4" />
              Se connecter ({selectedEmployee.firstName} {selectedEmployee.lastName})
            </button>
          </form>
        </div>
      </main>

      {/* Bottom Legal & Architecture Footer */}
      <footer
        className={`max-w-6xl w-full mx-auto pt-4 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-slate-500 ${
          isDark ? 'border-slate-900' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-violet-500" />
          <span>
            {CFITNESS_LEGAL_IDENTITY.siegeSocial} · {CFITNESS_LEGAL_IDENTITY.etablissementSecondaire}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>C.Fitness OS — Espace collaborateurs</span>
        </div>
      </footer>
    </div>
  );
}
