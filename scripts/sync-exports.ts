import { type RslibConfig } from "@rslib/core";
import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { err, ok, Result, ResultAsync } from "neverthrow";

const REPO_ROOT = path.join(import.meta.dir, "..");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");
const STATIC_EXPORTS = ["./package.json"];

interface PackageJson {
  name: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  [key: string]: unknown;
}

type SyncPackageExportsError = SyncPackageExportsError_FailedToLoadRslibConfig;

interface SyncPackageExportsError_FailedToLoadRslibConfig {
  type: "failed-to-load-rslib-config";
  cause: unknown;
}

async function readRslibConfig(
  packageDir: string
): Promise<Result<RslibConfig, { type: "unknown-error"; cause: unknown }>> {
  return await ResultAsync.fromThrowable(
    async () => {
      const rslibConfigPath = path.join(packageDir, "rslib.config.ts");
      await access(rslibConfigPath, constants.F_OK);
      const mod = (await import(rslibConfigPath)) as { default: RslibConfig };
      return mod.default;
    },
    (cause) => ({ type: "unknown-error" as const, cause })
  )();
}

function sourceToDistPath(
  sourcePath: string,
  ext: "js" | "cjs" | "d.ts"
): string {
  const withoutSrc = sourcePath.replace(/^\.\/src\//, "./dist/");
  const withoutExt = withoutSrc.replace(/\.(ts|tsx|mts|cts)$/, "");
  return ext === "d.ts" ? `${withoutExt}.d.ts` : `${withoutExt}.${ext}`;
}

function extractJavaScriptExports(rslibConfig: RslibConfig) {
  return Object.entries(rslibConfig.source?.entry ?? {}).flatMap(
    ([key, entry]) => {
      if (typeof entry !== "string") {
        console.warn(`  ⚠ Skipping ${key}: not a string entry`);
        return [];
      }

      const indexTrimmed = key.replace(/(^|\/)index$/, "");
      const leadingDotsTrimmed = indexTrimmed.replace(/^\.+/, "");
      const leadingSlashTrimmed = leadingDotsTrimmed.replace(/^\/+/, "");
      const normalized =
        leadingSlashTrimmed === "" ? "." : `./${leadingSlashTrimmed}`;

      return {
        key: normalized,
        entry: {
          development: entry,
          types: sourceToDistPath(entry, "d.ts"),
          import: sourceToDistPath(entry, "js"),
          require: sourceToDistPath(entry, "cjs"),
          default: sourceToDistPath(entry, "js"),
        },
      };
    }
  );
}

function extractAssetExports(rslibConfig: RslibConfig) {
  const copySettings = Array.isArray(rslibConfig.output?.copy)
    ? rslibConfig.output?.copy
    : [];

  return copySettings.flatMap((setting) => {
    if (typeof setting === "string") {
      return [];
    }

    if (!setting.from) {
      console.warn(`  ⚠ Skipping ${setting.from}: no \`from\` on copy setting`);
      return [];
    }

    if (setting.context !== "./src") {
      console.warn(
        `  ⚠ Skipping ${setting.from}: \`context\` must be \`./src\` on copy setting`
      );
      return [];
    }

    return {
      key: setting.from,
      entry: `./${path.join("./dist", setting.from)}`,
    };
  });
}

async function syncPackageExports({
  packageName,
}: {
  packageName: string;
}): Promise<Result<{ exportCount: number }, SyncPackageExportsError>> {
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const packageJsonPath = path.join(packageDir, "package.json");

  const rslibConfigResult = await readRslibConfig(packageDir);

  if (rslibConfigResult.isErr()) {
    return err({
      type: "failed-to-load-rslib-config" as const,
      cause: rslibConfigResult.error,
    } satisfies SyncPackageExportsError_FailedToLoadRslibConfig);
  }

  const rslibConfig = rslibConfigResult.value;

  // Read existing package.json
  const packageJsonContent = await readFile(packageJsonPath, "utf-8");
  const packageJson: PackageJson = JSON.parse(packageJsonContent);

  const javaScriptExports = Object.fromEntries(
    extractJavaScriptExports(rslibConfig).map(({ key, entry }) => [key, entry])
  );
  const assetExports = Object.fromEntries(
    extractAssetExports(rslibConfig).map(({ key, entry }) => [key, entry])
  );
  const staticExports = Object.fromEntries(
    STATIC_EXPORTS.map((staticExport) => [staticExport, staticExport])
  );

  packageJson.exports = {
    ...javaScriptExports,
    ...staticExports,
    ...assetExports,
  };

  const defaultExport = javaScriptExports["."];
  if (defaultExport) {
    packageJson.main = defaultExport.default;
    packageJson.module = defaultExport.default;
    packageJson.types = defaultExport.types;
  }

  // Write updated package.json
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

  const exportCount = Object.keys(packageJson.exports ?? {}).length;

  return ok({ exportCount });
}

async function main() {
  console.log("Syncing package exports...\n");

  const packages = await readdir(PACKAGES_DIR, { withFileTypes: true });
  const packageDirs = packages
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const packageName of packageDirs) {
    try {
      const result = await syncPackageExports({ packageName });
      if (result.isErr()) {
        if (result.error.type === "failed-to-load-rslib-config") {
          console.log(
            `  ⚠ Skipping ${packageName}: failed to load rslib config`
          );
          continue;
        }

        throw new Error(`Unknown error: ${result.error.type satisfies never}`);
      }
    } catch (error) {
      console.error(
        `  ✗ ${packageName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.log("\n✓ All packages synchronized");
}

main();
