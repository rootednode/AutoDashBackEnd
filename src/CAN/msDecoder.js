import { DATA_MAP } from "../dataKeys.js";
import { computeFuelGPH } from "../fuelFlow.js";
import { vehicleTimeMs } from "./canTime.js";



const lastValues = {};

let lastVssTime = null;
let currentCanTime = null;

import fs from "fs";
const HISTORY_FILE = "./data/history.json";
const HISTORY_SAVE_MS = 60_000;
let lastHistorySaveTime = Date.now();
let historySaveInFlight = false;

let historical = {
  totalMiles: 0,
  totalGallons: 0
};

// Load saved file if exists
try {
  if (fs.existsSync(HISTORY_FILE)) {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    historical.totalMiles = data.totalMiles || 0;
    historical.totalGallons = data.totalGallons || 0;
  }
} catch(e) {
  console.error("History load error:", e);
}



let averageMPG = 0;
let histMPG = 0;

let tripMiles = 0;
let tripGallons = 0;

let lastValidMpg = 0;

// SAFE helper for reading signed 16-bit values
function readS16(data, offset) {
  return data.readInt16BE(offset);
}

// SAFE helper for reading unsigned 16-bit values
function readU16(data, offset) {
  return data.readUInt16BE(offset);
}

const MS_CAN_MAP = {

  // -------------------------------------------------------
  // 0x5F0 : PW1, PW2, RPM
  // -------------------------------------------------------
  0x5F0: (data) => {
    const rawPw = readS16(data, 2);
    const rawRpm = readS16(data, 6);

    const pw1 = (rawPw > 0 && rawPw < 15000) ? rawPw / 1000 : 0;
		//const pw1 = (rawPw > 0 && rawPw < 15000) ? (rawPw * 0.064) : 0;

    const rpm = (rawRpm > 0 && rawRpm < 9000) ? rawRpm : 0;

    return [
      { id: DATA_MAP.PW1, data: pw1 },
      { id: DATA_MAP.RPM, data: rpm },
      { id: DATA_MAP.COM, data: 0 },
    ];
  },

  // -------------------------------------------------------
  // 0x5F1 : Advance, Engine state
  // -------------------------------------------------------
  0x5F1: (data) => {
    const rawAdv = readS16(data, 0);
    const adv = (rawAdv > 0 && rawAdv < 12000) ? rawAdv / 10 : 0;

    //const engine = readS16(data, 3);
		const engine = data.readUInt8(3);


    return [
      { id: DATA_MAP.ADV, data: adv },
      { id: DATA_MAP.ENGINE, data: engine },
    ];
  },

  // -------------------------------------------------------
  // 0x5F2 : MAP, MAT, CLT
  // -------------------------------------------------------
  0x5F2: (data) => {
    const rawMap = readS16(data, 2);
    const rawMat = readS16(data, 4);
    const rawClt = readS16(data, 6);

    const map = (rawMap > 0 && rawMap < 10000) ? rawMap / 10 : 0;
    const mat = (rawMat > 0 && rawMat < 10000) ? rawMat / 10 : 0;
    const clt = (rawClt > 0 && rawClt < 10000) ? Math.floor(rawClt / 10) : 0;

    return [
      { id: DATA_MAP.MAP, data: map },
      { id: DATA_MAP.CTS, data: clt },
      { id: DATA_MAP.MAT, data: mat },
    ];
  },

  // -------------------------------------------------------
  // 0x5F3 : TPS, Battery Voltage
  // -------------------------------------------------------
  0x5F3: (data) => {
    const rawTps = readS16(data, 0);
    const rawVolt = readS16(data, 2);

    const tps = (rawTps > 0 && rawTps < 10000) ? rawTps / 10 : 0;
    const volt = (rawVolt > 0 && rawVolt < 10000) ? rawVolt / 10 : 0;

    return [
      { id: DATA_MAP.TPS, data: tps },
      { id: DATA_MAP.VOLT, data: volt },
    ];
  },

  // -------------------------------------------------------
  // 0x5F4 : EGO
  // -------------------------------------------------------
  0x5F4: (data) => {
    const egoraw = readU16(data, 2);
    const ego = egoraw / 10;
    return [{ id: DATA_MAP.EGO, data: ego }];
  },

  // -------------------------------------------------------
  // 0x5F5 : TPS acceleration enrichment
  // -------------------------------------------------------
  0x5F5: (data) => {
    // This ECU firmware broadcasts the correction channels as whole percent.
    // Dividing here made a raw 99 appear as 9.9% on the dashboard.
    const aeAmount = readS16(data, 2);
    return [{ id: DATA_MAP.AE_AMOUNT, data: aeAmount }];
  },

  // -------------------------------------------------------
  // 0x5F6 : Idle stepper position / PWM idle raw value
  // -------------------------------------------------------
  0x5F6: (data) => {
    const idlePosition = readU16(data, 6);
    return [{ id: DATA_MAP.IDLE_POSITION, data: idlePosition }];
  },

  // -------------------------------------------------------
  // 0x5F7 : TPS rate of change
  // -------------------------------------------------------
  0x5F7: (data) => {
    const tpsDot = readS16(data, 2) / 10;
    return [{ id: DATA_MAP.TPS_DOT, data: tpsDot }];
  },

  // -------------------------------------------------------
  // 0x5FA : STATUS1–8 bitfields
  // -------------------------------------------------------
  0x5FA: (data) => {
    return [
      { id: DATA_MAP.STATUS1, data: data.readUInt8(0) },
      { id: DATA_MAP.STATUS2, data: data.readUInt8(1) },
      { id: DATA_MAP.STATUS3, data: data.readUInt8(2) },
      { id: DATA_MAP.STATUS4, data: data.readUInt8(3) },
      { id: DATA_MAP.STATUS5, data: data.readUInt16BE(4) },
      { id: DATA_MAP.STATUS6, data: data.readUInt8(6) },
      { id: DATA_MAP.STATUS7, data: data.readUInt8(7) },
    ];
  },

  // -------------------------------------------------------
  // 0x5FD : Generic Sensors 1–4
  // -------------------------------------------------------
  0x5FD: (data) => {
    const decodeSensor = (offset) => {
      const raw = readS16(data, offset);
      return (raw > 0 && raw < 10000) ? Math.floor(raw / 10) : 0;
    };

    return [
      { id: DATA_MAP.SENSOR1, data: decodeSensor(0) },
      { id: DATA_MAP.SENSOR2, data: decodeSensor(2) },
      { id: DATA_MAP.SENSOR3, data: decodeSensor(4) },
      { id: DATA_MAP.SENSOR4, data: decodeSensor(6) },
    ];
  },

  // -------------------------------------------------------
  // 0x60D : EAE fuel correction channel 1
  // -------------------------------------------------------
  0x60D: (data) => {
    const eae1 = readS16(data, 0);
    return [{ id: DATA_MAP.EAE1, data: eae1 }];
  },

  // -------------------------------------------------------
  // 0x60F : AFR
  // -------------------------------------------------------
  0x60F: (data) => {
    const raw = data.readUInt8(0);
    const afr = (raw > 0 && raw < 255) ? raw : 0;
    return [{ id: DATA_MAP.AFR, data: afr }];
  },


0x61A: (data) => {
  const rawSpeed = readS16(data, 0);
  const mps = (rawSpeed > 0 && rawSpeed < 10000) ? rawSpeed / 10 : 0;
  const mph = mps * 2.23694;

  const fuelPsi = lastValues[DATA_MAP.SENSOR2.id] || 0;

  // ---- time delta ----
  const now = currentCanTime;
  let dtSeconds = lastVssTime === null ? 0 : (now - lastVssTime) / 1000;
  lastVssTime = now;

  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > 1) {
    dtSeconds = 0;
  }

  // ---- distance ----
  const milesThisFrame = (mph / 3600) * dtSeconds;

  historical.totalMiles += milesThisFrame;
  tripMiles += milesThisFrame;

  // ---- inputs ----
  const pw1 = lastValues[DATA_MAP.PW1.id] || 0;
  const rpm = lastValues[DATA_MAP.RPM.id] || 0;

	const mapKpa = lastValues[DATA_MAP.MAP.id] || 101.325;
	const volts = lastValues[DATA_MAP.VOLT.id] || 14.0;
	const gph = computeFuelGPH(pw1, rpm, fuelPsi, mapKpa, volts);

	// ---- instant MPG ----
	let currentMPG = 0;
	if (mph > 2 && gph > 0) {
		currentMPG = mph / gph;
		lastValidMpg = currentMPG;
	} else if (mph > 2) {
		currentMPG = lastValidMpg;
	}

	// ---- fuel integration ----
	if (gph > 0 && dtSeconds > 0) {
		const gallonsThisFrame = gph * (dtSeconds / 3600);
		historical.totalGallons += gallonsThisFrame;
		tripGallons += gallonsThisFrame;
	}

  // ---- averages ----
  if (tripMiles > 0 && tripGallons > 0) {
    averageMPG = tripMiles / tripGallons;
  }

  if (historical.totalMiles > 0 && historical.totalGallons > 0) {
    histMPG = historical.totalMiles / historical.totalGallons;
  }

  // ---- persist history without blocking CAN processing ----
  const historySaveNow = Date.now();
  if (
    process.env.TYPE !== "development" &&
    process.env.STARTUP_MODE !== "replay_logs" &&
    !historySaveInFlight &&
    historySaveNow - lastHistorySaveTime >= HISTORY_SAVE_MS
  ) {
    historySaveInFlight = true;
    lastHistorySaveTime = historySaveNow;
    const historySnapshot = JSON.stringify(historical, null, 2);

    fs.writeFile(HISTORY_FILE, historySnapshot, (error) => {
      historySaveInFlight = false;
      if (error) console.error("History save error:", error);
    });
  }

  return [
    { id: DATA_MAP.SPEEDO,         data: mph },
    { id: DATA_MAP.ODOMETER,       data: milesThisFrame },
    { id: DATA_MAP.CURRENT_MPG,    data: currentMPG },
    { id: DATA_MAP.AVERAGE_MPG,    data: averageMPG },
    { id: DATA_MAP.HISTORICAL_MPG, data: histMPG },
    ...(process.env.STARTUP_MODE === "replay_logs"
      ? [{ id: DATA_MAP.FUEL_GALLONS_USED, data: tripGallons }]
      : []),
  ];
},





};

// -------------------------------------------------------
// MAIN DECODER — 11-bit ID safe
// -------------------------------------------------------
const msDecoder = {
  do: (canMsg) => {
    currentCanTime = vehicleTimeMs(canMsg);
    const decodedId = canMsg.id & 0x7FF; // force 11-bit CAN ID

    const handler = MS_CAN_MAP[decodedId];
    if (!handler) return [];

    const buf = Buffer.from(canMsg.data);

    try {
      //return handler(buf) || [];
			const results = handler(buf) || [];
			for (const r of results) {
			  lastValues[r.id.id] = r.data;
			}
			return results;

    } catch (err) {
      console.error("msDecoder error for ID", decodedId.toString(16), err);
      return [];
    }
  },
};

export default msDecoder;
