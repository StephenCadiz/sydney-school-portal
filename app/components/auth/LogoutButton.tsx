"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { supabase } from "../../../lib/supabase";

type LogoutButtonProps = {
  className?: string;
  onSuccess?: () => void;
};

export default function LogoutButton({
  className = "",
  onSuccess,
}: LogoutButtonProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    if (loggingOut) return;

    setErrorMessage("");
    setLoggingOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Unable to sign out:", error);
        setErrorMessage("Unable to log out. Please try again.");
        return;
      }

      onSuccess?.();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Unable to sign out:", error);
      setErrorMessage("Unable to log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className={`portal-logout ${className}`.trim()}>
      <button
        type="button"
        className="portal-logout-button"
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label={loggingOut ? "Logging out" : "Log Out"}
      >
        <LogOut size={19} aria-hidden="true" />
        <span>{loggingOut ? "Logging out…" : "Log Out"}</span>
      </button>
      {errorMessage && (
        <p className="portal-logout-error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
