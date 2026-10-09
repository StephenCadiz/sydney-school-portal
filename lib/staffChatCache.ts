"use client";

export type CachedConversation = Record<string, unknown> & { id: string };
export type CachedMessage = Record<string, unknown> & { id: string; created_at: string };

const DATABASE_NAME = "sydney-school-staff-chat";
const DATABASE_VERSION = 1;
const STORE_NAME = "account_cache";

type CacheRecord = {
  key: string;
  accountId: string;
  kind: "conversations" | "messages";
  conversationId?: string;
  value: unknown;
  updatedAt: number;
};

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function readRecord<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as CacheRecord | undefined)?.value as T || null);
    request.onerror = () => resolve(null);
  });
}

function writeRecord(db: IDBDatabase, record: CacheRecord): Promise<void> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export async function getCachedConversations(accountId: string): Promise<CachedConversation[]> {
  const db = await openDatabase();
  if (!db) return [];
  return (await readRecord<CachedConversation[]>(db, `${accountId}:conversations`)) || [];
}

export async function saveCachedConversations(accountId: string, conversations: CachedConversation[]) {
  const db = await openDatabase();
  if (!db) return;
  await writeRecord(db, { key: `${accountId}:conversations`, accountId, kind: "conversations", value: conversations, updatedAt: Date.now() });
}

export async function getCachedMessages(accountId: string, conversationId: string): Promise<CachedMessage[]> {
  const db = await openDatabase();
  if (!db) return [];
  return (await readRecord<CachedMessage[]>(db, `${accountId}:messages:${conversationId}`)) || [];
}

export async function saveCachedMessages(accountId: string, conversationId: string, messages: CachedMessage[]) {
  const db = await openDatabase();
  if (!db) return;
  await writeRecord(db, { key: `${accountId}:messages:${conversationId}`, accountId, kind: "messages", conversationId, value: messages, updatedAt: Date.now() });
}

export async function clearStaffChatCache() {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}
