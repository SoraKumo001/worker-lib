# worker-lib

## Overview

Library for easy use of web-worker

## Example

### Next.js

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

### How to use execute

Types are automatically given by TypeScript.

- basic form  
  `execute("function name",... parameter) : Promise<resultType>`

- For the add sample  
  `execute("add",number,number) : Promise<number>`  
  `execute("add2,string,string) : Promise<string>`
