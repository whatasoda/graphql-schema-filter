import { FormatSchemaOptions } from "./format-schema";

export type LogLevel = "debug" | "info" | "warn" | "none";
/**
 * Schema filtering options
 */

export interface FilterSchemaOptions {
  /**
   * Target identifier
   */
  target: string;

  /**
   * Log level
   *
   * @default "none"
   */
  logLevel?: LogLevel;

  formatOptions?: FormatSchemaOptions;
}

export const isValidLogLevel = (level: string): level is LogLevel => {
  return (
    level === "debug" ||
    level === "info" ||
    level === "warn" ||
    level === "none"
  );
};

export const validateFilterSchemaOptions = (
  options: FilterSchemaOptions
): void => {
  if (!options.target || typeof options.target !== "string") {
    throw new Error("target must be a non-empty string");
  }
  if (options.logLevel && !isValidLogLevel(options.logLevel)) {
    throw new Error("logLevel must be a valid log level");
  }
};
