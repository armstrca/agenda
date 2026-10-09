/**
 * Dev-only durability for the sql.js adapter: the exported SQLite image is kept in IndexedDB so a
 * browser reload keeps the data. The desktop app never uses this.
 *
 * Everything resolves rather than throws. A missing IndexedDB (SSR, old WebViews), a blocked or
 * failed open (private windows, storage disabled) or a failed transaction turns into `null` on
 * load and a silent no-op on save, because losing dev persistence must never break the app.
 */

const DB_NAME = 'agenda';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Structured clone keeps a Uint8Array as is, but tolerate a bare ArrayBuffer written by hand. */
function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

export async function loadFromIndexedDb(key: string): Promise<Uint8Array | null> {
  const db = await openDatabase();
  if (!db) return null;
  try {
    return await new Promise<Uint8Array | null>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(toBytes(request.result));
        request.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } finally {
    db.close();
  }
}

export async function saveToIndexedDb(key: string, bytes: Uint8Array): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  try {
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(bytes, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
}
