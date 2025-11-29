import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { z } from "zod";

const REPO_ROOT = path.join(import.meta.dir, "..");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");
const STATIC_EXPORTS = ["./package.json"];

const ExportsJsonSchema = z.record(z.string(), z.string());
type ExportsJson = z.infer<typeof ExportsJsonSchema>;

interface PackageJson {
  name: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  [key: string]: unknown;
}

type SyncPackageExportsError =
  | SyncPackageExportsError_NoExportsJson
  | SyncPackageExportsError_SourceFileDoesNotExist
  | SyncPackageExportsError_ExportsJsonContainsParentDirectoryExports;

interface SyncPackageExportsError_NoExportsJson {
  type: "no-exports-json";
  cause: { type: string; cause: unknown };
}

interface SyncPackageExportsError_SourceFileDoesNotExist {
  type: "source-file-does-not-exist";
  sourcePath: string;
  cause: unknown;
}

interface SyncPackageExportsError_ExportsJsonContainsParentDirectoryExports {
  type: "exports-json-contains-parent-directory-exports";
  key: string;
}

async function validateSourceFile(
  packageDir: string,
  sourcePath: string
): Promise<Result<void, { type: "unknown-error"; cause: unknown }>> {
  return ResultAsync.fromThrowable(
    async () => {
      const absolutePath = path.join(packageDir, sourcePath);
      await access(absolutePath, constants.F_OK);
    },
    (cause) => ({ type: "unknown-error" as const, cause })
  )();
}

async function validateExportsJson({
  packageDir,
  exportsJson,
}: {
  packageDir: string;
  exportsJson: ExportsJson;
}): Promise<
  Result<
    void,
    | SyncPackageExportsError_ExportsJsonContainsParentDirectoryExports
    | SyncPackageExportsError_SourceFileDoesNotExist
  >
> {
  for (const [key, sourcePath] of Object.entries(exportsJson)) {
    if (key.startsWith("..")) {
      return err({
        type: "exports-json-contains-parent-directory-exports" as const,
        key,
      } satisfies SyncPackageExportsError_ExportsJsonContainsParentDirectoryExports);
    }

    const validateSourceFileResult = await validateSourceFile(
      packageDir,
      sourcePath
    );

    if (validateSourceFileResult.isErr()) {
      // console.log(`  ⚠ Skipping ${packageName}: ${sourcePath} does not exist`);
      return err({
        type: "source-file-does-not-exist" as const,
        sourcePath,
        cause: validateSourceFileResult.error,
      } satisfies SyncPackageExportsError_SourceFileDoesNotExist);
    }
  }

  return ok();
}

function sourceToDistPath(
  sourcePath: string,
  ext: "js" | "cjs" | "d.ts"
): string {
  const withoutSrc = sourcePath.replace(/^\.\/src\//, "./dist/");
  const withoutExt = withoutSrc.replace(/\.(ts|tsx|mts|cts)$/, "");
  return ext === "d.ts" ? `${withoutExt}.d.ts` : `${withoutExt}.${ext}`;
}

function normalizeExportsJson(exportsJson: ExportsJson) {
  return Object.entries(exportsJson).flatMap(([key, sourcePath]) => {
    const indexTrimmed = key.replace(/(^|\/)index$/, "");
    const leadingDotsTrimmed = indexTrimmed.replace(/^\.+/, "");
    const leadingSlashTrimmed = leadingDotsTrimmed.replace(/^\/+/, "");
    const normalized =
      leadingSlashTrimmed === "" ? "." : `./${leadingSlashTrimmed}`;

    return {
      key: normalized,
      entry: {
        development: sourcePath,
        types: sourceToDistPath(sourcePath, "d.ts"),
        import: sourceToDistPath(sourcePath, "js"),
        require: sourceToDistPath(sourcePath, "cjs"),
        default: sourceToDistPath(sourcePath, "js"),
      },
    };
  });
}

async function syncPackageExports({
  packageName,
}: {
  packageName: string;
}): Promise<Result<{ exportCount: number }, SyncPackageExportsError>> {
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const exportsJsonPath = path.join(packageDir, "exports.json");
  const packageJsonPath = path.join(packageDir, "package.json");

  // Check if exports.json exists
  const exportsJsonResult = await ResultAsync.fromThrowable(
    async () => {
      const content = await readFile(exportsJsonPath, "utf-8");
      return ExportsJsonSchema.parse(JSON.parse(content));
    },
    (cause) => ({ type: "unknown-error", cause })
  )();

  if (exportsJsonResult.isErr()) {
    // console.log(`  ⚠ Skipping ${packageName}: no exports.json found`);
    return err({
      type: "no-exports-json" as const,
      cause: exportsJsonResult.error,
    } satisfies SyncPackageExportsError_NoExportsJson);
  }

  const exportsJson = exportsJsonResult.value;

  const validateExportsJsonResult = await validateExportsJson({
    packageDir,
    exportsJson,
  });
  if (validateExportsJsonResult.isErr()) {
    return err(validateExportsJsonResult.error);
  }

  // Read existing package.json
  const packageJsonContent = await readFile(packageJsonPath, "utf-8");
  const packageJson: PackageJson = JSON.parse(packageJsonContent);

  const normalizedExports = normalizeExportsJson(exportsJson);

  packageJson.exports = Object.fromEntries([
    ...normalizedExports.map(
      ({ key, entry }) => [key, entry] satisfies [string, unknown]
    ),
    ...STATIC_EXPORTS.map(
      (staticExport) => [staticExport, staticExport] satisfies [string, unknown]
    ),
  ]);

  // Update main/module/types from the default export (".")
  const defaultExport = exportsJson["index"];
  if (defaultExport) {
    packageJson.main = sourceToDistPath(defaultExport, "js");
    packageJson.module = sourceToDistPath(defaultExport, "js");
    packageJson.types = sourceToDistPath(defaultExport, "d.ts");
  }

  // Write updated package.json
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

  const exportCount = Object.keys(exportsJson).length;
  // console.log(
  //   `  ✓ ${packageName}: ${exportCount} export${exportCount === 1 ? "" : "s"}`
  // );

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
        if (result.error.type === "no-exports-json") {
          console.log(`  ⚠ Skipping ${packageName}: no exports.json found`);
          continue;
        }
        if (result.error.type === "source-file-does-not-exist") {
          console.log(
            `  ⚠ Skipping ${packageName}: ${result.error.sourcePath} does not exist`
          );
          continue;
        }
        if (
          result.error.type === "exports-json-contains-parent-directory-exports"
        ) {
          console.log(
            `  ⚠ Skipping ${packageName}: ${result.error.key} contains parent directory exports`
          );
          continue;
        }

        throw new Error(`Unknown error: ${result.error satisfies never}`);
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
