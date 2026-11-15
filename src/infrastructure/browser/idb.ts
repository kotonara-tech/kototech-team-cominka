// IndexedDB への保存。起動時に全件を読み込み、MemoryStore の変更を書き戻す。

import type { Inquiry, Listing } from "../../domain/listing.ts";
import { MemoryStore, type Change, type StoreData } from "../memory-store.ts";
import { seedData } from "../seed.ts";

const DB_NAME = "kozai-relay";
const DB_VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    db.createObjectStore("listings", { keyPath: "id" });
    db.createObjectStore("inquiries", { keyPath: "id" });
    db.createObjectStore("requests");
  };
  return promisify(req);
}

async function readAll(db: IDBDatabase): Promise<Omit<StoreData, "sites">> {
  const tx = db.transaction(["listings", "inquiries", "requests"], "readonly");
  const [listings, inquiries, keys, values] = await Promise.all([
    promisify(tx.objectStore("listings").getAll() as IDBRequest<Listing[]>),
    promisify(tx.objectStore("inquiries").getAll() as IDBRequest<Inquiry[]>),
    promisify(tx.objectStore("requests").getAllKeys()),
    promisify(tx.objectStore("requests").getAll() as IDBRequest<string[]>),
  ]);
  const requests: Record<string, string> = {};
  keys.forEach((k, i) => (requests[String(k)] = values[i]));
  return { listings, inquiries, requests };
}

function write(db: IDBDatabase, change: Change, onError: (e: unknown) => void) {
  const store = change.kind === "listing" ? "listings" : "inquiries";
  const tx = db.transaction([store, "requests"], "readwrite");
  tx.objectStore(store).put(change.kind === "listing" ? change.listing : change.inquiry);
  tx.objectStore("requests").put(change.kind === "listing" ? change.listing.id : change.inquiry.id, change.requestKey);
  tx.onerror = () => onError(tx.error);
  tx.onabort = () => onError(tx.error);
}

export type BrowserStore = { store: MemoryStore; reset: () => Promise<void> };

export async function openBrowserStore(onError: (e: unknown) => void): Promise<BrowserStore> {
  const db = await open();
  const seed = seedData();
  let saved = await readAll(db);
  if (saved.listings.length === 0 && Object.keys(saved.requests).length === 0) {
    // 初回：サンプルの出品を入れる
    const tx = db.transaction(["listings"], "readwrite");
    for (const l of seed.listings) tx.objectStore("listings").put(l);
    await new Promise((r) => (tx.oncomplete = r));
    saved = { ...saved, listings: seed.listings };
  }
  const store = new MemoryStore({ sites: seed.sites, ...saved }, (change) => write(db, change, onError));
  return { store, reset: () => reset(db) };
}

/** 保存した出品・問い合わせを消す（次の起動でサンプルから作り直す） */
function reset(db: IDBDatabase): Promise<void> {
  db.close();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("古材リレーを開いている他のタブを閉じてから初期化する"));
  });
}
