import { afterEach, describe, expect, it, vi } from 'vitest';
import { delay, runPool, Semaphore } from './concurrency';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Semaphore', () => {
  it('lets only `limit` holders in at once and admits waiters in order', async () => {
    const sem = new Semaphore(2);
    const order: string[] = [];
    const releaseA = await sem.acquire();
    const releaseB = await sem.acquire();

    const waitC = sem.acquire().then((release) => (order.push('c'), release));
    const waitD = sem.acquire().then((release) => (order.push('d'), release));
    await tick();
    expect(order).toEqual([]);

    releaseA();
    await tick();
    expect(order).toEqual(['c']);
    releaseB();
    await tick();
    expect(order).toEqual(['c', 'd']);
    (await waitC)();
    (await waitD)();
  });

  it('ignores a release that is called twice', async () => {
    const sem = new Semaphore(1);
    const release = await sem.acquire();
    release();
    release();
    let admitted = 0;
    sem.acquire().then(() => admitted++);
    sem.acquire().then(() => admitted++);
    await tick();
    expect(admitted).toBe(1); // a double release must not create a second free slot
  });
});

describe('runPool', () => {
  it('runs every item with at most `limit` in flight', async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await tick();
      seen.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    const worker = vi.fn(async () => undefined);
    await runPool([], 4, worker);
    expect(worker).not.toHaveBeenCalled();
    await runPool([1, 2], 10, worker);
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it('stops starting new items after a failure, finishes in-flight work and throws the first error', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const promise = runPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n);
      await tick();
      if (n === 2) throw new Error('boom 2');
      finished.push(n);
    });
    await expect(promise).rejects.toThrow('boom 2');
    expect(finished).toContain(1); // the other lane's in-flight item still completed
    expect(started.length).toBeLessThan(6);
    expect(started).not.toContain(6);
  });
});

describe('delay', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves after the given time', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const promise = delay(500).then(done);
    await vi.advanceTimersByTimeAsync(499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(done).toHaveBeenCalled();
  });

  it('rejects as soon as the signal aborts', async () => {
    const controller = new AbortController();
    const promise = delay(60_000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(delay(10, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
