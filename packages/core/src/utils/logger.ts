/**
 * Log level management
 *
 * Controls log level via LOG_LEVEL environment variable
 * Available values: debug, info, warn, none
 * Default: info
 */

type LogLevel = "debug" | "info" | "warn" | "none";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  none: 3,
};

const isValidLogLevel = (level: string): level is LogLevel => {
  return (
    level === "debug" ||
    level === "info" ||
    level === "warn" ||
    level === "none"
  );
};

const getDefaultLogLevel = (logLevelEnv: string | undefined) => {
  const envLevel = process.env[logLevelEnv ?? "LOG_LEVEL"]?.toLowerCase();
  return envLevel && isValidLogLevel(envLevel) ? envLevel : "info";
};

const createLogger = (
  config: { level?: LogLevel; logLevelEnv?: string } = {}
) => {
  const state: { level: LogLevel } = {
    level: config.level ?? getDefaultLogLevel(config.logLevelEnv),
  };

  const shouldLog = (level: LogLevel) => {
    return LOG_LEVELS[level] >= LOG_LEVELS[state.level];
  };

  return {
    setLogLevel: (level: LogLevel) => {
      if (isValidLogLevel(level)) {
        state.level = level;
      }
    },

    debug: (message: string) => {
      if (shouldLog("debug")) {
        console.log(`[DEBUG] ${message}`);
      }
    },
    info: (message: string) => {
      if (shouldLog("info")) {
        console.log(`[INFO] ${message}`);
      }
    },
    warn: (message: string) => {
      if (shouldLog("warn")) {
        console.warn(`[WARN] ${message}`);
      }
    },
  };
};

/**
 * Singleton logger instance
 */
export const logger = createLogger();
