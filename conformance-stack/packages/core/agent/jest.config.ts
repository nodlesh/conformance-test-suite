import type { Config } from "@jest/types";

import base from "../../../jest.config.base";

const config: Config.InitialOptions = {
  ...base,
  setupFilesAfterEnv: ["./tests/setup.ts"],
};

export default config;
