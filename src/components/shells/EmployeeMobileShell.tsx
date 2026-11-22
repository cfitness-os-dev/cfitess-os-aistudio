import { useEffect, useRef } from "react";
import { AdminShell } from "../AdminShell";
import { useCfos } from "../../context/CfosContext";

// Keep existing employee entry URLs while using the same navigation and views
// as desktop. Responsive layout is controlled by the actual screen size.
export function EmployeeMobileShell() {
  const { setActiveSection } = useCfos();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === "/" && params.get("device") === "rh") {
      setActiveSection("my-day", "personal");
    }
  }, [setActiveSection]);

  return <AdminShell />;
}
