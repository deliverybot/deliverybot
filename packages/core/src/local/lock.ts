export class LockStore {
  private locks: { [k: string]: boolean | undefined } = {};

  lock(key: string, handler: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        if (this.locks[key]) {
          setTimeout(run, 1);
          return;
        }

        this.locks[key] = true;
        try {
          await handler();
          resolve();
        } catch (err) {
          reject(err);
        }
        this.locks[key] = false;
      };
      run();
    });
  }
}
