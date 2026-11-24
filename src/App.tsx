import { Suspense, lazy, useEffect } from 'react';
import { LeadDraftNavigationDialog } from './components/LeadDraftNavigationDialog';
import { CfosProvider, useCfos } from './context/CfosContext';
import { AdminShell } from './components/AdminShell';
import { LocalLoginGate } from './components/LocalLoginGate';
import { MywellnessSportSheetModal } from './components/MywellnessSportSheetModal';

const EmployeeMobileShell = lazy(() =>
  import('./components/shells/EmployeeMobileShell').then((m) => ({
    default: m.EmployeeMobileShell,
  }))
);
const KioskTabletShell = lazy(() =>
  import('./components/shells/KioskTabletShell').then((m) => ({
    default: m.KioskTabletShell,
  }))
);
const SoftphoneShell = lazy(() =>
  import('./components/shells/SoftphoneShell').then((m) => ({
    default: m.SoftphoneShell,
  }))
);
const PublicLeadPortalView = lazy(() =>
  import('./components/PublicLeadPortalView').then((m) => ({
    default: m.PublicLeadPortalView,
  }))
);

const ShellFallback = (
  <div className="min-h-screen flex items-center justify-center text-xs opacity-70">
    Chargement de C.Fitness OS…
  </div>
);

function CfosRouter() {
  const { shellMode, themeMode, accentColor } = useCfos();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isPublicPortal = pathname.startsWith('/forms/') || pathname.startsWith('/book/');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', themeMode === 'dark');
      document.documentElement.setAttribute('data-theme', themeMode);
      document.documentElement.setAttribute('data-accent', accentColor);
    }
  }, [themeMode, accentColor]);

  if (isPublicPortal) {
    return (
      <Suspense fallback={ShellFallback}>
        <PublicLeadPortalView pathname={pathname} />
      </Suspense>
    );
  }

  const renderShell = () => {
    if (shellMode === 'employe') {
      return (
        <Suspense fallback={ShellFallback}>
          <EmployeeMobileShell />
        </Suspense>
      );
    }
    if (shellMode === 'tablette') {
      return (
        <Suspense fallback={ShellFallback}>
          <KioskTabletShell />
        </Suspense>
      );
    }
    if (shellMode === 'telephone') {
      return (
        <Suspense fallback={ShellFallback}>
          <SoftphoneShell />
        </Suspense>
      );
    }
    return <AdminShell />;
  };

  return (
    <div
      data-theme={themeMode}
      data-accent={accentColor}
      className={themeMode === 'dark' ? 'cfos-dark dark min-h-screen' : 'cfos-light min-h-screen'}
    >
      <LocalLoginGate>{renderShell()}</LocalLoginGate>
      <MywellnessSportSheetModal />
    </div>
  );
}

export default function App() {
  return (
    <CfosProvider>
      <CfosRouter />
      <LeadDraftNavigationDialog />
    </CfosProvider>
  );
}
