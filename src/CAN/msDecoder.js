import { DATA_MAP } from "../dataKeys.js";
import { performance } from "perf_hooks";

const INJ_RATED_CC  = 360;
const INJ_RATED_PSI = 43.5;

const DEADTIME_CURVE = [
  [8.0,  1.467],
  [10.0, 1.070],
  [12.0, 0.846],
  [14.0, 0.694],
  [15.0, 0.643],
  [16.0, 0.595],
];

function computeFuelGPH(pw_ms, rpm, fuelRailPsi, mapKpa, volts) {
  if (!Number.isFinite(pw_ms) || !Number.isFinite(rpm) || rpm <= 0) {
    return 0;
  }

  const deadtimeMs = injectorDeadtimeMs(volts);
  const fuelPwMs = Math.max(0, pw_ms - deadtimeMs);

  if (fuelPwMs <= 0) return 0;

  const deltaPsi = injectorDeltaPsi(fuelRailPsi, mapKpa);
  const injectorCc = injectorFlowAtPressureCcMin(deltaPsi);

  const numInjectors = 4;
  const squirtsPerCycle = 2; // verify this matches your MS setup

  const duty = (fuelPwMs * rpm * squirtsPerCycle) / 120000;

  const ccMin = injectorCc * duty * numInjectors;
  const gph = (ccMin * 60) / 3785.41;

  return Number.isFinite(gph) && gph > 0 ? gph : 0;
}

function injectorFlowAtPressureCcMin(fuelPsi) {
  if (!Number.isFinite(fuelPsi) || fuelPsi < 20) return INJ_RATED_CC;
  const psi = Math.max(20, Math.min(80, fuelPsi));
  return INJ_RATED_CC * Math.sqrt(psi / INJ_RATED_PSI);
}



const lastValues = {};

let lastVssTime = performance.now();

let saveTick = 0;

import fs from "fs";
const HISTORY_FILE = "./data/history.json";

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

// running historical average
let mpgSum = 0;
let mpgCount = 0;
let historicalAvgMpg = 0;


function computeFuelCCPerMin(pw_ms, rpm) {
  const injectorCc = 360;
  const numInjectors = 4;
  const duty = (pw_ms * rpm) / 120000;
  if (duty < 1e-6) return 0;
  return injectorCc * duty * numInjectors;  // cc/min
}



function injectorDeadtimeMs(volts) {
  if (!Number.isFinite(volts)) return 0.694;

  if (volts <= DEADTIME_CURVE[0][0]) return DEADTIME_CURVE[0][1];

  for (let i = 0; i < DEADTIME_CURVE.length - 1; i++) {
    const [v1, dt1] = DEADTIME_CURVE[i];
    const [v2, dt2] = DEADTIME_CURVE[i + 1];

    if (volts >= v1 && volts <= v2) {
      const t = (volts - v1) / (v2 - v1);
      return dt1 + t * (dt2 - dt1);
    }
  }

  return DEADTIME_CURVE[DEADTIME_CURVE.length - 1][1];
}

function injectorDeltaPsi(fuelRailPsi, mapKpa) {
  if (!Number.isFinite(fuelRailPsi) || fuelRailPsi < 10) {
    return INJ_RATED_PSI;
  }

  // If fuel pressure sensor reads rail gauge pressure,
  // convert to injector differential pressure.
  const manifoldGaugePsi = (mapKpa - 101.325) * 0.145038;
  const deltaPsi = fuelRailPsi - manifoldGaugePsi;

  return Math.max(20, Math.min(80, deltaPsi));
}

function computeMPG(pw_ms, rpm, mph, fuelRailPsi, mapKpa, volts) {
  if (!Number.isFinite(pw_ms) || !Number.isFinite(rpm) || !Number.isFinite(mph)) {
    return lastValidMpg;
  }

  if (mph < 2) {
    lastValidMpg = 0;
    return 0;
  }

  const deadtimeMs = injectorDeadtimeMs(volts);
  const fuelPwMs = Math.max(0, pw_ms - deadtimeMs);

  const deltaPsi = injectorDeltaPsi(fuelRailPsi, mapKpa);
  const injectorCc = injectorFlowAtPressureCcMin(deltaPsi);

  const numInjectors = 4;
  const squirtsPerCycle = 2; // change this if your MS setup is not 2 squirts

  const duty = (fuelPwMs * rpm * squirtsPerCycle) / 120000;

  if (duty < 1e-6) return lastValidMpg;

  const ccMin = injectorCc * duty * numInjectors;
  const gph = (ccMin * 60) / 3785.41;

  if (gph < 1e-6) return lastValidMpg;

  const mpg = mph / gph;

  if (!Number.isFinite(mpg) || mpg <= 0) return lastValidMpg;

  lastValidMpg = mpg;
  return mpg;
}






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
  const now = performance.now();
  let dtSeconds = (now - lastVssTime) / 1000;
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

  // ---- instant MPG ----
//	const mapKpa = lastValues[DATA_MAP.MAP.id] || 101.325;
//	const volts = lastValues[DATA_MAP.VOLT.id] || 14.0;
//	const currentMPG = computeMPG(pw1, rpm, mph, fuelPsi, mapKpa, volts);

  // ---- fuel integration ----
	//const mapKpa = lastValues[DATA_MAP.MAP.id] || 101.325;
	//const volts = lastValues[DATA_MAP.VOLT.id] || 14.0;

//	const gph = computeFuelGPH(pw1, rpm, fuelPsi, mapKpa, volts);



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



//  if (mph > 1 && currentMPG > 0 && dtSeconds > 0) {
//    const gallonsPerHour = mph / currentMPG;
//    const gallonsThisFrame = gallonsPerHour * (dtSeconds / 3600);

//    historical.totalGallons += gallonsThisFrame;
//    tripGallons += gallonsThisFrame;
//  }

  // ---- averages ----
  if (tripMiles > 0 && tripGallons > 0) {
    averageMPG = tripMiles / tripGallons;
  }

  if (historical.totalMiles > 0 && historical.totalGallons > 0) {
    histMPG = historical.totalMiles / historical.totalGallons;
  }

  // ---- persist history ----
  saveTick++;
  if (saveTick >= 60) {
    saveTick = 0;
    try {
      if (process.env.TYPE !== "development") {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(historical, null, 2));
      }
    } catch (e) {
      console.error("History save error:", e);
    }
  }

  return [
    { id: DATA_MAP.SPEEDO,         data: mph },
    { id: DATA_MAP.ODOMETER,       data: milesThisFrame },
    { id: DATA_MAP.CURRENT_MPG,    data: currentMPG },
    { id: DATA_MAP.AVERAGE_MPG,    data: averageMPG },
    { id: DATA_MAP.HISTORICAL_MPG, data: histMPG },
  ];
},





};

// -------------------------------------------------------
// MAIN DECODER — 11-bit ID safe
// -------------------------------------------------------
const msDecoder = {
  do: (canMsg) => {
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

