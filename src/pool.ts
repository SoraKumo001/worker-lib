import {
  UniversalWorker,
  WorkerType,
  WorkerSendEvent,
  WorkerRecvEvent,
  createRegistry,
  getTransferables,
  isPlaceholder,
} from "./common";

let requestIdCounter = 0;

export const exec = <T extends WorkerType>(
  worker: UniversalWorker,
  name: keyof T,
  registry: ReturnType<typeof createRegistry>,
  ...args: Parameters<T[keyof T]>
): Promise<ReturnType<T[keyof T]>> => {
  const requestId = requestIdCounter++;
  const { callbacks, callbackProxies, clearCallbacks, transformArgs, resolveArgs } = registry;

  return new Promise((resolve, reject) => {
    const createProxy = (callbackId: string): Function => {
      const key = `${requestId}:${callbackId}`;
      if (callbackProxies.has(key)) return callbackProxies.get(key)!;
      const proxy = (...proxyArgs: any[]) => {
        const callId = Math.random().toString(36).slice(2);
        return new Promise((res) => {
          const handler = (data: WorkerSendEvent<T>) => {
            if (data.type === "callback_result" && data.payload.id === callId) {
              worker.removeEventListener("message", handler);
              res(resolveArgs(requestId, data.payload.result, createProxy));
            }
          };
          worker.addEventListener("message", handler);
          const transformedProxyArgs = transformArgs(requestId, proxyArgs);
          worker.postMessage(
            {
              type: "callback_call",
              payload: {
                id: requestId,
                callbackId,
                args: transformedProxyArgs,
                callId,
              },
            },
            getTransferables(transformedProxyArgs),
          );
        });
      };
      callbackProxies.set(key, proxy);
      return proxy;
    };

    const messageHandler = async (data: WorkerSendEvent<T>) => {
      if (!data || typeof data !== "object") return;

      const payload = (data as any).payload;
      if (payload?.id !== requestId) return;

      if (data.type === "result") {
        worker.removeEventListener("message", messageHandler);
        const result = resolveArgs(requestId, payload.result, createProxy);
        clearCallbacks(requestId);
        resolve(result);
      } else if (data.type === "error") {
        worker.removeEventListener("message", messageHandler);
        clearCallbacks(requestId);
        reject(payload.error);
      } else if (data.type === "callback_call") {
        const { callbackId, args: callArgs, callId } = payload;
        const fn = callbacks.get(callbackId);
        if (fn) {
          try {
            const result = await fn(...resolveArgs(requestId, callArgs, createProxy));
            const transformedResult = transformArgs(requestId, result);
            worker.postMessage(
              {
                type: "callback_result",
                payload: { id: callId, result: transformedResult },
              },
              getTransferables(transformedResult),
            );
          } catch (e) {
            console.error("[worker-lib] Callback execution failed:", e);
          }
        }
      }
    };

    worker.addEventListener("message", messageHandler);
    const transformedArgs = transformArgs(requestId, args);
    worker.postMessage(
      {
        type: "function",
        payload: {
          id: requestId,
          name,
          args: transformedArgs,
        },
      },
      getTransferables(transformedArgs),
    );
  });
};

export const createWorkerPool = <T extends WorkerType>(
  builder: () => UniversalWorker | Promise<UniversalWorker>,
  limit = 4,
) => {
  let workers: {
    worker?: UniversalWorker;
    resultResolver?: PromiseWithResolvers<unknown>;
  }[] = Array(limit)
    .fill(undefined)
    .map(() => ({}));
  const emptyWaits: PromiseWithResolvers<void>[] = [];
  let isEmptyWait = false;
  const registry = createRegistry();

  const getResolver = async () => {
    while (true) {
      const target = workers.find(({ resultResolver }) => !resultResolver);
      if (target) {
        target.resultResolver = Promise.withResolvers<unknown>();
        if (!target.worker) {
          target.worker = await builder();
        }
        return target;
      }
      await Promise.race(workers.map(({ resultResolver }) => resultResolver?.promise));
    }
  };

  const execute = async <K extends keyof T>(
    name: K,
    ...value: Parameters<T[K]>
  ): Promise<Awaited<ReturnType<T[K]>>> => {
    const target = await getResolver();
    const { resultResolver } = target;
    if (!resultResolver) throw new Error("Unexpected error");
    exec(target.worker!, name as string, registry, ...value)
      .then(resultResolver.resolve)
      .catch(resultResolver.reject)
      .finally(() => {
        target.resultResolver = undefined;
      });
    return resultResolver.promise as Promise<Awaited<ReturnType<T[K]>>>;
  };

  const launchWorker = async () => {
    return Promise.all(
      workers.map(async (target) => {
        if (!target.worker) {
          target.worker = await builder();
        }
      }),
    );
  };

  const waitAll = async () => {
    while (workers.find(({ resultResolver }) => resultResolver)) {
      await Promise.all(
        workers.flatMap(({ resultResolver }) => (resultResolver ? [resultResolver.promise] : [])),
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
            resultResolver ? [resultResolver.promise] : [],
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
    for (const target of workers) {
      target.worker?.terminate();
      target.worker = undefined;
      target.resultResolver = undefined;
    }
  };

  const setLimit = (newLimit: number) => {
    workers.forEach((w) => w.worker?.terminate());
    workers = Array(newLimit)
      .fill(undefined)
      .map(() => ({}));
  };

  return { execute, waitAll, waitReady, close, setLimit, launchWorker };
};

export const initUniversalWorker = <T extends WorkerType>(
  worker: UniversalWorker,
  WorkerProc: T,
) => {
  const {
    callbacks,
    callbackProxies,
    registerCallback,
    clearCallbacks,
    transformArgs,
    resolveArgs,
  } = createRegistry();

  const createProxy = (callbackId: string, requestId: number): Function => {
    const key = `${requestId}:${callbackId}`;
    if (callbackProxies.has(key)) return callbackProxies.get(key)!;
    const proxy = (...proxyArgs: any[]) => {
      const callId = Math.random().toString(36).slice(2);
      return new Promise((res) => {
        const handler = (data: WorkerRecvEvent<T>) => {
          if (data.type === "callback_result" && data.payload.id === callId) {
            worker.removeEventListener("message", handler);
            res(
              resolveArgs(requestId, data.payload.result, (cbId) => createProxy(cbId, requestId)),
            );
          }
        };
        worker.addEventListener("message", handler);
        const transformedArgs = transformArgs(requestId, proxyArgs);
        worker.postMessage(
          {
            type: "callback_call",
            payload: {
              id: requestId,
              callbackId,
              args: transformedArgs,
              callId,
            },
          },
          getTransferables(transformedArgs),
        );
      });
    };
    callbackProxies.set(key, proxy);
    return proxy;
  };

  worker.addEventListener("message", async (data: WorkerRecvEvent<T>) => {
    if (!data) return;

    if (data.type === "function") {
      const { id, name, args } = data.payload;
      const proc = WorkerProc[name];
      if (proc) {
        try {
          const resolvedArgs = resolveArgs(id, args, (cbId) => createProxy(cbId, id));
          const result = await proc(...resolvedArgs);
          const transformedResult = transformArgs(id, result);
          worker.postMessage(
            {
              type: "result",
              payload: { id, result: transformedResult },
            },
            getTransferables(transformedResult),
          );
          clearCallbacks(id);
        } catch (error) {
          worker.postMessage({
            type: "error",
            payload: { id, error: String(error) },
          });
          clearCallbacks(id);
        }
      }
    } else if (data.type === "callback_call") {
      const { id, callbackId, args, callId } = data.payload;
      const fn = callbacks.get(callbackId);
      if (fn) {
        try {
          const result = await fn(...resolveArgs(id, args, (cbId) => createProxy(cbId, id)));
          const transformedResult = transformArgs(id, result);
          worker.postMessage(
            {
              type: "callback_result",
              payload: { id: callId, result: transformedResult },
            },
            getTransferables(transformedResult),
          );
        } catch (e) {
          console.error("[worker-lib] Worker-side callback failed:", e);
        }
      }
    }
  });

  worker.postMessage("ready");
  return WorkerProc;
};
