export type AgentConfig = {
  name: string;
  label: string;
  port: number;
  config: {
    label: string;
    walletConfig: {
      id: string;
      key: string;
    };
    autoUpdateStorageOnStartup: boolean;
  };
  mediatorURL: string;
  domain?: string;
  endpoints?: string[];
};

export const createAgentConfig = (
  name: string,
  port: number,
  id: string,
  domain?: string,
  endpoints?: string[]
) => ({
  name,
  label: `${name} Label`,
  port,
  config: {
    label: name,
    walletConfig: {
      id,
      key: `${id}key`,
    },
    autoUpdateStorageOnStartup: true,
  },
  mediatorURL: "",
  domain: domain,
  endpoints: endpoints ? endpoints : [`http://localhost:${port}`],
});
