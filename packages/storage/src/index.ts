/**
 * @rapidtool/storage
 *
 * Client-side persistence for the RapidTool fixture design app.
 *
 * Strategy: File System Access API (Chrome/Edge/Safari 15.2+).
 *   - Design state is saved to a user-chosen `.rapidtool` file on their disk.
 *   - Only the FileSystemFileHandle is kept in IndexedDB — not the state.
 *   - On reload: silent restore if permission is already granted,
 *     one-click resume otherwise.
 *   - Firefox fallback: `downloadSnapshot()` triggers a browser download.
 *
 * What this package does NOT do:
 *   - Store geometry buffers or Three.js objects
 *   - Sync to the backend (models live in S3 — see ADR-06)
 *   - Manage auth or network state
 */

// File format types
export type {
  RapidToolFile,
  ModelRef,
  SerializedDesign,
  SerializedSupport,
  SerializedClamp,
  SerializedLabel,
  SerializedHole,
  SerializedBaseplate,
  SerializedCavitySettings,
  FileSessionStatus,
  FileSessionState,
} from './types';
export {
  RAPIDTOOL_FILE_VERSION,
  RAPIDTOOL_FILE_EXTENSION,
  RAPIDTOOL_MIME_TYPE,
} from './types';

// File System Access wrapper
export { FileAutoSave, fileAutoSave } from './FileAutoSave';
export type { FileAutoSaveOptions, SaveStatus } from './FileAutoSave';

// React hook
export { useFileSession, buildRapidToolFile } from './useFileSession';
export type { UseFileSessionOptions, UseFileSessionResult } from './useFileSession';

// Undo/redo
export { UndoRedoManager } from './UndoRedoManager';
export type { UndoRedoConfig, FixtureSnapshot } from './UndoRedoManager';
