type WorkerType = { [key: string]: (...args: any) => any };

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
    worker.addEventListener(
      "message",
      (result) => {
        switch (result.data.type) {
          case "result":
            resolve(result.data.payload);
            break;
          case "error":
            reject(result.data.payload)
            break;
        }
      },
      { once: true }
    );
    worker.postMessage({ type: name, value });
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
  return <K extends keyof T>(
    name: K,
    ...value: Parameters<T[K]>
  ): Promise<ReturnType<T[K]>> => {
    return new Promise(async (resolve, reject) => {
      jobs.push({ resolve, reject, name, value });
      let worker =  unuses.pop();
      if (limit === 0 || workers < limit) {
        worker = await init(builder());
        workers++;
      }
      if (worker) {
        while (jobs.length) {
          const { resolve, reject, name, value } = jobs.shift();
          await exec(worker, name, ...value).then(v => resolve(v)).catch(e => reject(e))
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
  export const initWorker = <T extends WorkerType>(
  WorkerProc: T
) => {
  const worker = self as unknown as Worker;
  worker.addEventListener("message", (e: MessageEvent) => {
    const proc = WorkerProc[e.data.type as keyof T];
    if (proc) {
      try {
        worker.postMessage({ type: "result", payload: proc(...e.data.value) });
      } catch (e) {
        worker.postMessage({ type: "error", payload: String(e) });
      }
    }
  });
  worker.postMessage(undefined);
  return WorkerProc;
};
