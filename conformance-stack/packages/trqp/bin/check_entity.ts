import { TRQPClient, Configuration } from "../src/client";

const client = new TRQPClient(
  new Configuration({ basePath: "https://dev.gan.technology/tr" })
);
client.registryAPI
  .entitiesEntityVIDAuthorizationGet("did:web:samplenetwork.foundation")
  .then((resp) => {
    console.log(resp.data);
  });
