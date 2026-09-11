import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { NextRequest } = require("next/server");
const root = fileURLToPath(new URL("../", import.meta.url));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const targetId = id(20);
const messageId = id(21);
const dutyId = id(22);
const otherTeacherId = id(23);

const routeSource = readFileSync(
  new URL("../app/api/admin/teachers/delete/route.ts", import.meta.url),
  "utf8"
);
const pageSource = readFileSync(
  new URL("../app/admin/teachers/page.tsx", import.meta.url),
  "utf8"
);
const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260910130000_delete_orphan_teacher_account.sql",
    import.meta.url
  ),
  "utf8"
);
const correctedMigrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260911120000_fix_orphan_teacher_duty_cleanup.sql",
    import.meta.url
  ),
  "utf8"
);

function fixture({ dutyTeacherId = targetId } = {}) {
  const rows = {
    profiles: [
      { id: id(1), role: "admin" },
      { id: targetId, role: "teacher" },
    ],
    classes: [],
    messages: [{ id: messageId, sender_id: targetId, receiver_id: null }],
    friday_at_6_duties: [
      { id: dutyId, teacher_id: dutyTeacherId, b1_teacher_id: otherTeacherId },
    ],
  };
  const calls = [];
  const query = table => {
    let result = [...(rows[table] || [])];
    let single = false;
    const q = {
      select() {
        calls.push({ table, operation: "select" });
        return q;
      },
      eq(key, value) {
        result = result.filter(row => row[key] === value);
        return q;
      },
      single() {
        single = true;
        return q;
      },
      maybeSingle() {
        single = true;
        return q;
      },
      then(yes, no) {
        return Promise.resolve({
          data: single ? result[0] || null : result,
          error: null,
        }).then(yes, no);
      },
    };
    return q;
  };
  const supabaseAdmin = {
    auth: {
      async getUser(token) {
        const user = token === "synthetic-admin"
          ? { id: id(1) }
          : token === "synthetic-teacher"
            ? { id: targetId }
            : null;
        return {
          data: { user },
          error: user ? null : new Error("invalid token"),
        };
      },
      admin: {
        async getUserById() {
          return {
            data: { user: null },
            error: { status: 404, code: "user_not_found", message: "User not found" },
          };
        },
        async deleteUser() {
          calls.push({ operation: "deleteUser" });
          throw new Error("Auth deletion must not be attempted for an orphan profile");
        },
      },
    },
    from: query,
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: null, error: null };
    },
  };
  const cache = new Map();
  function load(path) {
    const filename = resolve(root, path);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const imports = spec => {
      if (spec === "server-only") return {};
      if (!spec.startsWith(".")) return require(spec);
      const imported = resolve(dirname(filename), spec);
      if (imported === resolve(root, "lib/supabaseAdmin")) return { supabaseAdmin };
      return load(existsSync(imported) ? imported : `${imported}.ts`);
    };
    new Function("require", "module", "exports", code)(
      imports,
      loadedModule,
      loadedModule.exports
    );
    return loadedModule.exports;
  }
  const request = (role, body) =>
    new NextRequest("http://localhost/api/admin/teachers/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer synthetic-${role}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  return { load, calls, request };
}

test("missing Auth users use the exact transactional orphan-cleanup RPC", async () => {
  const f = fixture();
  const route = f.load("app/api/admin/teachers/delete/route.ts");
  const response = await route.POST(
    f.request("admin", {
      teacher_id: targetId,
      message_id: messageId,
      friday_duty_id: dutyId,
      confirm_dependencies: true,
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.filter(call => call.name), [
    {
      name: "delete_orphan_teacher_with_dependencies",
      args: {
        p_actor_id: id(1),
        p_teacher_id: targetId,
        p_message_id: messageId,
        p_friday_duty_id: dutyId,
      },
    },
  ]);
  assert.equal(f.calls.some(call => call.operation === "deleteUser"), false);
});

test("orphan cleanup preserves the other Friday-duty teacher and is tightly scoped", () => {
  assert.match(routeSource, /getUserById\(teacherId\)/);
  assert.match(routeSource, /delete_orphan_teacher_with_dependencies/);
  assert.match(routeSource, /confirmedFridayDutyId/);
  assert.match(routeSource, /confirm_dependencies/);
  assert.match(migrationSource, /delete from public\.messages[\s\S]*id = v_message_id/i);
  assert.match(
    migrationSource,
    /update public\.friday_at_6_duties[\s\S]*set teacher_id = null/i
  );
  assert.match(
    migrationSource,
    /delete from public\.profiles[\s\S]*id = p_teacher_id/i
  );
  assert.match(migrationSource, /security definer/i);
  assert.match(migrationSource, /set search_path = pg_catalog, public, pg_temp/i);
  assert.match(migrationSource, /revoke all on function/i);
  assert.match(migrationSource, /grant execute on function[\s\S]*to service_role/i);
  assert.match(
    correctedMigrationSource,
    /teacher_id = p_teacher_id or teacher_id is null/i
  );
});

test("orphan cleanup requires explicit dependency confirmation", async () => {
  const f = fixture();
  const route = f.load("app/api/admin/teachers/delete/route.ts");
  const response = await route.POST(f.request("admin", { teacher_id: targetId }));

  assert.equal(response.status, 409);
  assert.equal(f.calls.some(call => call.name), false);
});

test("orphan cleanup accepts an already-cleared General duty and preserves B1", async () => {
  const f = fixture({ dutyTeacherId: null });
  const route = f.load("app/api/admin/teachers/delete/route.ts");
  const response = await route.POST(
    f.request("admin", {
      teacher_id: targetId,
      message_id: messageId,
      friday_duty_id: dutyId,
      confirm_dependencies: true,
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.filter(call => call.name), [
    {
      name: "delete_orphan_teacher_with_dependencies",
      args: {
        p_actor_id: id(1),
        p_teacher_id: targetId,
        p_message_id: messageId,
        p_friday_duty_id: dutyId,
      },
    },
  ]);
});

test("only an Admin can reach the orphan-cleanup path", async () => {
  const f = fixture();
  const route = f.load("app/api/admin/teachers/delete/route.ts");
  const response = await route.POST(f.request("teacher", { teacher_id: id(1) }));
  assert.equal(response.status, 403);
  assert.equal(f.calls.some(call => call.name), false);
});

test("Admin deletion UI reviews and confirms exact orphan dependencies", () => {
  assert.match(pageSource, /review: true/);
  assert.match(pageSource, /Profile ID:/);
  assert.match(pageSource, /Message ID:/);
  assert.match(pageSource, /Confirmed Friday duty ID/);
  assert.match(pageSource, /confirmDependencies/);
  assert.match(pageSource, /preserved/);
});
