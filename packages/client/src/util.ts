export function retryable<T>(
  func: () => Promise<T>,
  delay: number,
): Promise<T> {
  return new Promise(resolve => {
    const run = (i: number) => {
      setTimeout(() => {
        func()
          .then(res => res)
          .then(val => resolve(val))
          .catch(() => run(i + 1));
      }, delay * i);
    };
    run(0);
  });
}
