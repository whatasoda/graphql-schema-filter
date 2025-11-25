/**
 * ログレベル管理
 *
 * 環境変数 LOG_LEVEL でログレベルを制御
 * 指定可能な値: debug, info, warn, none
 * デフォルト: info
 */

type LogLevel = "debug" | "info" | "warn" | "none";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  none: 3,
};

class Logger {
  private level: LogLevel;

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    this.level = this.isValidLogLevel(envLevel) ? envLevel : "info";
  }

  private isValidLogLevel(level: string | undefined): level is LogLevel {
    return (
      level === "debug" ||
      level === "info" ||
      level === "warn" ||
      level === "none"
    );
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  debug(message: string): void {
    if (this.shouldLog("debug")) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  info(message: string): void {
    if (this.shouldLog("info")) {
      console.log(`[INFO] ${message}`);
    }
  }

  warn(message: string): void {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${message}`);
    }
  }
}

/**
 * シングルトンロガーインスタンス
 */
export const logger = new Logger();
