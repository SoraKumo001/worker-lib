import { describe, it, expect, afterAll } from "vitest";
import { createWorker } from "../src/node";
import type { TestWorker } from "./worker-script";
import path from "node:path";

describe("worker-lib node", () => {
  const { execute, close } = createWorker<TestWorker>(
    () => {
      // Use tsx to run the TypeScript worker file directly
      const workerPath = path.resolve(__dirname, "./worker-script.ts");
      const normalizedPath = workerPath.split(path.sep).join("/");
      return new (require("node:worker_threads").Worker)(
        `require('tsx/cjs'); require('${normalizedPath}');`,
        { eval: true }
      );
    },
    2
  );

  afterAll(() => {
    close();
  });

  it("should execute a simple function", async () => {
    const result = await execute("add", 10, 20);
    expect(result).toBe(30);
  });

  it("should execute a function with callbacks", async () => {
    const progress: { percent: number; status: string }[] = [];
    
    const result = await execute("asyncTask", (percent, status) => {
      progress.push({ percent, status });
    });

    expect(result).toBe("task-result");
    expect(progress).toHaveLength(3);
    expect(progress[0]).toEqual({ percent: 10, status: "starting" });
    expect(progress[1]).toEqual({ percent: 50, status: "halfway" });
    expect(progress[2]).toEqual({ percent: 100, status: "done" });
  });

  it("should handle errors thrown in the worker", async () => {
    await expect(execute("throwError")).rejects.toThrow("Worker error");
  });

  it("should handle transferables (ArrayBuffer)", async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const result = await execute("processTransferable", buffer);
    const view = new Uint8Array(result);
    expect(Array.from(view)).toEqual([2, 4, 6, 8]);
    // The original buffer should be detached after transfer
    expect(buffer.byteLength).toBe(0);
  });

  it("should handle nested data structures", async () => {
    const data = {
      a: 1,
      b: { c: "hello" },
      d: [1, 2, 3]
    };
    const result = await execute("nestedData", data);
    expect(result).toEqual({
      a: 2,
      b: { c: "HELLO" },
      d: [2, 4, 6]
    });
  });

  it("should execute multiple tasks concurrently and wait for all", async () => {
    const start = Date.now();
    const results = await Promise.all([
      execute("add", 1, 2),
      execute("add", 3, 4),
      execute("add", 5, 6),
      execute("add", 7, 8)
    ]);
    expect(results).toEqual([3, 7, 11, 15]);
  });
});

describe("worker-pool management", () => {
  const builder = () => {
    const workerPath = path.resolve(__dirname, "./worker-script.ts");
    const normalizedPath = workerPath.split(path.sep).join("/");
    return new (require("node:worker_threads").Worker)(
      `require('tsx/cjs'); require('${normalizedPath}');`,
      { eval: true }
    );
  };

  it("should handle setLimit correctly", async () => {
    const pool = createWorker<TestWorker>(builder, 2);
    
    // Execute some tasks
    await Promise.all([
      pool.execute("add", 1, 1),
      pool.execute("add", 2, 2)
    ]);

    // Change limit
    pool.setLimit(4);
    
    const results = await Promise.all([
      pool.execute("add", 1, 1),
      pool.execute("add", 2, 2),
      pool.execute("add", 3, 3),
      pool.execute("add", 4, 4)
    ]);
    expect(results).toEqual([2, 4, 6, 8]);
    
    pool.close();
  });

  it("should handle waitAll", async () => {
    const pool = createWorker<TestWorker>(builder, 2);
    
    const p1 = pool.execute("add", 1, 1);
    const p2 = pool.execute("add", 2, 2);
    
    await pool.waitAll();
    
    expect(await p1).toBe(2);
    expect(await p2).toBe(4);
    
    pool.close();
  });

  it("should handle launchWorker", async () => {
    const pool = createWorker<TestWorker>(builder, 2);
    await pool.launchWorker();
    // After launchWorker, workers should be initialized
    const result = await pool.execute("add", 5, 5);
    expect(result).toBe(10);
    pool.close();
  });

  it("should handle waitReady", async () => {
    const pool = createWorker<TestWorker>(builder, 1);
    const p1 = pool.execute("add", 1, 1);
    await pool.waitReady();
    expect(await p1).toBe(2);
    pool.close();
  });
});
