import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/?(*.)test.ts"],
  moduleNameMapper: {
    "@demo/(.+)": [
      "<rootDir>/../../packages/$1",
      "<rootDir>/../../../packages/$1",
      "<rootDir>/../packages/$1/src",
      "<rootDir>/packages/$1/src",
    ],
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
      },
    ],
  },
};

export default config;
