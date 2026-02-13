# worker-lib

[![](https://img.shields.io/npm/l/worker-lib)](https://www.npmjs.com/package/worker-lib)
[![](https://img.shields.io/npm/v/worker-lib)](https://www.npmjs.com/package/worker-lib)
[![](https://img.shields.io/npm/dw/worker-lib)](https://www.npmjs.com/package/worker-lib)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/SoraKumo001/worker-lib)

## Overview

`worker-lib` is a lightweight, type-safe library designed to make **Web Workers** (Browser) and **worker_threads** (Node.js) as easy to use as standard asynchronous functions.

## Features

- **🚀 Cross-Platform**: Supports both Browser and Node.js with a unified API.
- **🛡️ Type-Safe**: Full TypeScript support with automatic type inference for worker functions.
- **⚡ Parallelism**: Built-in worker pool management with configurable concurrency limits.
- **🔄 Callback Support**: Pass functions as arguments to workers for progress updates or event handling.
- **📦 Zero Config**: Minimal setup required to get started.

## Installation

```bash
npm install worker-lib
# or
pnpm add worker-lib
```

## Basic Usage

### 1. Define Worker (worker.ts)

Register your functions using `initWorker`.

```ts
import { initWorker } from "worker-lib";

const add = (a: number, b: number) => a + b;

const heavyTask = async (data: string, onProgress: (percent: number, status: string) => void) => {
  onProgress(10, "Starting...");
  // ... heavy computation ...
  onProgress(100, "Done");
  return `Processed: ${data}`;
};

const workerMap = initWorker({ add, heavyTask });
export type MyWorker = typeof workerMap;
```

### 2. Use Worker in Main Thread

#### Node.js (worker_threads)

```ts
import { Worker } from "node:worker_threads";
import { createWorker } from "worker-lib/node";
import type { MyWorker } from "./worker";
import path from "node:path";

const { execute, close } = createWorker<MyWorker>(
  () => new Worker(path.resolve(__dirname, "./worker.js")),
  4 // Max parallel workers
);

const result = await execute("add", 10, 20);
console.log(result); // 30
```

#### Browser / Next.js (Web Worker)

```ts
import { createWorker } from "worker-lib";
import type { MyWorker } from "./worker";

const { execute } = createWorker<MyWorker>(
  () => new Worker(new URL("./worker.ts", import.meta.url)),
  5
);

const result = await execute("heavyTask", "input-data", (percent, status) => {
  console.log(`[${status}] ${percent}%`);
});
```

## API Reference

### `initWorker(workerProcess)`
Initializes the worker side.
- `workerProcess`: An object containing the functions to be exposed.

### `createWorker(builder, limit?)`
Creates a worker pool.
- `builder`: A function that returns a new `Worker` instance.
- `limit`: (Optional) Maximum number of concurrent workers. Default is `4`.

### `execute(name, ...args)`
Executes a worker function.
- `name`: The name of the function to execute.
- `args`: Arguments to pass to the function (supports callbacks).

### `waitAll()`
Returns a promise that resolves when all currently running tasks are complete.

### `close()`
Terminates all workers in the pool.

## Examples

For more detailed examples, check the [samples repository](https://github.com/SoraKumo001/worker-lib-samples/).
