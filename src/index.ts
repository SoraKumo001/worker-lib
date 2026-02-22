import { WorkerType, UniversalWorker } from "./common";
import { createWorkerPool, initUniversalWorker } from "./pool";

const w = Worker;
export { w as Worker };

const wrapWorker = (worker: Worker): UniversalWorker => ({
  postMessage: (message, transfer) => worker.postMessage(message, transfer as any),
  addEventListener: (type, listener) => {
    const handler = (e: Event) => {
      if (e instanceof MessageEvent) listener(e.data);
    };
    (listener as any)._handler = handler;
    worker.addEventListener(type, handler);
  },
  removeEventListener: (type, listener) => {
    const handler = (listener as any)._handler;
    worker.removeEventListener(type, handler);
  },
  terminate: () => worker.terminate(),
});

const init = (worker: Worker): Promise<Worker> => {
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      if (e.data === "ready") {
        worker.removeEventListener("message", handler);
        resolve(worker);
      }
    };
    worker.addEventListener("message", handler);
  });
};

export const createWorker = <T extends WorkerType>(
  builder: () => Worker | string | URL,
  limit = 4,
) => {
  return createWorkerPool<T>(async () => {
    const result = builder();
    const worker = result instanceof Worker ? result : new Worker(result as string | URL);
    await init(worker);
    return wrapWorker(worker);
  }, limit);
};

export const initWorker = <T extends WorkerType>(WorkerProc: T) => {
  const worker = self as unknown as Worker;
  const universalWorker: UniversalWorker = {
    postMessage: (message, transfer) => worker.postMessage(message, transfer as any),
    addEventListener: (type, listener) => {
      const handler = (e: Event) => {
        if (e instanceof MessageEvent) listener(e.data);
      };
      (listener as any)._handler = handler;
      worker.addEventListener(type, handler);
    },
    removeEventListener: (type, listener) => {
      const handler = (listener as any)._handler;
      worker.removeEventListener(type, handler);
    },
    terminate: () => {
      /* cannot terminate self */
    },
  };
  return initUniversalWorker(universalWorker, WorkerProc);
};
