import { defineConfig } from "@rslib/core";

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
    entry: {
      index: "./src/index.ts",
    },
  },
  output: {
    target: "node",
    sourceMap: true,
  },
});
