"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import PwaBiometricToggle from "../../components/pwa/PwaBiometricToggle";
import PwaNotificationToggle from "../../components/pwa/PwaNotificationToggle";

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export default function StudentPwaSettingsPage() {
  const [installedPwa, setInstalledPwa] = useState<boolean | null>(null);

  useEffect(() => setInstalledPwa(isStandalonePwa()), []);

  if (installedPwa === null) {
    return <main className="student-pwa-settings-page" aria-busy="true" />;
  }

  if (!installedPwa) {
    return (
      <main className="student-pwa-settings-page student-pwa-settings-browser-message">
        <p>Settings are available in the installed Student app.</p>
      </main>
    );
  }

  return (
    <main className="student-pwa-settings-page">
      <section className="student-pwa-settings-card" aria-labelledby="student-pwa-settings-title">
        <div className="student-pwa-settings-heading">
          <SettingsIcon size={22} aria-hidden="true" />
          <div>
            <span>Student app</span>
            <h1 id="student-pwa-settings-title">Settings</h1>
          </div>
        </div>
        <div className="student-pwa-settings-list">
          <PwaNotificationToggle />
          <PwaBiometricToggle />
        </div>
      </section>
    </main>
  );
}
