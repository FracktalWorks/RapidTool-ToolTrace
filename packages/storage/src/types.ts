/**
 * @rapidtool/storage — File Format Types
 *
 * Defines the schema for `.rapidtool` design files saved to the user's local
 * filesystem via the File System Access API.
 *
 * Design goals:
 *   - Small: geometry buffers are NEVER stored — only parameters and S3 refs.
 *     A complex design with 10 supports, holes, and cavity settings is < 50 KB.
 *   - Portable: users can copy, share, or back up the file like any document.
 *   - Versioned: `version` field allows forward-compatible migration on load.
 *   - S3-aware: model geometry is re-fetched from S3 on open using `s3Key`.
 *     If the S3 key is expired (15-day TTL), the user is prompted to re-import.
 */

// ─── File envelope ────────────────────────────────────────────────────────────

export const RAPIDTOOL_FILE_VERSION = 1;
export const RAPIDTOOL_FILE_EXTENSION = '.rapidtool';
export const RAPIDTOOL_MIME_TYPE = 'application/json';

/**
 * Top-level structure written to disk.
 * All fields are plain JSON — no ArrayBuffers, no Three.js objects.
 */
export interface RapidToolFile {
  /** Schema version — bump when making breaking changes to the format. */
  version: typeof RAPIDTOOL_FILE_VERSION;
  /** ISO-8601 timestamp of the last save. */
  savedAt: string;
  /** Human-readable project name (shown in the title bar). */
  projectName: string;
  /**
   * S3 references for every imported part.
   * The geometry itself is NOT here — it is re-fetched on open.
   */
  modelRefs: ModelRef[];
  /** All design parameters — serializable, geometry-free. */
  design: SerializedDesign;
}

// ─── Model references ─────────────────────────────────────────────────────────

/**
 * Pointer to an S3-stored model.  Geometry is never stored in the file;
 * on open, the app fetches from S3 using the presigned-URL endpoint.
 */
export interface ModelRef {
  /** UUID matching the part's id in fixtureStore.parts */
  partId: string;
  /** Original file name displayed in the UI */
  name: string;
  /** Original file size in bytes */
  size: number;
  /** S3 object key — used to generate a fresh presigned download URL on open */
  s3Key: string;
  /** ISO-8601 date the model was uploaded — used to warn on near-expiry (15-day TTL) */
  uploadedAt: string;
}

// ─── Serialized design ────────────────────────────────────────────────────────

/**
 * The complete fixture design state — everything needed to reconstruct the
 * scene once geometry has been re-fetched from S3.
 *
 * Mirrors the subset of Zustand store state that is geometry-free and
 * serializable.  Three.js BufferGeometry, meshes, and worker results are
 * ephemeral and are NOT included.
 */
export interface SerializedDesign {
  /** Visible/hidden state per partId */
  partVisibility: Record<string, boolean>;
  /** Custom colour per partId (hex string, e.g. "#ff6600") */
  partColors: Record<string, string>;
  /** All placed supports */
  supports: SerializedSupport[];
  /** All placed clamps */
  clamps: SerializedClamp[];
  /** All placed labels */
  labels: SerializedLabel[];
  /** All mounting holes */
  holes: SerializedHole[];
  /** Baseplate configuration, or null if not yet set */
  baseplate: SerializedBaseplate | null;
  /** Cavity generation settings */
  cavitySettings: SerializedCavitySettings;
  /** Whether cavity has been applied to the baseplate */
  cavityApplied: boolean;
}

// ─── Per-entity types (mirror the feature types, geometry-free) ───────────────

export interface SerializedSupport {
  id: string;
  type: string;
  /** All fields from the support — stored as-is since they are already plain objects */
  [key: string]: unknown;
}

export interface SerializedClamp {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface SerializedLabel {
  id: string;
  [key: string]: unknown;
}

export interface SerializedHole {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface SerializedBaseplate {
  id: string;
  type: string;
  padding?: number;
  height?: number;
  depth?: number;
  sections?: Array<{
    id: string;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }>;
}

export interface SerializedCavitySettings {
  offsetDistance: number;
  pixelsPerUnit: number;
  rotationXZ: number;
  rotationYZ: number;
  fillHoles: boolean;
  enableDecimation: boolean;
  enableSmoothing: boolean;
  smoothingStrength: number;
  smoothingIterations: number;
  smoothingQuality: boolean;
  csgMinVolume: number;
  csgMinThickness: number;
  csgMinTriangles: number;
  showPreview?: boolean;
  previewOpacity?: number;
}

// ─── Session status ───────────────────────────────────────────────────────────

export type FileSessionStatus =
  | 'idle'           // No file associated yet
  | 'unsaved'        // In-memory changes not yet written to disk
  | 'saving'         // Write in progress
  | 'saved'          // File is up to date
  | 'error';         // Last write failed

export interface FileSessionState {
  status: FileSessionStatus;
  /** Absolute path hint (not reliable cross-platform — display only) */
  fileName: string | null;
  /** ISO-8601 of last successful save */
  lastSavedAt: string | null;
  /** Error message if status === 'error' */
  error: string | null;
}
