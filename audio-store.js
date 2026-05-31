const dbName = "yingyu-audio-store";
const storeName = "clips";
const dbVersion = 1;

export async function putSessionAudio(record) {
  const db = await openDb();
  await requestToPromise(store(db, "readwrite").put(record));
  db.close();
}

export async function getSessionAudio(sessionId) {
  const db = await openDb();
  const record = await requestToPromise(store(db, "readonly").get(sessionId));
  db.close();
  return record || null;
}

export async function getSessionAudios(sessionIds) {
  const records = [];
  for (const sessionId of sessionIds) {
    const record = await getSessionAudio(sessionId);
    if (record) records.push(record);
  }
  return records;
}

export async function deleteSessionAudios(sessionIds) {
  const db = await openDb();
  const txStore = store(db, "readwrite");
  await Promise.all(sessionIds.map((sessionId) => requestToPromise(txStore.delete(sessionId))));
  db.close();
}

function openDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持本地音频留存。"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "sessionId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(db, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
