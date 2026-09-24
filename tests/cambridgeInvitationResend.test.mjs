import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const accessServer = read("lib/cambridgeStudentAccessServer.ts");
const accessUi = read("app/components/student/StudentAccessControl.tsx");
const setPassword = read("app/set-password/page.tsx");
const forgotPassword = read("app/forgot-password/page.tsx");

test("Accepted invitation links are handled as confirmed access, not resendable invitations", () => {
  assert.match(setPassword, /exchangeCodeForSession\(code\)/);
  assert.match(accessServer, /const authConfirmed = Boolean\(authUser\?\.email_confirmed_at\)/);
  assert.match(accessServer, /invitation_pending: invitationPending/);
  assert.match(accessServer, /already confirmed\. Use password reset instead of sending another invitation/);
  assert.match(accessUi, /access\?\.auth_confirmed/);
  assert.match(accessUi, /Use password reset/);
});

test("Unconfirmed accounts expose an explicit resend path using the existing Auth user", () => {
  assert.match(accessServer, /authUser\?\.invited_at \|\| authUser\?\.confirmation_sent_at/);
  assert.match(accessServer, /const invitationPending = Boolean\(authUser && !authConfirmed\)/);
  assert.match(accessUi, /access\?\.invitation_pending \? "resend-invitation" : "send-invitation"/);
  assert.match(accessServer, /if \(!options\.resend\)/);
  assert.match(accessServer, /auth\.admin\.inviteUserByEmail\(/);
  assert.doesNotMatch(accessServer, /auth\.admin\.createUser\(/s);
});

test("Corrected email must be saved before resend and mapping checks remain server-side", () => {
  assert.match(accessServer, /Save the corrected email before sending an invitation/);
  assert.match(accessUi, /action === "save-email"/);
  assert.match(accessServer, /ensureStudentPortalAccountMapping\(profileId, existing\.id\)/);
  assert.match(accessServer, /This student profile is linked to another portal account/);
  assert.match(accessServer, /This portal account is linked to another student profile/);
});

test("Rate-limited Auth invitation failures remain explicit", () => {
  assert.match(accessServer, /resendError\?\.status === 429 \? 429 : 500/);
  assert.match(accessServer, /Invitation email could not be resent/);
});

test("Confirmed-account password recovery is prefilled without sending automatically", () => {
  assert.match(accessUi, /\/forgot-password\?email=\$\{encodeURIComponent\(savedEmail\)\}/);
  assert.match(forgotPassword, /new URLSearchParams\(window\.location\.search\)\.get\("email"\)/);
  assert.match(forgotPassword, /resetPasswordForEmail\(/);
});
