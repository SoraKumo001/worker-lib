import { parentPort, Worker as WorkerNode } from "node:worker_threads";
import { WorkerType, UniversalWorker } from "./common";
import { createWorkerPool, initUniversalWorker } from "./pool";

export { Worker } from "node:worker_threads";

const wrapWorker = (worker: WorkerNode): UniversalWorker => ({
  postMessage: (message, transfer) => worker.postMessage(message, transfer as any),
  addEventListener: (type, listener) => {
    worker.on(type as any, listener);
  },
  removeEventListener: (type, listener) => {
    worker.removeListener(type as any, listener);
  },
  terminate: () => worker.terminate(),
});

const init = (worker: WorkerNode): Promise<WorkerNode> => {
  return new Promise((resolve) => {
    worker.once("message", () => {
      resolve(worker);
    });
  });
};

export const createWorker = <T extends WorkerType>(
  builder: () => WorkerNode | string | URL,
  limit = 4,
) => {
  return createWorkerPool<T>(async () => {
    const result = builder();
    const worker = result instanceof WorkerNode ? result : new WorkerNode(result);
    await init(worker);
    return wrapWorker(worker);
  }, limit);
};

export const initWorker = <T extends WorkerType>(WorkerProc: T) => {
  const worker = parentPort;
  if (!worker) {
    throw new Error("This is not a worker thread");
  }

  const universalWorker: UniversalWorker = {
    postMessage: (message, transfer) => worker.postMessage(message, transfer as any),
    addEventListener: (type, listener) => {
      worker.on(type as any, listener);
    },
    removeEventListener: (type, listener) => {
      worker.removeListener(type as any, listener);
    },
    terminate: () => {
      /* cannot terminate self */
    },
  };

  return initUniversalWorker(universalWorker, WorkerProc);
};
