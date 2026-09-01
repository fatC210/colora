/**
 * 极简 IndexedDB 封装：仅用于持久化最近一次保存/打开的 .colora 文件句柄。
 * FileSystemFileHandle 无法存入 localStorage（结构化克隆需 IDB），故用 IDB。
 * 参考 Excalidraw 在 LocalData 里用 IDB 保存 handle 以实现"启动恢复"。
 */

const DB_NAME = "colora";
const STORE = "file-handles";
const KEY = "latest-colora";
const HISTORY_STORE = "scene-history";
const HISTORY_KEY = "current";

/** 持久化的场景历史快照（含撤销栈，供刷新/HMR 后恢复工作现场）。 */
export type SceneHistorySnapshot = {
  strokes: import("./types").Stroke[];
  groups: import("./types").StrokeGroup[];
  undoStack: import("./types").SceneSnapshot[];
  redoStack: import("./types").SceneSnapshot[];
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // v2：新增 scene-history store（保留 file-handles）。
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE);
      // v1→v2 无需迁移旧数据（新 store 为空即可）。
      void event;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 保存最近一次的文件句柄（name 一起存，便于无权限时展示提示）。 */
export async function saveFileHandle(handle: FileSystemFileHandle, name: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ handle, name }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadFileHandle(): Promise<{
  handle: FileSystemFileHandle;
  name: string;
} | null> {
  try {
    const db = await openDb();
    const result = await new Promise<{ handle: FileSystemFileHandle; name: string } | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () =>
          resolve((req.result as { handle: FileSystemFileHandle; name: string }) ?? null);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearFileHandle(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/** 请求句柄的读权限（若需要则向用户弹窗）。 */
export async function verifyReadPermission(handle: FileSystemFileHandle): Promise<boolean> {
  // queryPermission/requestPermission 属于 File System Access API 权限扩展，
  // 未纳入 TS 默认 DOM lib，这里以 any 调用。
  const h = handle as unknown as {
    queryPermission?: (desc: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  const opts = { mode: "read" as const };
  if ((await h.queryPermission?.(opts)) === "granted") return true;
  return (await h.requestPermission?.(opts)) === "granted";
}

/** 保存当前场景历史快照（含撤销栈），供刷新/HMR 后恢复。 */
export async function saveSceneHistory(
  snapshot: Omit<SceneHistorySnapshot, "savedAt">,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, "readwrite");
      tx.objectStore(HISTORY_STORE).put({ ...snapshot, savedAt: Date.now() }, HISTORY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/** 读取最近一次的场景历史快照（无则 null）。 */
export async function loadSceneHistory(): Promise<SceneHistorySnapshot | null> {
  try {
    const db = await openDb();
    const result = await new Promise<SceneHistorySnapshot | null>((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, "readonly");
      const req = tx.objectStore(HISTORY_STORE).get(HISTORY_KEY);
      req.onsuccess = () => resolve((req.result as SceneHistorySnapshot) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

/** 清空场景历史（用于显式重置）。 */
export async function clearSceneHistory(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(HISTORY_STORE, "readwrite");
      tx.objectStore(HISTORY_STORE).delete(HISTORY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* ignore */
  }
}
