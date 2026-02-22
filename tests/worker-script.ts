import { initWorker } from "../src/node";

const add = (a: number, b: number) => a + b;

const asyncTask = async (onProgress: (percent: number, status: string) => void) => {
  await onProgress(10, "starting");
  await onProgress(50, "halfway");
  await onProgress(100, "done");
  return "task-result";
};

const throwError = () => {
  throw new Error("Worker error");
};

const processTransferable = (buffer: ArrayBuffer) => {
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    view[i] *= 2;
  }
  return buffer;
};

const nestedData = (data: { a: number; b: { c: string }; d: number[] }) => {
  return {
    ...data,
    a: data.a + 1,
    b: { c: data.b.c.toUpperCase() },
    d: data.d.map(x => x * 2)
  };
};

const map = initWorker({ add, asyncTask, throwError, processTransferable, nestedData });
export type TestWorker = typeof map;
