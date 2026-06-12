/**
 * FileAutoSave
 *
 * Manages writing a `.rapidtool` design file to the user's local filesystem
 * using the File System Access API (Chrome 86+, Edge 86+, Safari 15.2+).
 *
 * Responsibilities:
 *   1. Show the system save-file picker (once per session).
 *   2. Write the serialized design to disk silently on every auto-save tick.
 *   3. Persist the FileSystemFileHandle across page reloads via IndexedDB
 *      so the user only has to pick the file once.
 *   4. On next visit, re-request write permission with a single click (no
 *      picker re-shown) and restore the last file.
 *
 * What this does NOT do:
 *   - Store design state in IndexedDB — only the file handle lives there.
 *   - Communicate with the backend — all storage is local.
 *   - Block the UI — every disk write is fire-and-forget from the call site.
 *
 * Firefox fallback: FSA not supported → callers fall back to manual download.
 *   Check `FileAutoSave.isSupported()` before instantiating.
 */

import type { RapidToolFile } from './types';
import { RAPIDTOOL_FILE_EXTENSION, RAPIDTOOL_MIME_TYPE } from './types';

// ─── IDB handle store ─────────────────────────────────────────────────────────

const IDB_NAME    = 'rapidtool-session';
const IDB_VERSION = 1;
const IDB_STORE   = 'file-handles';
const HANDLE_KEY  = 'last-file-handle';

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function persistHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function loadPersistedHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function clearPersistedHandle(): Promise<void> {
  try {
    const db = await openHandleDB();
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).delete(HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch {
    // Best-effort
  }
}

// ─── FileAutoSave ─────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface FileAutoSaveOptions {
  /** Auto-save interval in milliseconds. Default: 30 000 (30s). */
  intervalMs?: number;
  onStatusChange?: (status: SaveStatus, error?: string) => void;
  onFileNameChange?: (name: string | null) => void;
}

export class FileAutoSave {
  private handle: FileSystemFileHandle | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pendingData: RapidToolFile | null = null;
  private status: SaveStatus = 'idle';
  private options: Required<Omit<FileAutoSaveOptions, 'onStatusChange' | 'onFileNameChange'>> &
    Pick<FileAutoSaveOptions, 'onStatusChange' | 'onFileNameChange'>;

  constructor(opts: FileAutoSaveOptions = {}) {
    this.options = {
      intervalMs: opts.intervalMs ?? 30_000,
      onStatusChange: opts.onStatusChange,
      onFileNameChange: opts.onFileNameChange,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** True when the File System Access API is available in this browser. */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  }

  /**
   * Show the system file picker and create a new `.rapidtool` file.
   * Returns the chosen file name, or null if the user cancelled.
   */
  async newFile(initialData: RapidToolFile): Promise<string | null> {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `${initialData.projectName || 'Untitled'}${RAPIDTOOL_FILE_EXTENSION}`,
        types: [{
          description: 'RapidTool Design File',
          accept: { [RAPIDTOOL_MIME_TYPE]: [RAPIDTOOL_FILE_EXTENSION] },
        }],
      }) as FileSystemFileHandle;

      this.handle = handle;
      await persistHandle(handle);
      await this._writeToDisk(initialData);
      this._startLoop(initialData);
      this._emitFileName(handle.name);
      return handle.name;
    } catch (err: any) {
      // AbortError = user cancelled — not an error
      if (err?.name === 'AbortError') return null;
      this._setStatus('error', String(err));
      return null;
    }
  }

  /**
   * Show the system file picker to open an existing `.rapidtool` file.
   * Returns the parsed file, or null if the user cancelled or parse failed.
   */
  async openFile(): Promise<{ data: RapidToolFile; name: string } | null> {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'RapidTool Design File',
          accept: { [RAPIDTOOL_MIME_TYPE]: [RAPIDTOOL_FILE_EXTENSION] },
        }],
        multiple: false,
      }) as FileSystemFileHandle[];

      const file = await handle.getFile();
      const text = await file.text();
      const data  = JSON.parse(text) as RapidToolFile;

      this.handle = handle;
      await persistHandle(handle);
      this._startLoop(null); // loop started; first write happens on next queue()
      this._emitFileName(handle.name);
      return { data, name: handle.name };
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      this._setStatus('error', String(err));
      return null;
    }
  }

  /**
   * Try to restore the last file handle from IDB.
   * If permission is already granted → returns the file data silently.
   * If permission needs a user gesture → returns the handle so the caller can
   *   show a "Resume last session" button that calls `resumeWithHandle()`.
   */
  async tryRestore(): Promise<
    | { type: 'restored'; data: RapidToolFile; name: string }
    | { type: 'needs-permission'; name: string }
    | { type: 'none' }
  > {
    const handle = await loadPersistedHandle();
    if (!handle) return { type: 'none' };

    try {
      const perm = await (handle as any).queryPermission({ mode: 'readwrite' });

      if (perm === 'granted') {
        const file = await handle.getFile();
        const data  = JSON.parse(await file.text()) as RapidToolFile;
        this.handle = handle;
        this._startLoop(null);
        this._emitFileName(handle.name);
        return { type: 'restored', data, name: handle.name };
      }

      if (perm === 'prompt') {
        return { type: 'needs-permission', name: handle.name };
      }

      // 'denied' — clear stale handle
      await clearPersistedHandle();
      return { type: 'none' };
    } catch {
      await clearPersistedHandle();
      return { type: 'none' };
    }
  }

  /**
   * Called after the user clicks "Resume last session" — requests permission
   * and reads the file.  Must be called from a user-gesture handler.
   */
  async resumeWithPermission(): Promise<{ data: RapidToolFile; name: string } | null> {
    const handle = await loadPersistedHandle();
    if (!handle) return null;

    try {
      const perm = await (handle as any).requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;

      const file = await handle.getFile();
      const data  = JSON.parse(await file.text()) as RapidToolFile;
      this.handle = handle;
      this._startLoop(null);
      this._emitFileName(handle.name);
      return { data, name: handle.name };
    } catch {
      return null;
    }
  }

  /**
   * Queue new data for the next auto-save tick.
   * Also triggers an immediate write so no changes are lost on quick close.
   */
  queue(data: RapidToolFile): void {
    this.pendingData = data;
    // Immediate write — don't wait for the timer
    void this._flushIfPending();
  }

  /**
   * Force an immediate save. Useful before navigating away.
   */
  async flush(data: RapidToolFile): Promise<void> {
    this.pendingData = data;
    await this._flushIfPending();
  }

  /** Detach from the current file and clear the persisted handle. */
  async detach(): Promise<void> {
    this._stopLoop();
    this.handle      = null;
    this.pendingData = null;
    this._setStatus('idle');
    this._emitFileName(null);
    await clearPersistedHandle();
  }

  get currentFileName(): string | null {
    return this.handle?.name ?? null;
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _startLoop(_initialData: RapidToolFile | null): void {
    this._stopLoop();
    this.intervalId = setInterval(() => {
      void this._flushIfPending();
    }, this.options.intervalMs);
  }

  private _stopLoop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async _flushIfPending(): Promise<void> {
    if (!this.pendingData || !this.handle) return;
    const data = this.pendingData;
    this.pendingData = null;
    await this._writeToDisk(data);
  }

  private async _writeToDisk(data: RapidToolFile): Promise<void> {
    if (!this.handle) return;
    this._setStatus('saving');
    try {
      const writable = await (this.handle as any).createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      this._setStatus('saved');
    } catch (err: any) {
      this._setStatus('error', String(err));
    }
  }

  private _setStatus(s: SaveStatus, error?: string): void {
    this.status = s;
    this.options.onStatusChange?.(s, error);
  }

  private _emitFileName(name: string | null): void {
    this.options.onFileNameChange?.(name);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const fileAutoSave = new FileAutoSave();
