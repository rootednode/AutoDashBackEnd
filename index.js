import { initCan } from './src/IO/canStartup.js';
import app from './src/app.js';
import yaml from 'js-yaml';
import fs from 'fs';

//  https://nodejs.org/dist/latest-v14.x/docs/api/process.html#process_process
// env vars we will use
const CAN = initCan();
global.CAN = CAN;

// Optional: allow explicit override, but loud
const CAN_CHANNEL = process.env.CHANNEL || CAN.iface;

if (process.env.CHANNEL && process.env.CHANNEL !== CAN.iface) {
  console.warn(
    `[CAN] CHANNEL override (${process.env.CHANNEL}) differs from detected (${CAN.iface})`
  );
}

//const CAN_CHANNEL =  process.env.CHANNEL
const NODE_ENV = process.env.NODE_ENV

console.log('can channel:', CAN.iface);

try {
  const settings = yaml.load(fs.readFileSync('./settings.yaml', 'utf8'));
  const dashServer = app(CAN_CHANNEL, settings);

  // Development or Live (starts webserver if live)
  // const APP_TYPE = process.env.TYPE || dashServer.TYPES.DEVELOPMENT

  const stopAll = () => {
    dashServer.stop();
  }
  process.on('SIGTERM', stopAll)
  process.on('SIGINT', stopAll)
  dashServer.start();
} catch (e) {
  console.log(e);
}




