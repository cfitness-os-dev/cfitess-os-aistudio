import { useEffect } from 'react';
import { CfosProvider, useCfos } from './context/CfosContext';
import { AdminShell } from './components/AdminShell';
import { EmployeeMobileShell } from './components/shells/EmployeeMobileShell';
import { KioskTabletShell } from './components/shells/KioskTabletShell';
import { SoftphoneShell } from './components/shells/SoftphoneShell';
import { LocalLoginGate } from './components/LocalLoginGate';
import { MywellnessSportSheetModal } from './components/MywellnessSportSheetModal';
import { PublicLeadPortalView } from './components/PublicLeadPortalView';

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
    return <PublicLeadPortalView pathname={pathname} />;
  }

  const renderShell = () => {
    if (shellMode === 'employe') {
      return <EmployeeMobileShell />;
    }
    if (shellMode === 'tablette') {
      return <KioskTabletShell />;
    }
    if (shellMode === 'telephone') {
      return <SoftphoneShell />;
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
    </CfosProvider>
  );
}
