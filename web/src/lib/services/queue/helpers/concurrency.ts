// web/src/lib/services/queue/helpers/concurrency.ts

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


