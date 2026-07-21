import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { initCan, initVirtualCan } from './src/IO/canStartup.js';
import app from './src/app.js';

const replayMode = process.env.STARTUP_MODE === 'replay_logs';
const CAN = replayMode ? initVirtualCan() : initCan();
global.CAN = CAN;

const CAN_CHANNEL = replayMode ? 'vcan0' : (process.env.CHANNEL || CAN.iface);
if (!replayMode && process.env.CHANNEL && process.env.CHANNEL !== CAN.iface) {
  console.warn(
    `[CAN] CHANNEL override (${process.env.CHANNEL}) differs from detected (${CAN.iface})`
  );
}
console.log('can channel:', CAN_CHANNEL);

let replayProcess = null;
let stopping = false;

async function playLog(filename, speed) {
  return new Promise((resolve, reject) => {
    console.log(`[CAN-REPLAY] Playing ${path.basename(filename)} at ${speed}x`);
    replayProcess = spawn(
      path.join(process.cwd(), 'logs', 'replay-speed.sh'),
      [String(speed), filename, 'vcan0'],
      { stdio: 'inherit' }
    );
    replayProcess.once('error', reject);
    replayProcess.once('exit', (code, signal) => {
      replayProcess = null;
      if (stopping || signal) return resolve();
      if (code === 0) return resolve();
      reject(new Error(`Replay exited with status ${code}`));
    });
  });
}

async function replayAllLogs() {
  const requestedSpeed = Number(process.env.REPLAY_SPEED || 10);
  const speed = Number.isFinite(requestedSpeed) && requestedSpeed > 0
    ? requestedSpeed
    : 10;
  const logDirectory = path.join(process.cwd(), 'logs');
  const commandArguments = process.argv.slice(2);
  const logOptionIndex = commandArguments.indexOf('--log');
  const requestedLog = process.env.REPLAY_LOG ||
    (logOptionIndex >= 0 ? commandArguments[logOptionIndex + 1] : null) ||
    commandArguments.find((argument) => !argument.startsWith('-'));
  let files;

  if (requestedLog) {
    const requestedPath = path.isAbsolute(requestedLog)
      ? requestedLog
      : path.resolve(logDirectory, requestedLog);
    if (
      !requestedPath.endsWith('.log') ||
      !fs.existsSync(requestedPath) ||
      !fs.statSync(requestedPath).isFile()
    ) {
      throw new Error(`Replay log is not a readable .log file: ${requestedPath}`);
    }
    files = [requestedPath];
  } else {
    files = fs.readdirSync(logDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
      .map((entry) => path.join(logDirectory, entry.name))
      .sort()
      .reverse();
  }

  console.log(`[CAN-REPLAY] Replaying ${files.length} log(s) at ${speed}x`);
  for (const filename of files) {
    if (stopping) break;
    await playLog(filename, speed);
  }
  if (!stopping) console.log('[CAN-REPLAY] All logs complete; dashboard remains online');
}

try {
  const settings = yaml.load(fs.readFileSync('./settings.yaml', 'utf8'));
  const dashServer = app(CAN_CHANNEL, settings);

  const stopAll = () => {
    if (stopping) return;
    stopping = true;
    if (replayProcess) replayProcess.kill('SIGTERM');
    dashServer.stop();
  };
  process.on('SIGTERM', stopAll);
  process.on('SIGINT', stopAll);

  if (replayMode) {
    dashServer.onDashboardConnected(() => {
      console.log('[CAN-REPLAY] Dashboard connected; replay begins in 1 second');
      setTimeout(() => {
        replayAllLogs().catch((error) => console.error('[CAN-REPLAY]', error));
      }, 1000);
    });
  }

  dashServer.start();
  if (replayMode) {
    console.log('[CAN-REPLAY] Waiting for a dashboard WebSocket connection...');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
