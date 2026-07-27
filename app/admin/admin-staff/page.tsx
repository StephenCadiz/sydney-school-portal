"use client";

import { useEffect, useMemo, useState } from "react";

import SetPasswordDialog, {
  PasswordAccountTarget,
} from "../../components/admin/SetPasswordDialog";
import AdminLayout from "../../components/layout/AdminLayout";
import { supabase } from "../../../lib/supabase";

type AdminStaffAccount = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
};

function clean(value: string | null | undefined) {
  return String(value || "").trim();
}

function getName(account: AdminStaffAccount) {
  return (
    [clean(account.first_name), clean(account.last_name)]
      .filter(Boolean)
      .join(" ") ||
    clean(account.email) ||
    "Admin account"
  );
}

function getInitials(account: AdminStaffAccount) {
  const initials = [clean(account.first_name), clean(account.last_name)]
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials.slice(0, 2) || "A";
}

function compareAccounts(first: AdminStaffAccount, second: AdminStaffAccount) {
  return (
    clean(first.last_name).localeCompare(clean(second.last_name), undefined, {
      sensitivity: "base",
    }) ||
    clean(first.first_name).localeCompare(clean(second.first_name), undefined, {
      sensitivity: "base",
    }) ||
    clean(first.email).localeCompare(clean(second.email), undefined, {
      sensitivity: "base",
    }) ||
    first.id.localeCompare(second.id)
  );
}

export default function AdminStaffPage() {
  const [accounts, setAccounts] = useState<AdminStaffAccount[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [passwordTarget, setPasswordTarget] =
    useState<PasswordAccountTarget | null>(null);

  async function loadAccounts() {
    setLoading(true);
    setLoadError("");

    try {
      const [profileResult, sessionResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, first_name, last_name, role")
          .eq("role", "admin"),
        supabase.auth.getSession(),
      ]);

      if (profileResult.error) throw profileResult.error;

      setAccounts(
        ((profileResult.data || []) as AdminStaffAccount[]).sort(compareAccounts)
      );
      setCurrentAdminId(sessionResult.data.session?.user.id || "");
    } catch {
      setLoadError("Unable to load Admin staff accounts. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  const visibleAccounts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return accounts;

    return accounts.filter((account) =>
      [getName(account), account.email]
        .map((value) => clean(value).toLowerCase())
        .some((value) => value.includes(normalizedSearch))
    );
  }, [accounts, search]);

  return (
    <AdminLayout>
      <main className="admin-staff-page">
        <header className="admin-staff-header">
          <div>
            <h1>Admin Staff</h1>
            <p>Manage password access for Sydney School Admin accounts.</p>
          </div>
          <span>
            {accounts.length} Admin {accounts.length === 1 ? "account" : "accounts"}
          </span>
        </header>

        {feedback && (
          <div className="admin-staff-feedback" role="status" aria-live="polite">
            {feedback}
          </div>
        )}

        <section className="admin-staff-search">
          <label htmlFor="admin-staff-search">Search Admin staff</label>
          <input
            id="admin-staff-search"
            type="search"
            value={search}
            placeholder="Search by name or email…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </section>

        <section className="admin-staff-sheet" aria-labelledby="admin-staff-list">
          <div className="admin-staff-sheet-heading">
            <h2 id="admin-staff-list">Admin Accounts</h2>
            {!loading && !loadError && <span>{visibleAccounts.length} shown</span>}
          </div>

          {loading ? (
            <p className="admin-staff-state" role="status">
              Loading Admin accounts…
            </p>
          ) : loadError ? (
            <div className="admin-staff-state" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={() => void loadAccounts()}>
                Retry
              </button>
            </div>
          ) : visibleAccounts.length === 0 ? (
            <p className="admin-staff-state">
              {accounts.length === 0
                ? "No Admin accounts found."
                : "No Admin accounts match your search."}
            </p>
          ) : (
            <div className="admin-staff-list">
              {visibleAccounts.map((account) => {
                const isCurrentAdmin = account.id === currentAdminId;

                return (
                  <article className="admin-staff-row" key={account.id}>
                    <span className="admin-staff-avatar" aria-hidden="true">
                      {getInitials(account)}
                    </span>
                    <div className="admin-staff-identity">
                      <strong>{getName(account)}</strong>
                      <span>{clean(account.email) || "No login email recorded"}</span>
                      {isCurrentAdmin && <small>Current Admin account</small>}
                    </div>
                    <button
                      type="button"
                      disabled={!clean(account.email)}
                      title={
                        clean(account.email)
                          ? undefined
                          : "Account requires reconciliation."
                      }
                      onClick={() => {
                        setFeedback("");
                        setPasswordTarget({
                          id: account.id,
                          name: getName(account),
                          email: clean(account.email),
                          accountType: "Admin",
                          isCurrentAdmin,
                        });
                      }}
                    >
                      {clean(account.email)
                        ? "Set New Password"
                        : "Account requires reconciliation"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {passwordTarget && (
        <SetPasswordDialog
          target={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSuccess={(message) => {
            setPasswordTarget(null);
            setFeedback(message);
          }}
        />
      )}
    </AdminLayout>
  );
}
