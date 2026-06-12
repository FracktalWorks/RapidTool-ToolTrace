/**
 * ComputeRuntime — Centralised Worker Scheduler
 *
 * RESPONSIBILITIES
 *   - Enforce max-1-active-job per worker type so concurrent submissions
 *     don't spawn multiple workers fighting for the same CPU/GPU budget.
 *   - Keep at most 1 queued (pending) job per type; a newer submission
 *     replaces the previously queued one (newest-wins backpressure).
 *   - Memory-budget guard: refuses to start a job when heap usage exceeds
 *     the configured limit and throws a visible 'device busy' error.
 *   - Job-level cancellation: queued jobs can be cancelled before they
 *     start; in-flight jobs are marked cancelled and their result discarded.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does NOT own or create web workers — that remains in the individual
 *     *WorkerManager files.
 *   - Does NOT retry crashed workers — that is P3-02 (workerManager retry).
 *   - Does NOT display UI — callers are responsible for surfacing errors.
 *
 * USAGE
 *   import { computeRuntime } from '@rapidtool/cad-core';
 *
 *   const result = await computeRuntime.submit({
 *     type: 'offset',
 *     run: () => generateOffsetMeshInWorker(vertices, options, onProgress),
 *   });
 *
 * CANONICAL LOCATION: packages/cad-core/src/compute/computeRuntime.ts
 * Exported via:        packages/cad-core/src/compute/index.ts
 */

// ─── Worker types ─────────────────────────────────────────────────────────────

/**
 * Logical worker channel. Each channel has its own active/queued slot.
 * Multiple channels may share the same underlying web worker (e.g. 'csg'
 * and 'clamp-csg' are separate channels even if implemented in csgWorker.ts
 * — keeping them separate prevents a slow clamp-CSG from blocking a subtraction).
 */
export type WorkerType =
  | 'parse'       // STL/3MF parsing
  | 'decimate'    // MeshOptimizer simplification
  | 'offset'      // Cavity heightmap + mesh generation
  | 'csg'         // Boolean union/subtraction (support trimming, export merge)
  | 'clamp-csg'   // Clamp cutout subtraction
  | 'hole-csg';   // Mounting-hole subtraction

// ─── Task / Job ───────────────────────────────────────────────────────────────

export interface ComputeTask<T> {
  /** Channel this task belongs to. */
  type: WorkerType;
  /**
   * Optional stable identifier.
   * If omitted, an ID is auto-generated.
   * Useful for targeted cancellation (e.g. cancel the current offset preview
   * when the user changes a slider before the old job finishes).
   */
  jobId?: string;
  /**
   * Estimated heap cost for this job in bytes.
   * Used to check against the memory budget before starting.
   * A conservative over-estimate is fine (better to block than crash).
   * Omit when the cost is negligible or unknown.
   */
  estimatedBytes?: number;
  /**
   * The actual async work to perform.
   * Should call the relevant *InWorker() function and return its Promise.
   * ComputeRuntime calls this exactly once when the channel slot is free.
   */
  run: () => Promise<T>;
}

/** Internal job envelope — wraps a task with runtime bookkeeping. */
interface ComputeJob<T> {
  id: string;
  task: ComputeTask<T>;
  resolve: (value: T) => void;
  reject:  (error: Error) => void;
  /** True once cancel() is called on this job. */
  cancelled: boolean;
  /** Wall-clock time at which this job was submitted (ms). */
  submittedAt: number;
  /** Number of times this job has been retried after a worker crash. */
  retryCount: number;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Thrown when a job is cancelled before it starts. */
export class ComputeCancelledError extends Error {
  readonly jobId: string;
  constructor(jobId: string) {
    super(`Compute job "${jobId}" was cancelled`);
    this.name  = 'ComputeCancelledError';
    this.jobId = jobId;
  }
}

/** Thrown when a new job submission is rejected due to memory pressure. */
export class ComputeMemoryBudgetError extends Error {
  readonly usedBytes:   number;
  readonly budgetBytes: number;
  constructor(used: number, budget: number) {
    super(
      `Device busy: heap usage ${(used / 1e6).toFixed(0)} MB exceeds ` +
      `budget ${(budget / 1e6).toFixed(0)} MB. Free memory and try again.`
    );
    this.name        = 'ComputeMemoryBudgetError';
    this.usedBytes   = used;
    this.budgetBytes = budget;
  }
}

// ─── ComputeRuntime ───────────────────────────────────────────────────────────

/** Default memory budget: 1.5 GB JS heap */
const DEFAULT_MEMORY_BUDGET = 1.5 * 1024 * 1024 * 1024;

export class ComputeRuntime {
  // ── Per-channel state ──────────────────────────────────────────────────────

  /**
   * Currently executing job per channel.
   * null = channel is idle.
   */
  private readonly activeJobs  = new Map<WorkerType, ComputeJob<any>>();

  /**
   * At most one queued (waiting) job per channel.
   * When a new job arrives for a busy channel, it displaces the previously
   * queued job (newest-wins), which is rejected with ComputeCancelledError.
   */
  private readonly queuedJobs  = new Map<WorkerType, ComputeJob<any>>();

  /** All live jobs indexed by ID for O(1) cancel lookup. */
  private readonly jobsById    = new Map<string, ComputeJob<any>>();

  // ── Memory budget ──────────────────────────────────────────────────────────

  private memoryBudget: number;

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(memoryBudgetBytes: number = DEFAULT_MEMORY_BUDGET) {
    this.memoryBudget = memoryBudgetBytes;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Submit a compute task and receive a Promise for its result.
   *
   * - If the channel is idle → starts immediately (subject to memory check).
   * - If the channel is busy → queues the task, cancelling any previously
   *   queued task for the same channel (newest-wins).
   *
   * @throws ComputeMemoryBudgetError  when heap usage exceeds the budget.
   */
  submit<T>(task: ComputeTask<T>): Promise<T> {
    const id = task.jobId ?? this.generateId(task.type);

    return new Promise<T>((resolve, reject) => {
      const job: ComputeJob<T> = {
        id,
        task,
        resolve,
        reject,
        cancelled:   false,
        submittedAt: performance.now(),
        retryCount:  0,
      };

      this.jobsById.set(id, job);

      if (!this.activeJobs.has(task.type)) {
        // Channel is idle — start immediately.
        this.startJob(job);
      } else {
        // Channel is busy — queue (displacing any existing queued job).
        const displaced = this.queuedJobs.get(task.type);
        if (displaced) {
          this.jobsById.delete(displaced.id);
          displaced.cancelled = true;
          displaced.reject(new ComputeCancelledError(displaced.id));
          console.debug(
            `[ComputeRuntime] Displaced queued ${task.type} job "${displaced.id}" ` +
            `in favour of "${id}"`
          );
        }
        this.queuedJobs.set(task.type, job);
        console.debug(`[ComputeRuntime] Queued ${task.type} job "${id}"`);
      }
    });
  }

  /**
   * Cancel a job by ID.
   *
   * - Queued jobs: removed from the queue; their Promise is rejected immediately.
   * - In-flight jobs: marked as cancelled; the underlying worker still runs to
   *   completion but its result is silently discarded.
   *
   * Returns `true` if the job was found, `false` if it didn't exist.
   */
  cancel(jobId: string): boolean {
    const job = this.jobsById.get(jobId);
    if (!job) return false;

    job.cancelled = true;

    // Check if it's queued (hasn't started yet).
    const isQueued = this.queuedJobs.get(job.task.type)?.id === jobId;
    if (isQueued) {
      this.queuedJobs.delete(job.task.type);
      this.jobsById.delete(jobId);
      job.reject(new ComputeCancelledError(jobId));
      console.debug(`[ComputeRuntime] Cancelled queued job "${jobId}"`);
    } else {
      // In-flight: can't stop the worker, but the result will be discarded.
      console.debug(`[ComputeRuntime] Marked in-flight job "${jobId}" as cancelled`);
    }

    return true;
  }

  /**
   * Return the current JS heap usage in bytes.
   *
   * Uses `performance.memory` (Chrome / Chromium only).
   * Returns 0 on unsupported browsers — memory checks are skipped.
   */
  getMemoryUsage(): number {
    return (performance as any).memory?.usedJSHeapSize ?? 0;
  }

  /** Update the memory budget ceiling (bytes). */
  setMemoryBudget(bytes: number): void {
    this.memoryBudget = bytes;
  }

  /**
   * Returns `true` when heap usage exceeds the configured budget.
   * Jobs with `estimatedBytes` will be refused when this is true.
   */
  isDeviceBusy(): boolean {
    const used = this.getMemoryUsage();
    return used > 0 && used > this.memoryBudget;
  }

  /**
   * Drain all queued and in-flight job queues, rejecting their Promises.
   * Does NOT terminate the underlying web workers — call each worker
   * manager's `terminate*()` function separately if needed.
   */
  terminate(): void {
    this.queuedJobs.forEach((job) => {
      job.cancelled = true;
      job.reject(new ComputeCancelledError(job.id));
    });
    this.queuedJobs.clear();

    this.activeJobs.forEach((job) => {
      job.cancelled = true;
      // Active job promise is already in-flight; marking cancelled ensures
      // its result is discarded when the worker responds.
    });
    this.activeJobs.clear();

    this.jobsById.clear();
    console.debug('[ComputeRuntime] Terminated — all queues drained');
  }

  // ── Queue stats (for diagnostics / tests) ─────────────────────────────────

  /** Number of currently active (in-flight) jobs. */
  get activeCount(): number { return this.activeJobs.size; }

  /** Number of queued (waiting) jobs. */
  get queuedCount(): number { return this.queuedJobs.size; }

  // ── Private helpers ───────────────────────────────────────────────────────

  private generateId(type: WorkerType): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Memory check + kick-off.  Must only be called when the channel is idle.
   */
  private startJob<T>(job: ComputeJob<T>): void {
    const { task } = job;

    // ── Memory guard ──────────────────────────────────────────────────────
    if (task.estimatedBytes) {
      const used = this.getMemoryUsage();
      if (used > 0 && used + task.estimatedBytes > this.memoryBudget) {
        this.jobsById.delete(job.id);
        job.reject(new ComputeMemoryBudgetError(used, this.memoryBudget));
        console.warn(
          `[ComputeRuntime] Refused ${task.type} job "${job.id}": ` +
          `heap ${(used / 1e6).toFixed(0)} MB + estimated ` +
          `${(task.estimatedBytes / 1e6).toFixed(0)} MB > ` +
          `budget ${(this.memoryBudget / 1e6).toFixed(0)} MB`
        );
        return;
      }
    }

    // ── Mark active ───────────────────────────────────────────────────────
    this.activeJobs.set(task.type, job);
    console.debug(
      `[ComputeRuntime] Starting ${task.type} job "${job.id}" ` +
      `(queued ${(performance.now() - job.submittedAt).toFixed(0)} ms ago)`
    );

    // ── Run ───────────────────────────────────────────────────────────────
    task.run().then(
      (result) => {
        this.activeJobs.delete(task.type);
        this.jobsById.delete(job.id);

        if (job.cancelled) {
          console.debug(
            `[ComputeRuntime] Discarding result of cancelled ${task.type} job "${job.id}"`
          );
        } else {
          job.resolve(result);
        }

        this.drainQueue(task.type);
      },
      (error: Error) => {
        this.activeJobs.delete(task.type);

        if (!job.cancelled && this.isWorkerCrash(error) && job.retryCount < 1) {
          // P3-02: Single automatic retry after a worker crash.
          // The worker manager already nulled its worker reference on crash,
          // so task.run() will spawn a fresh worker instance.
          job.retryCount += 1;
          console.warn(
            `[ComputeRuntime] Worker crash on ${task.type} job "${job.id}" — ` +
            `retrying (attempt ${job.retryCount})`
          );
          this.startJob(job);
          // Do NOT drain the queue — this job is being retried, not finished.
          return;
        }

        this.jobsById.delete(job.id);

        if (!job.cancelled) {
          job.reject(error);
        }

        this.drainQueue(task.type);
      }
    );
  }

  /**
   * Detect whether an error originated from a worker crash rather than
   * application logic.  Worker managers report crashes by rejecting pending
   * jobs with a message containing "crashed" or "error" (see onerror handlers
   * in each *WorkerManager file).  This is intentionally broad — a false
   * positive triggers one unnecessary retry, which is a much lower cost than
   * failing a user operation due to a transient crash.
   */
  private isWorkerCrash(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return msg.includes('crashed') || msg.includes('worker error');
  }

  /**
   * If a job is queued for the given channel, start it now.
   * Called after an active job completes or errors.
   */
  private drainQueue(type: WorkerType): void {
    const next = this.queuedJobs.get(type);
    if (!next) return;

    this.queuedJobs.delete(type);

    if (next.cancelled) {
      // Job was cancelled while queued — skip and drain again (shouldn't
      // happen because cancel() also removes from queuedJobs, but be safe).
      this.drainQueue(type);
      return;
    }

    this.startJob(next);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/**
 * Application-wide ComputeRuntime singleton.
 *
 * Import this in worker-manager callers instead of calling worker managers
 * directly when you need backpressure, cancellation, or memory protection.
 *
 * @example
 *   import { computeRuntime } from '@rapidtool/cad-core';
 *
 *   const jobId = `offset-preview-${Date.now()}`;
 *   // Cancel any previously queued preview before submitting a new one.
 *   computeRuntime.cancel(jobId);
 *
 *   const result = await computeRuntime.submit({
 *     type: 'offset',
 *     jobId,
 *     estimatedBytes: 50 * 1024 * 1024,  // ~50 MB estimate
 *     run: () => generateOffsetMeshInWorker(vertices, options, onProgress),
 *   });
 */
export const computeRuntime = new ComputeRuntime();
