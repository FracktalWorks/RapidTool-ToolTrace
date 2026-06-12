/**
 * useFileSession
 *
 * React hook that wires the File System Access API into the fixture workflow.
 *
 * Responsibilities:
 *   - On mount: attempt silent session restore from last IDB handle
 *   - Expose `newFile()` / `openFile()` / `resumeSession()` for UI buttons
 *   - Accept a `getSnapshot` callback → called on every save tick
 *   - Expose `save(data)` for manual/forced saves (e.g. before export)
 *   - Expose `fileName`, `status`, `lastSavedAt`, `needsPermission` for the UI
 *
 * Usage:
 *   const session = useFileSession({ getSnapshot, onLoad });
 *
 *   // In a "New Design" button:
 *   await session.newFile();
 *
 *   // In an "Open" button:
 *   const loaded = await session.openFile();
 *   if (loaded) onLoad(loaded.data);
 *
 *   // In a title bar:
 *   <span>{session.fileName ?? 'Untitled'}</span>
 *   <span>{session.status}</span>          // 'saved' | 'saving' | 'unsaved' | 'error'
 *   <span>{session.lastSavedAt}</span>
 *
 * Firefox fallback:
 *   session.isSupported === false → show a manual "Download .rapidtool" button.
 *   Use session.downloadSnapshot(data) for that path.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FileAutoSave, fileAutoSave } from './FileAutoSave';
import type { RapidToolFile, FileSessionStatus } from './types';
import {
  RAPIDTOOL_FILE_VERSION,
  RAPIDTOOL_FILE_EXTENSION,
  RAPIDTOOL_MIME_TYPE,
} from './types';

// ─── Hook API ─────────────────────────────────────────────────────────────────

export interface UseFileSessionOptions {
  /**
   * Called to get the current design state whenever a save is triggered.
   * Must return a fully serialized RapidToolFile (no Three.js objects).
   */
  getSnapshot: () => RapidToolFile;
  /**
   * Called after a file is opened or a session is restored — gives the
   * caller the parsed file data to load into the Zustand stores.
   */
  onLoad?: (file: RapidToolFile, fileName: string) => void;
}

export interface UseFileSessionResult {
  /** Whether the File System Access API is available in this browser. */
  isSupported: boolean;
  /** Current save status */
  status: FileSessionStatus;
  /** Current open file name, or null if no file is associated */
  fileName: string | null;
  /** ISO-8601 of last successful save, or null */
  lastSavedAt: string | null;
  /** Error message if status === 'error' */
  error: string | null;
  /**
   * True when a previous session was found but needs a user gesture to
   * re-grant write permission.  Show a "Resume last session" button.
   */
  needsPermission: boolean;
  /** Last file name while waiting for permission (for the resume button label) */
  pendingFileName: string | null;

  /** Create a new design file — shows the system save picker. */
  newFile: () => Promise<void>;
  /** Open an existing `.rapidtool` file — shows the system open picker. */
  openFile: () => Promise<void>;
  /** Re-grant permission and restore last session (must be called from a click handler). */
  resumeSession: () => Promise<void>;
  /** Force an immediate save with current snapshot. */
  save: () => Promise<void>;
  /** Queue a save (debounced via auto-save loop). Call on every significant state change. */
  markDirty: () => void;
  /**
   * Firefox fallback: trigger a browser download of the snapshot as a
   * `.rapidtool` file.  No File System Access required.
   */
  downloadSnapshot: (data: RapidToolFile) => void;
  /**
   * Firefox fallback convenience: builds the snapshot internally via
   * `getSnapshot` and immediately triggers a browser download.
   * Use this in the "Download .rapidtool" button shown when `isSupported === false`.
   */
  download: () => void;
  /** Detach from the current file (new session, clear IDB handle). */
  detach: () => Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export function useFileSession({
  getSnapshot,
  onLoad,
}: UseFileSessionOptions): UseFileSessionResult {
  const isSupported = FileAutoSave.isSupported();

  const [status,          setStatus]          = useState<FileSessionStatus>('idle');
  const [fileName,        setFileName]        = useState<string | null>(null);
  const [lastSavedAt,     setLastSavedAt]     = useState<string | null>(null);
  const [error,           setError]           = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);

  // Keep getSnapshot stable so interval callbacks don't close over stale refs
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  // ── Wire FileAutoSave callbacks on mount ──────────────────────────────────

  useEffect(() => {
    fileAutoSave['options'].onStatusChange = (s, err) => {
      const mapped: FileSessionStatus =
        s === 'saving' ? 'saving'
        : s === 'saved' ? 'saved'
        : s === 'error' ? 'error'
        : 'idle';
      setStatus(mapped);
      setError(err ?? null);
      if (s === 'saved') setLastSavedAt(new Date().toISOString());
    };
    fileAutoSave['options'].onFileNameChange = (name) => {
      setFileName(name);
    };
  }, []);

  // ── Attempt silent restore on mount ───────────────────────────────────────

  useEffect(() => {
    if (!isSupported) return;

    void (async () => {
      const result = await fileAutoSave.tryRestore();

      if (result.type === 'restored') {
        setStatus('saved');
        setLastSavedAt(new Date().toISOString());
        onLoad?.(result.data, result.name);
      } else if (result.type === 'needs-permission') {
        setNeedsPermission(true);
        setPendingFileName(result.name);
        setStatus('idle');
      }
      // 'none' → stay idle
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const newFile = useCallback(async () => {
    const snapshot  = getSnapshotRef.current();
    const name      = await fileAutoSave.newFile(snapshot);
    if (name) {
      setNeedsPermission(false);
      setStatus('saved');
      setLastSavedAt(new Date().toISOString());
    }
  }, []);

  const openFile = useCallback(async () => {
    const result = await fileAutoSave.openFile();
    if (result) {
      setNeedsPermission(false);
      setStatus('saved');
      setLastSavedAt(new Date().toISOString());
      onLoad?.(result.data, result.name);
    }
  }, [onLoad]);

  const resumeSession = useCallback(async () => {
    const result = await fileAutoSave.resumeWithPermission();
    if (result) {
      setNeedsPermission(false);
      setPendingFileName(null);
      setStatus('saved');
      setLastSavedAt(new Date().toISOString());
      onLoad?.(result.data, result.name);
    }
  }, [onLoad]);

  const save = useCallback(async () => {
    const snapshot = getSnapshotRef.current();
    await fileAutoSave.flush(snapshot);
  }, []);

  const markDirty = useCallback(() => {
    setStatus('unsaved');
    const snapshot = getSnapshotRef.current();
    fileAutoSave.queue(snapshot);
  }, []);

  const downloadSnapshot = useCallback((data: RapidToolFile) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: RAPIDTOOL_MIME_TYPE });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${data.projectName || 'design'}${RAPIDTOOL_FILE_EXTENSION}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const download = useCallback(() => {
    downloadSnapshot(getSnapshotRef.current());
  }, [downloadSnapshot]);

  const detach = useCallback(async () => {
    await fileAutoSave.detach();
    setStatus('idle');
    setFileName(null);
    setLastSavedAt(null);
    setError(null);
    setNeedsPermission(false);
    setPendingFileName(null);
  }, []);

  return {
    isSupported,
    status,
    fileName,
    lastSavedAt,
    error,
    needsPermission,
    pendingFileName,
    newFile,
    openFile,
    resumeSession,
    save,
    markDirty,
    downloadSnapshot,
    download,
    detach,
  };
}

// ─── Helper: build a RapidToolFile from store snapshots ──────────────────────

/**
 * Convenience builder — call from the app's `getSnapshot` callback.
 * Takes the raw store snapshots and produces a serializable RapidToolFile.
 */
export function buildRapidToolFile(params: {
  projectName: string;
  fixture: {
    partVisibility: Record<string, boolean>;
    partColors: Record<string, string>;
    supports: unknown[];
    clamps: unknown[];
    labels: unknown[];
    holes: unknown[];
    baseplate: unknown | null;
  };
  modelRefs: RapidToolFile['modelRefs'];
  cavitySettings: RapidToolFile['design']['cavitySettings'];
  cavityApplied: boolean;
}): RapidToolFile {
  return {
    version: RAPIDTOOL_FILE_VERSION,
    savedAt: new Date().toISOString(),
    projectName: params.projectName,
    modelRefs: params.modelRefs,
    design: {
      partVisibility: params.fixture.partVisibility,
      partColors:     params.fixture.partColors,
      supports:       params.fixture.supports as RapidToolFile['design']['supports'],
      clamps:         params.fixture.clamps   as RapidToolFile['design']['clamps'],
      labels:         params.fixture.labels   as RapidToolFile['design']['labels'],
      holes:          params.fixture.holes    as RapidToolFile['design']['holes'],
      baseplate:      params.fixture.baseplate as RapidToolFile['design']['baseplate'],
      cavitySettings: params.cavitySettings,
      cavityApplied:  params.cavityApplied,
    },
  };
}
