/**
 * ComputeRuntime — Unit Tests
 *
 * Tests the scheduler logic in isolation.
 * No DOM, no actual workers — the `run` function is a plain Promise.
 * `performance.memory` is mocked per-test via vi.stubGlobal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ComputeRuntime,
  ComputeCancelledError,
  ComputeMemoryBudgetError,
} from '../computeRuntime';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a job that resolves to `value` after `delayMs`. */
function makeJob<T>(value: T, delayMs = 0) {
  return () =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), delayMs));
}

/** Stub performance.memory.usedJSHeapSize to a fixed value. */
function mockHeap(usedBytes: number) {
  vi.stubGlobal('performance', {
    now: () => Date.now(),
    memory: { usedJSHeapSize: usedBytes },
  });
}

/** Remove the performance.memory stub (restore to Node default). */
function clearHeapMock() {
  vi.stubGlobal('performance', {
    now: () => Date.now(),
    memory: undefined,
  });
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('ComputeRuntime', () => {
  let rt: ComputeRuntime;

  beforeEach(() => {
    rt = new ComputeRuntime();
    clearHeapMock();
  });

  afterEach(() => {
    rt.terminate();
    vi.restoreAllMocks();
  });

  // ── Basic scheduling ───────────────────────────────────────────────────────

  it('starts a job immediately when channel is idle', async () => {
    const result = await rt.submit({ type: 'parse', run: makeJob('hello') });
    expect(result).toBe('hello');
  });

  it('resolves multiple sequential jobs on the same channel', async () => {
    const r1 = await rt.submit({ type: 'parse', run: makeJob(1) });
    const r2 = await rt.submit({ type: 'parse', run: makeJob(2) });
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it('marks channel as active while job runs', async () => {
    let active = 0;
    const jobPromise = rt.submit({
      type: 'offset',
      run: () =>
        new Promise<void>((resolve) => {
          active = rt.activeCount;
          resolve();
        }),
    });
    await jobPromise;
    expect(active).toBe(1);
  });

  it('returns activeCount = 0 after job completes', async () => {
    await rt.submit({ type: 'parse', run: makeJob('done') });
    expect(rt.activeCount).toBe(0);
  });

  // ── Queue / newest-wins ────────────────────────────────────────────────────

  it('queues a second job when channel is busy', async () => {
    let queuedDuringRun = 0;

    const first = rt.submit({
      type: 'decimate',
      run: () =>
        new Promise<void>((resolve) => {
          // Submit second job while first is running
          rt.submit({ type: 'decimate', run: makeJob('q') }).catch(() => {});
          queuedDuringRun = rt.queuedCount;
          resolve();
        }),
    });

    await first;
    expect(queuedDuringRun).toBe(1);
  });

  it('newest-wins: third submit displaces second with ComputeCancelledError', async () => {
    const results: Array<string | Error> = [];

    // First job runs immediately — slow enough for queue to fill
    const first = rt.submit({
      type: 'csg',
      run: makeJob('first', 50),
    });

    // Second job queues
    const second = rt
      .submit({ type: 'csg', jobId: 'job-b', run: makeJob('second', 10) })
      .catch((e) => { results.push(e); return null; });

    // Third job displaces second (newest-wins)
    const third = rt.submit({
      type: 'csg',
      jobId: 'job-c',
      run: makeJob('third', 10),
    });

    await first;
    await second;
    const thirdResult = await third;

    expect(results.length).toBe(1);
    expect(results[0]).toBeInstanceOf(ComputeCancelledError);
    expect((results[0] as ComputeCancelledError).jobId).toBe('job-b');
    expect(thirdResult).toBe('third');
  });

  it('drains queue and runs the queued job after active completes', async () => {
    const order: number[] = [];

    const first = rt.submit({
      type: 'offset',
      run: async () => { order.push(1); },
    });

    // Second queues while first is starting
    const second = rt.submit({
      type: 'offset',
      run: async () => { order.push(2); },
    });

    await first;
    await second;
    expect(order).toEqual([1, 2]);
  });

  // ── Channel isolation ─────────────────────────────────────────────────────

  it('two different channels run concurrently', async () => {
    let peakActive = 0;
    const track = async () => {
      peakActive = Math.max(peakActive, rt.activeCount);
    };

    const a = rt.submit({ type: 'parse', run: async () => { await track(); } });
    const b = rt.submit({ type: 'offset', run: async () => { await track(); } });

    await Promise.all([a, b]);
    // Both channels were active at the same time
    expect(peakActive).toBe(2);
  });

  // ── Cancellation ──────────────────────────────────────────────────────────

  it('cancel queued job → rejects with ComputeCancelledError', async () => {
    // Keep channel busy
    rt.submit({ type: 'hole-csg', run: makeJob('busy', 100) });

    let caughtError: Error | null = null;
    const queued = rt
      .submit({ type: 'hole-csg', jobId: 'cancel-me', run: makeJob('should-not-run') })
      .catch((e) => { caughtError = e; });

    const cancelled = rt.cancel('cancel-me');
    await queued;

    expect(cancelled).toBe(true);
    expect(caughtError).toBeInstanceOf(ComputeCancelledError);
    expect(rt.queuedCount).toBe(0);
  });

  it('cancel in-flight job → result is discarded (no resolve, no reject)', async () => {
    let resolved = false;
    let rejected = false;

    // NOTE: do NOT await this promise — when a job is cancelled in-flight,
    // ComputeRuntime discards the result without settling the Promise.
    // That is the correct behaviour (the caller lost interest).
    rt.submit({
      type: 'clamp-csg',
      jobId: 'inflight',
      run: makeJob('result', 30),
    })
      .then(() => { resolved = true; })
      .catch(() => { rejected = true; });

    rt.cancel('inflight');

    // Wait long enough for the underlying run() to complete and result to be discarded
    await new Promise((r) => setTimeout(r, 100));

    expect(resolved).toBe(false);
    expect(rejected).toBe(false);
  });

  it('cancel returns false for an unknown job ID', () => {
    expect(rt.cancel('does-not-exist')).toBe(false);
  });

  // ── Memory guard ──────────────────────────────────────────────────────────

  it('rejects with ComputeMemoryBudgetError when heap + estimate exceeds budget', async () => {
    const budget = 100 * 1024 * 1024; // 100 MB
    const rt2 = new ComputeRuntime(budget);

    mockHeap(90 * 1024 * 1024); // 90 MB used

    await expect(
      rt2.submit({
        type: 'offset',
        estimatedBytes: 20 * 1024 * 1024, // 20 MB → 110 MB total > 100 MB budget
        run: makeJob('should-not-run'),
      })
    ).rejects.toBeInstanceOf(ComputeMemoryBudgetError);

    rt2.terminate();
  });

  it('starts job normally when heap + estimate is within budget', async () => {
    const budget = 200 * 1024 * 1024; // 200 MB
    const rt2 = new ComputeRuntime(budget);

    mockHeap(50 * 1024 * 1024); // 50 MB used

    const result = await rt2.submit({
      type: 'offset',
      estimatedBytes: 50 * 1024 * 1024, // 50 MB → 100 MB total < 200 MB budget
      run: makeJob('ok'),
    });

    expect(result).toBe('ok');
    rt2.terminate();
  });

  it('skips memory guard when estimatedBytes is omitted', async () => {
    mockHeap(2 * 1024 * 1024 * 1024); // 2 GB — would trigger guard if estimatedBytes set

    const result = await rt.submit({
      type: 'parse',
      // estimatedBytes deliberately omitted
      run: makeJob('no-guard'),
    });

    expect(result).toBe('no-guard');
  });

  it('isDeviceBusy() returns false when performance.memory is unavailable', () => {
    clearHeapMock();
    expect(rt.isDeviceBusy()).toBe(false);
  });

  it('isDeviceBusy() returns true when heap exceeds budget', () => {
    const budget = 500 * 1024 * 1024;
    const rt2 = new ComputeRuntime(budget);
    mockHeap(600 * 1024 * 1024);
    expect(rt2.isDeviceBusy()).toBe(true);
    rt2.terminate();
  });

  // ── Worker crash retry ────────────────────────────────────────────────────

  it('retries once after a worker crash ("crashed" in message)', async () => {
    let callCount = 0;
    const crashError = new Error('worker crashed');

    const result = await rt.submit({
      type: 'csg',
      run: () => {
        callCount++;
        if (callCount === 1) return Promise.reject(crashError);
        return Promise.resolve('recovered');
      },
    });

    expect(callCount).toBe(2);
    expect(result).toBe('recovered');
  });

  it('retries once after a "worker error" message', async () => {
    let callCount = 0;

    await rt.submit({
      type: 'decimate',
      run: () => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('worker error in thread'));
        return Promise.resolve('ok');
      },
    });

    expect(callCount).toBe(2);
  });

  it('does NOT retry after second crash — rejects with original error', async () => {
    let callCount = 0;
    const crashError = new Error('worker crashed');

    await expect(
      rt.submit({
        type: 'offset',
        run: () => {
          callCount++;
          return Promise.reject(crashError);
        },
      })
    ).rejects.toBe(crashError);

    expect(callCount).toBe(2); // initial + 1 retry
  });

  it('does NOT retry on non-crash errors', async () => {
    let callCount = 0;

    await expect(
      rt.submit({
        type: 'parse',
        run: () => {
          callCount++;
          return Promise.reject(new Error('invalid STL format'));
        },
      })
    ).rejects.toThrow('invalid STL format');

    expect(callCount).toBe(1); // no retry
  });

  // ── terminate() ───────────────────────────────────────────────────────────

  it('terminate() rejects all queued jobs with ComputeCancelledError', async () => {
    const errors: Error[] = [];

    // Keep channel busy
    rt.submit({ type: 'parse', run: makeJob('busy', 100) });

    // Queue two jobs
    rt
      .submit({ type: 'parse', run: makeJob('q1') })
      .catch((e) => errors.push(e));

    rt.terminate();

    await new Promise((r) => setTimeout(r, 0));
    expect(errors.length).toBeGreaterThanOrEqual(1);
    errors.forEach((e) => expect(e).toBeInstanceOf(ComputeCancelledError));
    expect(rt.queuedCount).toBe(0);
    expect(rt.activeCount).toBe(0);
  });
});
