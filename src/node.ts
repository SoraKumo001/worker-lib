import { parentPort, type Worker } from "node:worker_threads";
type WorkerType = { [key: string]: (...args: any) => any };
type WorkerRecvEvent<T> =
  | {
      type: "function";
      payload: { name: keyof T; callback: boolean[]; value: unknown[] };
    }
  | { type: "callback_result"; payload: { id: number; result: unknown } };
type WorkerSendEvent<T extends WorkerType> =
  | {
      type: "callback";
      payload: { id: number; result: unknown; index: number; value: T };
    }
  | {
      type: "result";
      payload: ReturnType<T[keyof T]>;
    }
  | {
      type: "error";
      payload: unknown;
    };

const init = (worker: Worker): Promise<Worker> => {
  return new Promise((resolve) => {
    worker.once("message", () => {
      resolve(worker);
    });
  });
};
const exec = <T extends WorkerType>(
  worker: Worker,
  name: keyof T,
  ...value: Parameters<T[keyof T]>
): Promise<ReturnType<T[keyof T]>> => {
  return new Promise((resolve, reject) => {
    const p = async (data: WorkerSendEvent<T>) => {
      switch (data.type) {
        case "callback":
          const r = value[data.payload.index](data.payload.value);
          worker.postMessage({
            type: "callback_result",
            payload: { id: data.payload.id, result: await r },
          });
          break;
        case "result":
          worker.removeListener("message", p);
          resolve(data.payload);
          break;
        case "error":
          worker.removeListener("message", p);
          reject(data.payload);
          break;
      }
    };
    worker.addListener("message", p);
    worker.postMessage({
      type: "function",
      payload: {
        name,
        value: value.map((v: unknown) => !(typeof v === "function") && v),
        callback: value.map((v: unknown) => typeof v === "function"),
      },
    } as WorkerRecvEvent<T>);
  });
};

/**
 * createWorker
 *
 * @template T
 * @param {() => Worker} builder
 * @param {number} [limit=0]
 * @return {*}
 */
export const createWorker = <T extends WorkerType>(
  builder: () => Worker,
  limit = 4
) => {
  let workers: {
    worker?: Worker;
    resultResolver?: PromiseWithResolvers<unknown>;
  }[] = Array(limit)
    .fill(undefined)
    .map(() => ({}));
  const emptyWaits: PromiseWithResolvers<void>[] = [];
  let isEmptyWait = false;

  const getResolver = async () => {
    while (true) {
      const target = workers.find(({ resultResolver }) => !resultResolver);
      if (target) {
        target.resultResolver = Promise.withResolvers<unknown>();
        if (!target.worker) target.worker = await init(builder());
        return target;
      }
      await Promise.race(
        workers.map(({ resultResolver }) => resultResolver?.promise)
      );
    }
  };

  const execute = async <K extends keyof T>(
    name: K,
    ...value: Parameters<T[K]>
  ): Promise<Awaited<ReturnType<T[K]>>> => {
    const target = await getResolver();
    const { resultResolver } = target;
    if (!resultResolver) throw new Error("Unexpected error");
    exec(target.worker!, name as string, ...value)
      .then(resultResolver.resolve)
      .catch(resultResolver.reject)
      .finally(() => {
        target.resultResolver = undefined;
      });
    return resultResolver.promise as Promise<Awaited<ReturnType<T[K]>>>;
  };
  const waitAll = async () => {
    while (workers.find(({ resultResolver }) => resultResolver)) {
      await Promise.all(
        workers.flatMap(({ resultResolver }) =>
          resultResolver ? [resultResolver.promise] : []
        )
      );
    }
  };
  const waitReady = async (retryTime = 1) => {
    const p = Promise.withResolvers<void>();
    emptyWaits.push(p);
    (async () => {
      if (!isEmptyWait) {
        isEmptyWait = true;
        do {
          const actives = workers.flatMap(({ resultResolver }) =>
            resultResolver ? [resultResolver.promise] : []
          );
          if (workers.length === actives.length) await Promise.race(actives);
          emptyWaits.shift()?.resolve();
          if (retryTime) await new Promise((r) => setTimeout(r, retryTime));
          else await Promise.resolve();
        } while (emptyWaits.length);
        isEmptyWait = false;
      }
    })();
    return p.promise;
  };
  const close = () => {
    for (const { worker } of workers) {
      worker?.terminate();
    }
  };
  const setLimit = (limit: number) => {
    workers.forEach((w) => w.worker?.terminate());
    workers = Array(limit)
      .fill(undefined)
      .map(() => ({}));
  };
  return { execute, waitAll, waitReady, close, setLimit };
};
/**
 *
 *
 * @template T
 * @param {T} WorkerProc
 * @return {*}
 */
export const initWorker = <T extends WorkerType>(WorkerProc: T) => {
  const worker = parentPort;
  if (!worker) {
    throw new Error("This is not a worker thread");
  }
  worker.addListener("message", async (data: WorkerRecvEvent<T>) => {
    if (data.type === "function") {
      const {
        name,
        value,
        callback,
      }: {
        name: keyof T;
        value: unknown[];
        callback: boolean[];
      } = data.payload;
      const proc = WorkerProc[name];
      if (proc) {
        try {
          const params = value.map((v, index) =>
            callback[index]
              ? (...params: unknown[]) =>
                  callbackProc<T>(worker as never, index, params)
              : v
          );
          worker.postMessage({
            type: "result",
            payload: await proc(...params),
          });
        } catch (e) {
          worker.postMessage({ type: "error", payload: String(e) });
        }
      }
    }
  });
  worker.postMessage(undefined);
  return WorkerProc;
};

const callbackProc = <T>(worker: Worker, index: number, params: unknown[]) => {
  const id = WorkerValue.id++;
  return new Promise((resolve) => {
    worker.once("message", (data: WorkerRecvEvent<T>) => {
      if (data.type === "callback_result" && data.payload.id === id) {
        resolve(data.payload.result);
      }
    });
    worker.postMessage({
      type: "callback",
      payload: { id, index, value: params },
    });
  });
};

const WorkerValue = { id: 0, promises: {} } as {
  id: number;
  promises: { [key: number]: Promise<unknown> };
};
