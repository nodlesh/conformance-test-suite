import { Configuration, RegistryApi, LookupsApi } from "../../gen/api-client";

const configuration = new Configuration({
  basePath: process.env.API_BASE_PATH,
});

export type Client = {
  configuration: Configuration;
  registryAPI: RegistryApi;
  lookupAPI: LookupsApi;
};

export class TRQPClient implements Client {
  configuration: Configuration;
  registryAPI: RegistryApi;
  lookupAPI: LookupsApi;

  constructor(configuration: Configuration) {
    this.configuration = configuration;
    this.registryAPI = new RegistryApi(configuration);
    this.lookupAPI = new LookupsApi(configuration);
  }
}

export const client: Client = {
  configuration,
  registryAPI: new RegistryApi(configuration),
  lookupAPI: new LookupsApi(configuration),
};
