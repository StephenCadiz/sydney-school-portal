import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const supabase = read("lib/supabase.ts");
const login = read("app/login/page.tsx");
const enrollment = read("app/components/pwa/PasskeyEnrollment.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const adminShell = read("app/components/pwa/AdminPwaShell.tsx");
const errors = read("lib/passkeyErrors.ts");

test("Supabase client opts into passkey authentication", () => {
  assert.match(supabase, /experimental:\s*\{ passkey: true \}/);
});

test("login provides password fallback and passkey sign-in after session loss", () => {
  assert.match(login, /signInWithPasskey/);
  assert.match(login, /Sign in with Face ID \/ fingerprint/);
  assert.match(login, /signInWithPassword/);
  assert.match(login, /passkeyErrorMessage/);
});

test("Teacher and Admin PWA surfaces can register a passkey while signed in", () => {
  assert.match(enrollment, /registerPasskey/);
  assert.match(enrollment, /Use Face ID or fingerprint after logout or session expiry/);
  assert.match(teacherLayout, /PasskeyEnrollment/);
  assert.match(adminShell, /PasskeyEnrollment/);
});

test("passkey controls require platform WebAuthn support", () => {
  assert.match(login, /PublicKeyCredential/);
  assert.match(enrollment, /PublicKeyCredential/);
  assert.match(enrollment, /credentials" in navigator/);
});

test("passkey errors use Supabase error codes and explain disabled setup", () => {
  assert.match(errors, /error_code/);
  assert.match(errors, /passkey_disabled/);
  assert.match(errors, /enable Passkeys in Supabase Auth/);
  assert.match(enrollment, /isPasskeyDisabled/);
  assert.match(login, /passkeyErrorMessage/);
});
