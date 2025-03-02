# worker-lib

## Overview

Library for easy use of web-worker and worker_threads.

```ts
import {
  createWorker,
  initWorker,
  waitAll,
  waitReady,
  close,
} from "worker-lib"; //auto

import {
  createWorker,
  initWorker,
  waitAll,
  waitReady,
  close,
} from "worker-lib/node"; // Node.js worker_threads

import {
  createWorker,
  initWorker,
  waitAll,
  waitReady,
  close,
} from "worker-lib/web-worker"; // Web Worker
```

## Example

https://github.com/SoraKumo001/worker-lib-samples/

### Node.js (worker_threads)

- src/worker-test.ts

```ts
import { initWorker } from "worker-lib";

const add = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a + b;
};
const add2 = (a: string, b: string) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a + b;
};
const sub = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a - b;
};
const mul = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a * b;
};

const error = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  throw new Error("throw");
  return a + b;
};

// Initialization process to make it usable in Worker.
const map = initWorker({ add, add2, sub, mul, error });
// Export only the type
export type WorkerTest = typeof map;
```

- src/index.ts

```ts
import { Worker } from "node:worker_threads";
import { createWorker } from "worker-lib";
import type { WorkerTest } from "./worker-test";
import path from "node:path";

const { execute, close } = createWorker<WorkerTest>(
  () => new Worker(path.resolve(__dirname, "./worker-test.js")),
  4 // Maximum parallel number
);

const main = async () => {
  const a = 300;
  const b = 100;
  const p = [
    execute("add", a, b).then((result) => {
      console.log("add", result);
    }),
    execute("add2", a.toString(), b.toString()).then((result) => {
      console.log("add2", result);
    }),
    execute("sub", a, b).then((result) => {
      console.log("sub", result);
    }),
    execute("mul", a, b).then((result) => {
      console.log("sub", result);
    }),
    execute("error", a, b)
      .then((result) => {
        console.log("error", result);
      })
      .catch((e) => {
        console.error("error", e);
      }),
  ];
  console.log("Start");
  await Promise.all(p);
  close(); // Close the worker
};

main();
```

### Next.js (Web Worker)

- src/libs/worker-test.ts

```ts
import { initWorker } from "worker-lib";

const add = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a + b;
};
const add2 = (a: string, b: string) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a + b;
};
const sub = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a - b;
};
const mul = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  return a * b;
};

const error = (a: number, b: number) => {
  for (let i = 0; i < 1000000000; i++); //Overload unnecessarily
  throw new Error("throw");
  return a + b;
};

// Initialization process to make it usable in Worker.
const map = initWorker({ add, add2, sub, mul, error });
// Export only the type
export type WorkerTest = typeof map;
```

- src/app/page.tsx

```tsx
"use client";
import { useState } from "react";
import { createWorker } from "worker-lib";
import type { WorkerTest } from "../libs/worker-test";

// Create an instance to execute the Worker
// execute("function name",... parameter) to start the Worker
const execute = createWorker<WorkerTest>(
  () => new Worker(new URL("../libs/worker-test", import.meta.url)),
  5 // Maximum parallel number
);

const Page = () => {
  const [values, setValues] = useState<(number | string)[]>([]);
  const [a, setA] = useState(300);
  const [b, setB] = useState(100);

  return (
    <div>
      <form>
        <input
          name="a"
          value={a}
          onChange={(e) => setA(Number(e.currentTarget.value))}
        />
        <input
          name="b"
          value={b}
          onChange={(e) => setB(Number(e.currentTarget.value))}
        />
        <button
          type="button"
          onClick={async () => {
            const index = values.length;
            setValues([...values, "running"]);
            //Calling a Worker
            const result = await execute("add", a, b);
            setValues((values) =>
              values.map((v, i) => (i === index ? result : v))
            );
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={async () => {
            const index = values.length;
            setValues([...values, "running"]);
            //Calling a Worker
            const result = await execute("add2", String(a), String(b));
            setValues((values) =>
              values.map((v, i) => (i === index ? result : v))
            );
          }}
        >
          Add(String)
        </button>
        <button
          type="button"
          onClick={async () => {
            const index = values.length;
            setValues([...values, "running"]);
            //Calling a Worker
            const result = await execute("sub", a, b);
            setValues((values) =>
              values.map((v, i) => (i === index ? result : v))
            );
          }}
        >
          Sub
        </button>
        <button
          type="button"
          onClick={async () => {
            const index = values.length;
            setValues([...values, "running"]);
            //Calling a Worker
            const result = await execute("mul", a, b);
            setValues((values) =>
              values.map((v, i) => (i === index ? result : v))
            );
          }}
        >
          Mul
        </button>
        <button
          type="button"
          onClick={async () => {
            const index = values.length;
            setValues([...values, "running"]);
            //Calling a Worker
            const result = await execute("error", a, b).catch((e) => e);
            setValues((values) =>
              values.map((v, i) => (i === index ? result : v))
            );
          }}
        >
          Error
        </button>
      </form>
      {values.map((v, index) => (
        <div key={index}>{v}</div>
      ))}
    </div>
  );
};
export default Page;
```
