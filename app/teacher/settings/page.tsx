"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import TeacherLayout from "../../components/layout/TeacherLayout";
import PwaBiometricToggle from "../../components/pwa/PwaBiometricToggle";
import PwaNotificationToggle from "../../components/pwa/PwaNotificationToggle";

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export default function TeacherPwaSettingsPage() {
  const [installedPwa, setInstalledPwa] = useState<boolean | null>(null);

  useEffect(() => setInstalledPwa(isStandalonePwa()), []);

  return (
    <TeacherLayout>
      {() => {
        if (installedPwa === null) {
          return <main className="student-pwa-settings-page" aria-busy="true" />;
        }

        if (!installedPwa) {
          return (
            <main className="student-pwa-settings-page student-pwa-settings-browser-message">
              <p>Settings are available in the installed Teacher app.</p>
            </main>
          );
        }

        return (
          <main className="student-pwa-settings-page teacher-pwa-settings-page">
            <section className="student-pwa-settings-card" aria-labelledby="teacher-pwa-settings-title">
              <div className="student-pwa-settings-heading">
                <SettingsIcon size={22} aria-hidden="true" />
                <div>
                  <span>Teacher app</span>
                  <h1 id="teacher-pwa-settings-title">Settings</h1>
                </div>
              </div>
              <div className="student-pwa-settings-list">
                <PwaNotificationToggle />
                <PwaBiometricToggle />
              </div>
            </section>
          </main>
        );
      }}
    </TeacherLayout>
  );
}
