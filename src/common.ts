export type WorkerType = { [key: string]: (...args: any) => any };

export type WorkerRecvEvent<T extends WorkerType> =
  | {
      type: "function";
      payload: { id: number; name: keyof T; args: unknown };
    }
  | {
      type: "callback_result";
      payload: { id: string | number; result: unknown };
    }
  | {
      type: "callback_call";
      payload: { id: number; callbackId: string; args: unknown; callId: string };
    };

export type WorkerSendEvent<T extends WorkerType> =
  | {
      type: "result";
      payload: { id: number; result: unknown };
    }
  | {
      type: "error";
      payload: { id: number; error: unknown };
    }
  | {
      type: "callback_call";
      payload: { id: number; callbackId: string; args: unknown; callId: string };
    }
  | {
      type: "callback_result";
      payload: { id: string | number; result: unknown };
    };

export const FUNCTION_PLACEHOLDER = "__worker_lib_function__";

export interface FunctionPlaceholder {
  [FUNCTION_PLACEHOLDER]: string;
}

export const isPlaceholder = (v: any): v is FunctionPlaceholder =>
  v && typeof v === "object" && FUNCTION_PLACEHOLDER in v;

export const isPlainObject = (v: any): boolean => {
  return (
    v &&
    typeof v === "object" &&
    Object.prototype.toString.call(v) === "[object Object]" &&
    !(v instanceof Uint8Array) &&
    !(v instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(v)
  );
};

export const getTransferables = (v: any, result: ArrayBuffer[] = []): ArrayBuffer[] => {
  if (v instanceof ArrayBuffer) {
    result.push(v);
  } else if (ArrayBuffer.isView(v)) {
    result.push(v.buffer as ArrayBuffer);
  } else if (Array.isArray(v)) {
    for (const item of v) getTransferables(item, result);
  } else if (v && typeof v === "object") {
    for (const key in v) getTransferables(v[key], result);
  }
  return result;
};

export const createRegistry = () => {
  const callbacks = new Map<string, Function>();
  const callbackProxies = new Map<string, Function>();

  const registerCallback = (requestId: number, fn: Function) => {
    const id = `${requestId}:${Math.random().toString(36).slice(2)}`;
    callbacks.set(id, fn);
    return id;
  };

  const clearCallbacks = (requestId: number) => {
    for (const key of callbacks.keys()) {
      if (key.startsWith(`${requestId}:`)) {
        callbacks.delete(key);
      }
    }
    for (const key of callbackProxies.keys()) {
      if (key.startsWith(`${requestId}:`)) {
        callbackProxies.delete(key);
      }
    }
  };

  const transformArgs = (requestId: number, args: any): any => {
    if (typeof args === "function") {
      return { [FUNCTION_PLACEHOLDER]: registerCallback(requestId, args) };
    }
    if (ArrayBuffer.isView(args) || args instanceof ArrayBuffer) {
      return args;
    }
    if (Array.isArray(args)) {
      return args.map((v) => transformArgs(requestId, v));
    }
    if (isPlainObject(args)) {
      const result: any = {};
      for (const key in args) {
        result[key] = transformArgs(requestId, args[key]);
      }
      return result;
    }
    return args;
  };

  const resolveArgs = (
    requestId: number,
    args: any,
    createProxy: (callbackId: string) => Function,
  ): any => {
    if (isPlaceholder(args)) {
      return createProxy(args[FUNCTION_PLACEHOLDER]);
    }
    if (Array.isArray(args)) {
      return args.map((v) => resolveArgs(requestId, v, createProxy));
    }
    if (isPlainObject(args)) {
      const result: any = {};
      for (const key in args) {
        result[key] = resolveArgs(requestId, args[key], createProxy);
      }
      return result;
    }
    return args;
  };

  return {
    callbacks,
    callbackProxies,
    registerCallback,
    clearCallbacks,
    transformArgs,
    resolveArgs,
  };
};

export interface UniversalWorker {
  postMessage(message: any, transfer?: any[]): void;
  addEventListener(type: string, listener: (data: any) => void): void;
  removeEventListener(type: string, listener: (data: any) => void): void;
  terminate(): void;
}
