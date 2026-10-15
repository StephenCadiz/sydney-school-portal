"use client";

/**
 * Account-scoped stale-while-revalidate cache for installed PWAs.
 *
 * Only same-origin JSON API GET responses are eligible. Binary resources,
 * downloads, attachments, and media are deliberately excluded. The cache is
 * keyed by the authenticated Supabase user id so data cannot be reused by a
 * different account on the same device.
 */

const DATABASE_NAME = "sydney-school-pwa-data";
const DATABASE_VERSION = 1;
const STORE_NAME = "responses";
const MAX_ENTRY_BYTES = 2_500_000;
const MAX_STALE_MS = 15 * 60 * 1000;
const SUPABASE_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();

type PwaCacheRecord = {
  key: string;
  accountId: string;
  url: string;
  status: number;
  statusText: string;
  contentType: string;
  body: string;
  updatedAt: number;
};

let databasePromise: Promise<IDBDatabase | null> | null = null;
let installedAccountId = "";
let restoreFetch: (() => void) | null = null;
const refreshes = new Map<string, Promise<Response>>();

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });

  return databasePromise;
}

function cacheKey(accountId: string, url: string, request: Request) {
  const responseVariant = [
    request.headers.get("accept") || "",
    request.headers.get("prefer") || "",
  ].join("|");
  return `${accountId}:${url}:${responseVariant}`;
}

function readRecord(db: IDBDatabase, key: string): Promise<PwaCacheRecord | null> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as PwaCacheRecord | undefined) || null);
    request.onerror = () => resolve(null);
  });
}

function writeRecord(db: IDBDatabase, record: PwaCacheRecord): Promise<void> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

function responseFromRecord(record: PwaCacheRecord) {
  return new Response(record.body, {
    status: record.status,
    statusText: record.statusText,
    headers: {
      "content-type": record.contentType || "application/json",
      "x-sydney-school-cache": "hit",
    },
  });
}

function isExcludedPath(pathname: string) {
  const lower = pathname.toLowerCase();
  return (
    lower.includes("/download") ||
    lower.includes("/attachment") ||
    lower.includes("/media") ||
    lower.includes("/file") ||
    lower.includes("/storage") ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".mp3") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".aac") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".webm")
  );
}

function isCacheableRequest(request: Request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url, window.location.href);
  const isPortalApi = url.origin === window.location.origin && url.pathname.startsWith("/api/");
  const isSupabaseRest = Boolean(SUPABASE_ORIGIN) && url.origin === SUPABASE_ORIGIN && url.pathname.startsWith("/rest/v1/");
  if (!isPortalApi && !isSupabaseRest) return false;
  if (isExcludedPath(url.pathname)) return false;
  if (request.headers.get("x-sydney-school-cache") === "no-store") return false;
  return true;
}

async function saveResponse(accountId: string, key: string, url: string, response: Response) {
  if (!response.ok) return;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("json")) return;

  const body = await response.clone().text();
  if (new TextEncoder().encode(body).byteLength > MAX_ENTRY_BYTES) return;

  const db = await openDatabase();
  if (!db) return;
  await writeRecord(db, {
    key,
    accountId,
    url,
    status: response.status,
    statusText: response.statusText,
    contentType,
    body,
    updatedAt: Date.now(),
  });
}

async function refreshResponse(
  accountId: string,
  key: string,
  url: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  originalFetch: typeof window.fetch,
) {
  const existing = refreshes.get(key);
  if (existing) return existing;

  const refresh = originalFetch(input, init).then(async (response) => {
    await saveResponse(accountId, key, url, response);
    return response;
  }).finally(() => {
    refreshes.delete(key);
  });

  refreshes.set(key, refresh);
  return refresh;
}

async function clearAccount(accountId: string) {
  if (!accountId) return;
  const db = await openDatabase();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as PwaCacheRecord;
      if (record.accountId === accountId) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function clearPwaDataCache(accountId?: string) {
  if (accountId) {
    await clearAccount(accountId);
    return;
  }
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export function installPwaDataCache(accountId: string) {
  if (typeof window === "undefined" || !accountId) return () => undefined;
  if (installedAccountId === accountId && restoreFetch) return restoreFetch;

  restoreFetch?.();
  installedAccountId = accountId;
  const originalFetch = window.fetch.bind(window);
  const restore = () => {
    if (window.fetch !== wrappedFetch) return;
    window.fetch = originalFetch;
    if (restoreFetch === restore) restoreFetch = null;
    if (installedAccountId === accountId) installedAccountId = "";
  };

  const wrappedFetch: typeof window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!isCacheableRequest(request)) return originalFetch(input, init);

    const url = request.url;
    const key = cacheKey(accountId, url, request);
    const db = await openDatabase();
    const cached = db ? await readRecord(db, key) : null;

    if (cached && Date.now() - cached.updatedAt <= MAX_STALE_MS) {
      void refreshResponse(accountId, key, url, input, init, originalFetch).catch(() => undefined);
      return responseFromRecord(cached);
    }

    try {
      return await refreshResponse(accountId, key, url, input, init, originalFetch);
    } catch (error) {
      if (cached) return responseFromRecord(cached);
      throw error;
    }
  };

  window.fetch = wrappedFetch;
  restoreFetch = restore;
  return restore;
}

export function stopPwaDataCache() {
  restoreFetch?.();
  restoreFetch = null;
  installedAccountId = "";
}
