import { writeFileSync } from "node:fs";
import path from "node:path";

const LOG_PATH = path.resolve(process.cwd(), "log.txt");

/** Create the log file at server startup. Each AI request overwrites it. */
export function initUsageLog() {
  if (process.env.VITEST) return;
  writeFileSync(
    LOG_PATH,
    `=== AI usage session ${new Date().toISOString()} ===\nWaiting for AI requests...\n`,
  );
}

/**
 * Log one AI request to stdout and overwrite log.txt with that request's
 * metrics. The file therefore always contains the most recent request.
 */
export function logUsageLine(payload: Record<string, unknown>) {
  const line = `[ai-usage] ${JSON.stringify(payload)}\n`;
  console.info("[ai-usage]", JSON.stringify(payload));
  if (process.env.VITEST) return;
  writeFileSync(LOG_PATH, line);
}
