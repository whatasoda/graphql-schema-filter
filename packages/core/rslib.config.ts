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
        bundle: false,
      },
    },
    {
      format: "cjs",
      output: {
        distPath: {
          root: "./dist",
        },
      },
      dts: false,
    },
  ],
  source: {
    entry: exports,
    exclude: ["**/*.test.ts"],
  },
  output: {
    target: "node",
    sourceMap: true,
  },
});
