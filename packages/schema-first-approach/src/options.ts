import { fg } from "./libs/fast-glob";

export type LogLevel = "debug" | "info" | "warn" | "none";

export interface SchemaFilterOptions {
  /**
   * Patterns to match schema documents
   */
  patterns: fg.Pattern[];

  /**
   * Options for fast-glob
   */
  globOptions?: fg.Options;
}

export const validateSchemaFilterOptions = (
  options: SchemaFilterOptions
): void => {
  if (!options.patterns || !Array.isArray(options.patterns)) {
    throw new Error("patterns must be a non-empty array");
  }
};
