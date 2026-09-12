export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  at: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

export class RunLogger {
  private entries: LogEntry[] = [];

  info(message: string, meta?: Record<string, unknown>): void {
    this.append("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.append("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.append("error", message, meta);
  }

  private append(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const prefix = level === "error" ? "[Agent] ERROR:" : "[Agent]";
    console.log(level === "error" ? `${prefix} ${message}` : `${prefix} ${message}`);
    const entry: LogEntry = {
      at: new Date().toISOString(),
      level,
      message,
    };
    if (meta && Object.keys(meta).length > 0) {
      entry.meta = meta;
    }
    this.entries.push(entry);
  }

  getLogs(): LogEntry[] {
    return [...this.entries];
  }

  toJSON(): { logs: LogEntry[] } {
    return { logs: this.getLogs() };
  }
}

export function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
