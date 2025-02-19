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
    worker.addEventListener(
      "message",
      () => {
        resolve(worker);
      },
      { once: true }
    );
  });
};
const exec = <T extends WorkerType>(
  worker: Worker,
  name: keyof T,
  ...value: Parameters<T[keyof T]>
): Promise<ReturnType<T[keyof T]>> => {
  return new Promise((resolve, reject) => {
    const p = async (result: MessageEvent<WorkerSendEvent<T>>) => {
      const { data } = result;
      switch (data.type) {
        case "callback":
          const r = value[data.payload.index](data.payload.value);
          worker.postMessage({
            type: "callback_result",
            payload: { id: data.payload.id, result: await r },
          });
          break;
        case "result":
          worker.removeEventListener("message", p);
          resolve(data.payload);
          break;
        case "error":
          worker.removeEventListener("message", p);
          reject(data.payload);
          break;
      }
    };
    worker.addEventListener("message", p);
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
export const createWorker = <T extends WorkerType>(builder: () => Worker, limit = 0) => {
  let workers = 0;
  const unuses: Worker[] = [];
  const jobs: any = [];
  return <K extends keyof T>(name: K, ...value: Parameters<T[K]>): Promise<ReturnType<T[K]>> => {
    return new Promise(async (resolve, reject) => {
      jobs.push({ resolve, reject, name, value });
      let worker = unuses.pop();
      if (limit === 0 || workers < limit) {
        worker = await init(builder());
        workers++;
      }
      if (worker) {
        while (jobs.length) {
          const { resolve, reject, name, value } = jobs.shift();
          await exec(worker, name, ...value)
            .then((v) => resolve(v))
            .catch((e) => reject(e));
        }
        unuses.push(worker);
      }
    });
  };
};
/**
 *
 *
 * @template T
 * @param {T} WorkerProc
 * @return {*}
 */
export const initWorker = <T extends WorkerType>(WorkerProc: T) => {
  const worker = self as unknown as Worker;
  worker.addEventListener("message", async (e: MessageEvent) => {
    const data = e.data as WorkerRecvEvent<T>;
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
            callback[index] ? (...params: unknown[]) => callbackProc<T>(worker, index, params) : v
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
    worker.addEventListener(
      "message",
      (e: MessageEvent) => {
        const data = e.data as WorkerRecvEvent<T>;
        if (data.type === "callback_result" && data.payload.id === id) {
          resolve(data.payload.result);
        }
      },
      { once: true }
    );
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
