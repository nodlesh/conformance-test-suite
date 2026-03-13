declare module 'ngrok' {
  interface NgrokOptions {
    addr: number | string;
    proto?: 'http' | 'tcp' | 'tls';
    authtoken?: string;
    region?: string;
    configPath?: string;
    [key: string]: any;
  }

  function connect(options: NgrokOptions): Promise<string>;
  function kill(): Promise<void>;
  function getUrl(): string;
  function getApi(): any;
  function disconnect(): Promise<void>;

  export = {
    connect,
    kill,
    getUrl,
    getApi,
    disconnect
  };
} 