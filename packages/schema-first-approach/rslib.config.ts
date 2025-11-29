import { defineConfig, type RslibConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      format: "esm",
      output: {
        distPath: {
          root: "./dist",
        },
        externals: [/^@graphql-schema-filter\/.+$/],
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
        externals: [/^@graphql-schema-filter\/.+$/],
      },
      dts: {
        bundle: true,
        autoExtension: true,
      },
    },
  ],
  source: {
    entry: {
      index: "./src/index.ts",
    },
    tsconfigPath: "./tsconfig.build.json",
  },
  output: {
    target: "node",
    sourceMap: true,
    copy: [],
  },
});
