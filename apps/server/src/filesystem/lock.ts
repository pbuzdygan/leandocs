import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Serialises content mutations (create, save, rename, move, trash, restore, folder operations)
 * so two requests can never interleave filesystem steps. Reads are not locked.
 */
export class MutationLock {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly owner = new AsyncLocalStorage<true>();

  run<T>(task: () => Promise<T>): Promise<T> {
    const guarded = (): Promise<T> => this.owner.run(true, task);
    const result = this.tail.then(guarded, guarded);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** True inside a task this lock is running; calling `run` again there would deadlock. */
  held(): boolean {
    return this.owner.getStore() === true;
  }
}
