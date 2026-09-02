/// <reference types="vite/client" />

declare module '*?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

declare module '*?worker' {
  const workerConstructor: {
    new (options?: WorkerOptions): Worker;
  };
  export default workerConstructor;
}

declare module '*?url' {
  const url: string;
  export default url;
}
