import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const login = read("app/login/page.tsx");
const prompt = read("app/components/pwa/PwaLoginInstallPrompt.tsx");
const styles = read("app/globals.css");

test("the public login screen offers the PWA installer before authentication", () => {
  assert.match(login, /PwaLoginInstallPrompt/);
  assert.match(prompt, /beforeinstallprompt/);
  assert.match(prompt, /register\("\/sw\.js"/);
  assert.match(prompt, /display-mode: standalone/);
});

test("login installation guidance covers iOS, Android, Windows, and macOS", () => {
  assert.match(prompt, /Tap Share, then Add to Home Screen/);
  assert.match(prompt, /Install app or Add to Home screen/);
  assert.match(prompt, /install icon in the address bar/);
  assert.match(prompt, /windows/);
  assert.match(prompt, /macos/);
});

test("login installation card is responsive and keyboard accessible", () => {
  assert.match(styles, /\.auth-install-card\s*\{/);
  assert.match(styles, /\.auth-install-card-actions button:focus-visible/);
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.auth-install-card\s*\{[\s\S]*flex-direction: column/);
});
