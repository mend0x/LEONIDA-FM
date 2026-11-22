/** Device-only browser library: no audio is uploaded to a server. */
import catalog from '../data/catalog.json';

const DB_NAME = 'leonida-personal-library-v1';
const STORE = 'tracks';
const ALLOWED = /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i;
const slugs = new Set(catalog.stations.map((station) => station.slug));

type StoredSong = { id: string; station: string; name: string; data: Blob };
export type PersonalSong = { name: string; blob: Blob };

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('station', 'station');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB unavailable'));
  });
}

export async function savePersonalSongs(files: File[]): Promise<{ saved: number; skipped: number }> {
  const db = await database();
  let saved = 0;
  let skipped = 0;
  try {
    for (const file of files) {
      if (!ALLOWED.test(file.name)) {
        skipped++;
        continue;
      }
      const parts = (file.webkitRelativePath || file.name).replace(/\\/g, '/').split('/');
      const station = parts.slice(0, -1).find((part) => slugs.has(part.toLowerCase()))?.toLowerCase();
      if (!station) {
        skipped++;
        continue;
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE, 'readwrite');
          transaction.objectStore(STORE).put({
            id: station + '/' + file.name,
            station,
            name: file.name,
            data: file,
          } satisfies StoredSong);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        saved++;
      } catch {
        skipped++;
      }
    }
  } finally {
    db.close();
  }
  return { saved, skipped };
}

/** Store files for one selected station, including on iOS without folder selection. */
export async function saveStationSongs(station: string, files: File[]): Promise<{ saved: number; skipped: number }> {
  if (!slugs.has(station)) throw new Error('Unknown station');
  const db = await database();
  let saved = 0;
  let skipped = 0;
  try {
    for (const file of files) {
      if (!ALLOWED.test(file.name)) { skipped++; continue; }
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE, 'readwrite');
          transaction.objectStore(STORE).put({
            id: station + '/' + file.name,
            station,
            name: file.name,
            data: file,
          } satisfies StoredSong);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        saved++;
      } catch { skipped++; }
    }
  } finally { db.close(); }
  return { saved, skipped };
}

export async function readPersonalSongs(station: string): Promise<PersonalSong[]> {
  const db = await database();
  try {
    return await new Promise<PersonalSong[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).index('station').getAll(station);
      request.onsuccess = () => resolve(
        (request.result as StoredSong[])
          .map((entry) => ({ name: entry.name, blob: entry.data }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
