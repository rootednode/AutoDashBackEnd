import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

let logStream = null;
let logPath = null;
let hasWritten = false;

// Create log file ONLY when first frame arrives
function openLogIfNeeded() {
  if (logStream) return;

  const startTime = new Date().toISOString().replace(/[:.]/g, '-');
  logPath = path.join(LOG_DIR, `can_${startTime}.log`);

  logStream = fs.createWriteStream(logPath, { flags: 'a' });
  console.log(`[CANLOG] Logging to ${logPath}`);
}

export function logCAN(msg) {
  try {
    const { ts_sec, ts_usec, id, data } = msg;

    // Don’t create file until first real frame
    openLogIfNeeded();

    const timestamp = `(${ts_sec}.${ts_usec.toString().padStart(6, '0')})`;
    const hex = Buffer.from(data).toString('hex').toUpperCase();
    const idHex = id.toString(16).toUpperCase();

    const line = `${timestamp} can0 ${idHex}#${hex}\n`;
    logStream.write(line);
    hasWritten = true;
  } catch (err) {
    console.error('[CANLOG] Error:', err);
  }
}

// Optional but HIGHLY recommended
export function closeCANLog() {
  if (!logStream) return;

  logStream.end(() => {
    if (!hasWritten && logPath) {
      fs.unlink(logPath, () => {});
    }
  });

  logStream = null;
  logPath = null;
  hasWritten = false;
}

