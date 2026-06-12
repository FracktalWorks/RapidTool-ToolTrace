/**
 * UndoRedoManager
 *
 * In-memory undo/redo stack for fixture design state.
 *
 * Works against the actual Zustand store snapshot shape — the plain
 * serializable subset of FixtureState (no Three.js objects, no geometry).
 *
 * Design:
 *   - Stores up to `maxStates` past snapshots (default 50).
 *   - O(1) undo/redo — snapshots are plain object copies.
 *   - No IndexedDB — history lives only in memory; it is intentionally
 *     discarded on page refresh (the file on disk is the persistence layer).
 *   - Thread-safe for React: all methods are synchronous and side-effect free.
 *
 * Usage:
 *   const manager = new UndoRedoManager({ maxStates: 50 });
 *   manager.push(fixtureStore.getSnapshot());   // after every action
 *   const prev = manager.undo();                // call store.loadSnapshot(prev)
 *   const next = manager.redo();
 */

// ─── Snapshot type ────────────────────────────────────────────────────────────

/**
 * The serializable subset of FixtureState.
 * Must stay in sync with FixtureStore.getSnapshot() return type.
 */
export interface FixtureSnapshot {
  projectName?: string;
  parts: unknown[];
  partVisibility: Record<string, boolean>;
  partColors: Record<string, string>;
  supports: unknown[];
  clamps: unknown[];
  labels: unknown[];
  holes: unknown[];
  baseplate: unknown | null;
  baseplateVisible: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface UndoRedoConfig {
  /** Maximum number of past states to keep. Default: 50. */
  maxStates: number;
}

const DEFAULT_CONFIG: UndoRedoConfig = {
  maxStates: 50,
};

// ─── Manager ──────────────────────────────────────────────────────────────────

export class UndoRedoManager {
  private past:    FixtureSnapshot[] = [];
  private future:  FixtureSnapshot[] = [];
  private current: FixtureSnapshot | null = null;
  private config:  UndoRedoConfig;

  constructor(config: Partial<UndoRedoConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Push the current state onto the undo stack, then record `next` as current.
   * Clears the redo stack (any action after undo discards the redo branch).
   *
   * Call this AFTER every user action that mutates the fixture state.
   */
  push(next: FixtureSnapshot): void {
    if (this.current !== null) {
      this.past.push(this.current);
      // Enforce cap — drop the oldest entry
      if (this.past.length > this.config.maxStates) {
        this.past.shift();
      }
    }
    this.future  = [];  // clear redo branch
    this.current = next;
  }

  /**
   * Move one step back in history.
   * Returns the previous snapshot (load it into the store), or null if
   * there is nothing to undo.
   */
  undo(): FixtureSnapshot | null {
    if (this.past.length === 0) return null;

    const prev = this.past.pop()!;
    if (this.current !== null) {
      this.future.unshift(this.current);
    }
    this.current = prev;
    return prev;
  }

  /**
   * Move one step forward in history.
   * Returns the next snapshot, or null if there is nothing to redo.
   */
  redo(): FixtureSnapshot | null {
    if (this.future.length === 0) return null;

    const next = this.future.shift()!;
    if (this.current !== null) {
      this.past.push(this.current);
    }
    this.current = next;
    return next;
  }

  /** True when there is at least one state to undo. */
  get canUndo(): boolean {
    return this.past.length > 0;
  }

  /** True when there is at least one state to redo. */
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Number of states in the undo stack. */
  get undoDepth(): number {
    return this.past.length;
  }

  /** Number of states in the redo stack. */
  get redoDepth(): number {
    return this.future.length;
  }

  /**
   * Replace the entire history — useful when loading a file from disk.
   * Sets `initialState` as current with empty past/future.
   */
  reset(initialState: FixtureSnapshot): void {
    this.past    = [];
    this.future  = [];
    this.current = initialState;
  }

  /** Discard all history and current state. */
  clear(): void {
    this.past    = [];
    this.future  = [];
    this.current = null;
  }
}
