"use client";

import { Settings as SettingsIcon } from "lucide-react";

import PwaBiometricToggle from "./PwaBiometricToggle";
import PwaNotificationToggle from "./PwaNotificationToggle";

export default function AdminPwaSettings() {
  return (
    <main className="student-pwa-settings-page admin-pwa-settings-page">
      <section className="student-pwa-settings-card" aria-labelledby="admin-pwa-settings-title">
        <div className="student-pwa-settings-heading">
          <SettingsIcon size={22} aria-hidden="true" />
          <div>
            <span>Admin app</span>
            <h1 id="admin-pwa-settings-title">Settings</h1>
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
