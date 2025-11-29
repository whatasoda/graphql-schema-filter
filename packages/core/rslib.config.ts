import { defineConfig } from "@rslib/core";
import exports from "./exports.json";

export default defineConfig({
  lib: [
    {
      format: "esm",
      output: {
        distPath: {
          root: "./dist",
        },
      },
      dts: {
        bundle: true,
        autoExtension: true,
      },
    },
    {
      format: "cjs",
      output: {
        distPath: {
          root: "./dist",
        },
      },
      dts: {
        bundle: true,
        autoExtension: true,
      },
    },
  ],
  source: {
    entry: exports,
    tsconfigPath: "./tsconfig.build.json",
    exclude: ["**/*.test.ts"],
  },
  output: {
    target: "node",
    sourceMap: true,
  },
});
