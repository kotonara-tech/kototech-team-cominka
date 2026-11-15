// IndexedDB への保存。起動時に全件を読み込み、MemoryStore の変更を書き戻す。

import type { Inquiry, Listing, Site } from "../../domain/listing.ts";
import { MemoryStore, type Change, type StoreData } from "../memory-store.ts";
import { seedData } from "../seed.ts";

const DB_NAME = "kozai-relay";
// 2：利用者が追加した解体現場（sites）を保存する
const DB_VERSION = 2;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const db = req.result;
    if (e.oldVersion < 1) {
      db.createObjectStore("listings", { keyPath: "id" });
      db.createObjectStore("inquiries", { keyPath: "id" });
      db.createObjectStore("requests");
    }
    if (e.oldVersion < 2) db.createObjectStore("sites", { keyPath: "id" });
  };
  return promisify(req);
}

async function readAll(db: IDBDatabase): Promise<StoreData> {
  const tx = db.transaction(["sites", "listings", "inquiries", "requests"], "readonly");
  const [sites, listings, inquiries, keys, values] = await Promise.all([
    promisify(tx.objectStore("sites").getAll() as IDBRequest<Site[]>),
    promisify(tx.objectStore("listings").getAll() as IDBRequest<Listing[]>),
    promisify(tx.objectStore("inquiries").getAll() as IDBRequest<Inquiry[]>),
    promisify(tx.objectStore("requests").getAllKeys()),
    promisify(tx.objectStore("requests").getAll() as IDBRequest<string[]>),
  ]);
  const requests: Record<string, string> = {};
  keys.forEach((k, i) => (requests[String(k)] = values[i]));
  return { sites, listings, inquiries, requests };
}

function write(db: IDBDatabase, change: Change, onError: (e: unknown) => void) {
  const [store, record] =
    change.kind === "site" ? ["sites", change.site] as const
    : change.kind === "listing" ? ["listings", change.listing] as const
    : ["inquiries", change.inquiry] as const;
  const tx = db.transaction([store, "requests"], "readwrite");
  tx.objectStore(store).put(record);
  tx.objectStore("requests").put(record.id, change.requestKey);
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
  // サンプルの現場はコードの定数、追加した現場は IndexedDB から読む
  const store = new MemoryStore({ ...saved, sites: [...seed.sites, ...saved.sites] }, (change) => write(db, change, onError));
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
