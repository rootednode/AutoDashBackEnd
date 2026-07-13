import i2c from "i2c-bus";
import fs from "fs";
import { DATA_MAP } from "./dataKeys.js";
import { computeFuelGPH } from "./fuelFlow.js";

const ADS1115_ADDR = 0x48;
const bus = i2c.openSync(1);

const DEBUG_FUEL = true;
//const dbg = (...args) => DEBUG_FUEL && console.log("[FUEL]", ...args);
const dbg = (...args) => DEBUG_FUEL;

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CAL_FILE   = "./data/fuelCal.json";
const USED_FILE  = "./data/fuelUsed.json";
const PCT_FILE   = "./data/fuelPct.json";

const SAMPLE_MS = 100;
const FUEL_PCT_SAVE_MIN_MS = 10_000;
const FUEL_PCT_SAVE_MAX_MS = 30_000;
const FUEL_PCT_SAVE_DELTA = 0.5;

// Refuel detection
const REFUEL_MIN_PCT  = 20;
const REFUEL_CONFIRM_SAMPLES = 50;   // 50 samples @ 100ms = 5 seconds
const REFUEL_DELTA_PCT = 15;
const STOPPED_SPEED_MPH = 3;
const MAX_LEARN_STEP = 500;

let stoppedBaselinePct = null;

// Sender
const RAW_DISCONNECTED_THRESHOLD = 50;
const FUEL_INVALID = -1;

// Smoother
const window = [];
const N = 15;

let testFuelPct = 20;          // start low
let testRefillActive = true;
let testRefillStart = 0;

// ADS1115
const CONFIG_OS = 0x8000;
const CONFIG_MODE_SINGLE = 0x0100;
const CONFIG_DR_860SPS = 0x00E0;
const CONFIG_COMP_DISABLE = 0x0003;
const CONFIG_PGA_4096 = 0x0200;
const MUX = [0x4000, 0x5000, 0x6000, 0x7000];

function smoothMA(raw) {
  window.push(raw);
  if (window.length > N) window.shift();
  return window.reduce((a, b) => a + b, 0) / window.length;
}

function saveCalibration() {
  if (global.CAN?.iface === "vcan0") return;
  if (process.env.TYPE === "development") return;

  fs.writeFileSync(
    CAL_FILE,
    JSON.stringify({
      _comment: "rawMin = full tank, rawMax = empty tank",
      rawMin,
      rawMax
    }, null, 2)
  );
}


function learnRawMinFull(raw) {
  if (!Number.isFinite(raw)) return;

  // rawMin is full. Lower raw = more full.
  // Do not learn disconnected/glitch values.
  if (raw < RAW_DISCONNECTED_THRESHOLD) return;

  // Limit how much it can learn at once so one ADC glitch
  // does not wreck your calibration.
  if (raw < rawMin) {
    const learnedRawMin = Math.max(raw, rawMin - MAX_LEARN_STEP);
    dbg("Learning new rawMin/full tank value", {
      oldRawMin: rawMin,
      observedRaw: raw,
      newRawMin: learnedRawMin
    });

    rawMin = Math.floor(learnedRawMin);
    saveCalibration();
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function safeAdd(acc, delta) {
  if (!Number.isFinite(delta) || delta <= 0) return acc;
  return acc + delta;
}

function getTestFuelPercent(now) {
  if (!testRefillActive) return testFuelPct;

  const elapsed = now - testRefillStart;
  const duration = 60_000; // 1 minute
  const startPct = 15;
  const endPct   = 80;     // +65% refill

  const t = Math.min(1, elapsed / duration);
  testFuelPct = startPct + (endPct - startPct) * t;

  if (t >= 1) {
    testRefillActive = false;
  }

  return testFuelPct;
}

// ─────────────────────────────────────────────
// CALIBRATION
// ─────────────────────────────────────────────
function loadCalibration() {
  try {
    const d = JSON.parse(fs.readFileSync(CAL_FILE, "utf8"));
    if (typeof d.rawMin === "number" && typeof d.rawMax === "number") {
      return d;
    }
  } catch {}

  const cal = { rawMin: 200, rawMax: 13500 };

  if (global.CAN?.iface === "vcan0") return cal;
  if (process.env.TYPE === "development") return cal;

  fs.writeFileSync(CAL_FILE, JSON.stringify(cal));

  return cal;
}

let { rawMin, rawMax } = loadCalibration();
dbg("Calibration", { rawMin, rawMax });

// ─────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────
function loadUsed() {
  try {
    return JSON.parse(fs.readFileSync(USED_FILE, "utf8")).used || 0;
  } catch {
    return 0;
  }
}

function saveUsed(val) {
  if (global.CAN?.iface === "vcan0") return;
  if (process.env.TYPE === "development") return;

  dbg("saveUsed called", {
    val,
    TYPE: process.env.TYPE,
    iface: global.CAN?.iface,
    file: USED_FILE,
    cwd: process.cwd()
  });

  fs.writeFileSync(USED_FILE, JSON.stringify({ used: val }));
}

function loadFuelPct() {
  try {
    return JSON.parse(fs.readFileSync(PCT_FILE, "utf8")).pct;
  } catch {
    return null;
  }
}

function saveFuelPct(pct) {
  if (global.CAN?.iface === "vcan0") return;
  if (process.env.TYPE === "development") return;

  fs.writeFileSync(PCT_FILE, JSON.stringify({ pct }));
}

let lastSavedGallons = 0;
let lastSaveTime = Date.now();

function maybeSaveUsed(val) {
  const now = Date.now();

  if (Math.abs(val - lastSavedGallons) > 0.01 || now - lastSaveTime > 5000) {
    saveUsed(val);
    lastSavedGallons = val;
    lastSaveTime = now;
  }
}

// ─────────────────────────────────────────────
// ADS1115
// ─────────────────────────────────────────────
async function readAds1115Raw(channel = 0) {
  const config =
    CONFIG_OS |
    MUX[channel] |
    CONFIG_PGA_4096 |
    CONFIG_MODE_SINGLE |
    CONFIG_DR_860SPS |
    CONFIG_COMP_DISABLE;

  bus.i2cWriteSync(
    ADS1115_ADDR,
    3,
    Buffer.from([0x01, (config >> 8) & 0xff, config & 0xff])
  );

  // Allow the ADS1115 conversion to complete without blocking CAN and
  // WebSocket processing on Node's event loop.
  await new Promise((resolve) => setTimeout(resolve, 2));

  const out = Buffer.alloc(2);
  bus.readI2cBlockSync(ADS1115_ADDR, 0x00, 2, out);

  return out.readInt16BE(0); // SIGNED — critical
}

// ─────────────────────────────────────────────
// RAW → PERCENT
// ─────────────────────────────────────────────
function rawToPercent(raw) {
  if (!Number.isFinite(raw)) return null;
  if (rawMax === rawMin) return null;

  const pct = (rawMax - raw) / (rawMax - rawMin);
  return Math.max(0, Math.min(1, pct)) * 100;
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let lastFuelPct = loadFuelPct();
let lastPersistedFuelPct = lastFuelPct;
let lastFuelPctSaveTime = Date.now();
let refuelCount = 0;
let refuelLocked = false;

let gallonsSinceRefuel = loadUsed();
let tripGallonsUsed = 0;

let lastTime = Date.now();

function saveFuelPctNow(pct) {
  saveFuelPct(pct);
  lastPersistedFuelPct = pct;
  lastFuelPctSaveTime = Date.now();
}

function maybeSaveFuelPct(pct) {
  const now = Date.now();
  const elapsed = now - lastFuelPctSaveTime;
  if (elapsed < FUEL_PCT_SAVE_MIN_MS) return;

  const changedEnough =
    lastPersistedFuelPct === null ||
    Math.abs(pct - lastPersistedFuelPct) >= FUEL_PCT_SAVE_DELTA;

  if (changedEnough || elapsed >= FUEL_PCT_SAVE_MAX_MS) {
    saveFuelPctNow(pct);
  }
}

// ─────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────
export default function fuelLevelUpdater(ecuDataStore, markFresh) {
  ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, gallonsSinceRefuel);
  ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, tripGallonsUsed);

  if (process.env.TYPE === "development" && testRefillStart === 0) {
    testRefillStart = Date.now();
    testRefillActive = true;
    dbg("🧪 Starting fake refill ramp");
  }

  if (global.CAN?.iface === "vcan0" && testRefillStart === 0) {
    testRefillStart = Date.now();
    testRefillActive = true;
    dbg("🧪 Starting fake refill ramp");
  }

  const interval = setInterval(async () => {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (dt <= 0 || dt > 0.5) return;

    // ────────── FUEL USED (PW + RPM) ──────────
    const pwMs = ecuDataStore.read(DATA_MAP.PW1) || 0;
    const rpm  = ecuDataStore.read(DATA_MAP.RPM) || 0;

    if (pwMs > 0.5 && rpm > 500) {
      const fuelPsi = ecuDataStore.read(DATA_MAP.SENSOR2);
      const mapKpa = ecuDataStore.read(DATA_MAP.MAP) || 101.325;
      const volts = ecuDataStore.read(DATA_MAP.VOLT) || 14.0;
      const gallonsPerHour = computeFuelGPH(
        pwMs,
        rpm,
        fuelPsi,
        mapKpa,
        volts
      );
      const delta = gallonsPerHour * (dt / 3600);

      gallonsSinceRefuel = safeAdd(gallonsSinceRefuel, delta);
      tripGallonsUsed    = safeAdd(tripGallonsUsed, delta);

      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, gallonsSinceRefuel);
      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, tripGallonsUsed);

      maybeSaveUsed(gallonsSinceRefuel);
    }

    // ────────── FUEL SENDER ──────────
    let raw;

    if (process.env.TYPE === "development") {
      const pct = getTestFuelPercent(now);

      // convert percent → fake raw value
      raw = rawMax - (pct / 100) * (rawMax - rawMin);
    } else {
      try {
        raw = await readAds1115Raw(0);
      } catch {}
    }

    raw = smoothMA(raw);

    const senderConnected =
      Number.isFinite(raw) &&
      raw >= RAW_DISCONNECTED_THRESHOLD;

    ecuDataStore.write(
      DATA_MAP.FUEL_SENDER_CONNECTED,
      senderConnected ? 1 : 0
    );

    if (!senderConnected) {
      lastFuelPct = null;
      stoppedBaselinePct = null;
      refuelCount = 0;
      ecuDataStore.write(DATA_MAP.FUEL_LEVEL, FUEL_INVALID);
      return;
    }

    const percent = rawToPercent(
      Math.max(rawMin, Math.min(raw, rawMax))
    );

    if (percent === null) {
      ecuDataStore.write(DATA_MAP.FUEL_SENDER_CONNECTED, 0);
      stoppedBaselinePct = null;
      refuelCount = 0;
      ecuDataStore.write(DATA_MAP.FUEL_LEVEL, FUEL_INVALID);
      return;
    }

    const speed = ecuDataStore.read(DATA_MAP.SPEEDO) || 0;
    const stopped = speed < STOPPED_SPEED_MPH;

    if (stopped) {
      if (stoppedBaselinePct === null) {
        // On startup, compare against the last persisted fuel percentage so a
        // real key-off refill is detected, but still require sustained samples.
        stoppedBaselinePct = lastFuelPct ?? percent;
      }

      const delta = percent - stoppedBaselinePct;

      dbg("REFUEL chk", {
        percent,
        stoppedBaselinePct,
        delta,
        refuelCount,
        refuelLocked
      });

      if (
        !refuelLocked &&
        delta >= REFUEL_DELTA_PCT &&
        percent > REFUEL_MIN_PCT
      ) {
        refuelCount++;
      } else {
        refuelCount = Math.max(0, refuelCount - 1);
      }
    } else {
      stoppedBaselinePct = null;
      refuelCount = 0;
      refuelLocked = false;
    }

    if (refuelCount >= REFUEL_CONFIRM_SAMPLES) {
      gallonsSinceRefuel = 0;
      tripGallonsUsed    = 0;
      lastSavedGallons   = 0;
      refuelLocked = true;

      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, 0);
      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, 0);

      saveUsed(0);

		  learnRawMinFull(raw);

      dbg("⛽ Refuel detected — counters reset");

      refuelCount = 0;
      stoppedBaselinePct = percent;
      saveFuelPctNow(percent);
    } else if (stopped) {
      maybeSaveFuelPct(percent);
    }

		if (refuelLocked && stopped) {
		  learnRawMinFull(raw);
		}

    lastFuelPct = percent;

    ecuDataStore.write(DATA_MAP.FUEL_LEVEL, percent);
    ecuDataStore.write(DATA_MAP.ADC1, raw);

    markFresh();
  }, SAMPLE_MS);

  return () => clearInterval(interval);
}
