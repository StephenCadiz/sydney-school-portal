type PasskeyErrorLike = {
  code?: unknown;
  error_code?: unknown;
  message?: unknown;
  name?: unknown;
};

function asPasskeyError(error: unknown): PasskeyErrorLike {
  return typeof error === "object" && error !== null
    ? (error as PasskeyErrorLike)
    : {};
}

export function getPasskeyErrorCode(error: unknown) {
  const candidate = asPasskeyError(error);
  const code = candidate.code ?? candidate.error_code;
  return typeof code === "string" ? code.toLowerCase() : "";
}

export function isPasskeyDisabled(error: unknown) {
  const candidate = asPasskeyError(error);
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return getPasskeyErrorCode(error) === "passkey_disabled" || message.includes("passkey_disabled");
}

export function passkeyErrorMessage(error: unknown, action: "registration" | "sign-in") {
  if (isPasskeyDisabled(error)) {
    return "Biometric sign-in is not enabled for this portal yet. An administrator must enable Passkeys in Supabase Auth before Face ID or fingerprint can be registered.";
  }

  const code = getPasskeyErrorCode(error);
  if (code === "error_authenticator_previously_registered" || code === "webauthn_credential_exists") {
    return action === "registration"
      ? "This device already has a biometric sign-in for this account. Sign out and use Face ID or fingerprint from the sign-in page."
      : "This device already has a biometric sign-in for another account. Choose the correct account or use your password.";
  }

  if (code === "error_ceremony_aborted" || code === "notallowederror") {
    return action === "registration"
      ? "Face ID or fingerprint registration was cancelled. Tap Enable biometric sign-in and complete the iPhone prompt."
      : "Face ID or fingerprint sign-in was cancelled. Use your password instead.";
  }

  return action === "registration"
    ? "Face ID or fingerprint registration was not completed. Check that this is the installed app, then try again."
    : "Face ID or fingerprint sign-in was not completed. Use your password instead.";
}
