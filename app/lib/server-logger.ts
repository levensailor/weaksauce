import fs from "node:fs";
import path from "node:path";

const SERVICE_NAME =
  process.env.WEAKSAUCE_SERVICE_NAME ?? "weaksauce-studio-dsp-api";
const MAX_LOG_BYTES = Number(process.env.WEAKSAUCE_LOG_MAX_BYTES ?? 1_048_576);
const MAX_LOG_BACKUPS = Number(process.env.WEAKSAUCE_LOG_BACKUP_COUNT ?? 3);

export function getEstTimestamp(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  return formatter.format(new Date());
}

export function writeRotatedEstLog(
  functionName: string,
  lineNumber: number,
  message: string
): void {
  const line = `${getEstTimestamp()} [INFO] ${SERVICE_NAME}:${functionName}:${lineNumber} - ${message}\n`;
  process.stdout.write(line);

  try {
    const logDir = path.join(process.cwd(), "logs");
    const logFile = path.join(logDir, "weaksauce.log");
    if (!fs.existsSync(/*turbopackIgnore: true*/ logDir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ logDir, { recursive: true });
    }
    if (fs.existsSync(/*turbopackIgnore: true*/ logFile)) {
      const stats = fs.statSync(/*turbopackIgnore: true*/ logFile);
      if (stats.size + Buffer.byteLength(line, "utf-8") > MAX_LOG_BYTES) {
        for (let i = MAX_LOG_BACKUPS - 1; i >= 1; i--) {
          const src = `${logFile}.${i}`;
          const dst = `${logFile}.${i + 1}`;
          if (fs.existsSync(/*turbopackIgnore: true*/ src)) {
            fs.renameSync(/*turbopackIgnore: true*/ src, /*turbopackIgnore: true*/ dst);
          }
        }
        fs.renameSync(/*turbopackIgnore: true*/ logFile, /*turbopackIgnore: true*/ `${logFile}.1`);
      }
    }
    fs.appendFileSync(/*turbopackIgnore: true*/ logFile, line, { encoding: "utf-8" });
  } catch {
    // Ephemeral/read-only filesystem fallback remains stdout
  }
}
