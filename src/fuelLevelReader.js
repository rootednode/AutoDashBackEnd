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
const REFUEL_DELTA_PCT = 25;
const STOPPED_SPEED_MPH = 1;
const REFUEL_STOPPED_MIN_MS = 30_000;
const REFUEL_STABLE_WINDOW_MS = 10_000;
const REFUEL_STABLE_MIN_SPAN_MS = 9_000;
const REFUEL_STABLE_MIN_SAMPLES = 50;
const REFUEL_STABLE_RANGE_PCT = 5;
const MAX_LEARN_STEP = 500;
const CAL_LEARN_WINDOW_MS = 20_000;
const CAL_LEARN_MIN_SPAN_MS = 19_000;
const CAL_LEARN_MIN_SAMPLES = 150;
const CAL_LEARN_MAX_RAW_RANGE = 150;
const CAL_LEARN_FULL_PCT = 95;
const OBSERVED_RAW_MAX_SAVE_MS = 30_000;

let stoppedBaselinePct = null;
let stoppedSince = null;
const stoppedFuelSamples = [];
const calibrationSamples = [];

// Sender
// The sender reads lower as the tank fills. Do not use a positive cutoff here:
// valid full-tank readings can fall close to zero and were being mistaken for
// an open sender. Zero/negative ADS1115 readings still identify the unpowered
// or disconnected circuit, after the confirmation delay below.
const RAW_DISCONNECTED_THRESHOLD = 0;
const SENDER_DISCONNECT_CONFIRM_MS = 1_500;
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

  const calibrationJson = JSON.stringify({
    _comment: "rawMin/rawMax calibrate the gauge; observedRawMax is the highest valid smoothed reading seen",
    rawMin,
    rawMax,
    observedRawMin,
    observedRawMax,
    observedRawMaxAt,
    rawMinLearnedAt,
    rawMaxLearnedAt,
    lastStableObservationAt
  }, null, 2);
  const tempFile = `${CAL_FILE}.tmp`;

  fs.writeFileSync(tempFile, calibrationJson);
  fs.renameSync(tempFile, CAL_FILE);
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

const calibration = loadCalibration();
let { rawMin, rawMax } = calibration;
let observedRawMin = Number.isFinite(calibration.observedRawMin)
  ? calibration.observedRawMin
  : null;
let observedRawMax = Number.isFinite(calibration.observedRawMax)
  ? calibration.observedRawMax
  : null;
let observedRawMaxAt = calibration.observedRawMaxAt || null;
let rawMinLearnedAt = calibration.rawMinLearnedAt || null;
let rawMaxLearnedAt = calibration.rawMaxLearnedAt || null;
let lastStableObservationAt = calibration.lastStableObservationAt || null;
let observedRawMaxDirty = false;
let lastObservedRawMaxSaveTime = 0;
dbg("Calibration", {
  rawMin,
  rawMax,
  observedRawMin,
  observedRawMax
});

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
let refuelLocked = false;
let senderInvalidSince = null;

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

function resetStoppedRefuelObservation() {
  stoppedBaselinePct = null;
  stoppedSince = null;
  stoppedFuelSamples.length = 0;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function resetCalibrationObservation() {
  calibrationSamples.length = 0;
}

function moveToward(current, target, maxStep) {
  const delta = Math.max(-maxStep, Math.min(maxStep, target - current));
  return Math.round(current + delta);
}

function trackHighestRawSeen(now, raw) {
  if (!Number.isFinite(raw)) return;

  const candidate = Math.round(raw);
  if (observedRawMax !== null && candidate <= observedRawMax) return;

  observedRawMax = candidate;
  observedRawMaxAt = new Date(now).toISOString();
  observedRawMaxDirty = true;

  if (now - lastObservedRawMaxSaveTime >= OBSERVED_RAW_MAX_SAVE_MS) {
    saveCalibration();
    observedRawMaxDirty = false;
    lastObservedRawMaxSaveTime = now;
  }
}

function flushObservedRawMax(now) {
  if (!observedRawMaxDirty) return;
  if (now - lastObservedRawMaxSaveTime < OBSERVED_RAW_MAX_SAVE_MS) return;

  saveCalibration();
  observedRawMaxDirty = false;
  lastObservedRawMaxSaveTime = now;
}

function learnStableCalibration(
  now,
  raw,
  stopped,
  percent,
  refuelConfirmed
) {
  if (!stopped || !Number.isFinite(raw)) {
    resetCalibrationObservation();
    return;
  }

  calibrationSamples.push({ time: now, raw });

  const windowStart = now - CAL_LEARN_WINDOW_MS;
  while (
    calibrationSamples.length > 0 &&
    calibrationSamples[0].time < windowStart
  ) {
    calibrationSamples.shift();
  }

  if (calibrationSamples.length < CAL_LEARN_MIN_SAMPLES) return;

  const sampleSpan =
    calibrationSamples[calibrationSamples.length - 1].time -
    calibrationSamples[0].time;
  if (sampleSpan < CAL_LEARN_MIN_SPAN_MS) return;

  const values = calibrationSamples.map((sample) => sample.raw);
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  if (maxRaw - minRaw > CAL_LEARN_MAX_RAW_RANGE) return;

  const stableRaw = Math.round(median(values));
  const observedAt = new Date(now).toISOString();
  let changed = false;

  if (observedRawMin === null || stableRaw < observedRawMin) {
    observedRawMin = stableRaw;
    changed = true;
  }
  const canLearnFull = refuelConfirmed && percent >= CAL_LEARN_FULL_PCT;

  if (canLearnFull && stableRaw !== rawMin) {
    const previousRawMin = rawMin;
    const targetRawMin = Math.min(stableRaw, rawMax - 1);
    rawMin = moveToward(rawMin, targetRawMin, MAX_LEARN_STEP);
    rawMinLearnedAt = observedAt;
    changed = true;
    dbg("Learned full-tank raw value", {
      previousRawMin,
      stableRaw,
      rawMin
    });
  }

  if (stableRaw > rawMax) {
    const previousRawMax = rawMax;
    rawMax = moveToward(rawMax, stableRaw, MAX_LEARN_STEP);
    rawMaxLearnedAt = observedAt;
    changed = true;
    dbg("Learned higher empty-tank raw value", {
      previousRawMax,
      stableRaw,
      rawMax
    });
  }

  lastStableObservationAt = observedAt;
  if (changed) saveCalibration();

  // Require another complete stable period before making another endpoint
  // adjustment. This prevents a long stop from rapidly walking a bound.
  resetCalibrationObservation();
}

function getStableStoppedFuelPercent(now, percent) {
  stoppedFuelSamples.push({ time: now, percent });

  const windowStart = now - REFUEL_STABLE_WINDOW_MS;
  while (
    stoppedFuelSamples.length > 0 &&
    stoppedFuelSamples[0].time < windowStart
  ) {
    stoppedFuelSamples.shift();
  }

  if (stoppedFuelSamples.length < REFUEL_STABLE_MIN_SAMPLES) return null;

  const sampleSpan =
    stoppedFuelSamples[stoppedFuelSamples.length - 1].time -
    stoppedFuelSamples[0].time;
  if (sampleSpan < REFUEL_STABLE_MIN_SPAN_MS) return null;

  const percentages = stoppedFuelSamples.map((sample) => sample.percent);
  const minPercent = Math.min(...percentages);
  const maxPercent = Math.max(...percentages);
  if (maxPercent - minPercent > REFUEL_STABLE_RANGE_PCT) return null;

  return median(percentages);
}

// ─────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────
export default function fuelLevelUpdater(ecuDataStore, markFresh) {
  ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, gallonsSinceRefuel);
  ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, tripGallonsUsed);

  // Keep the last trustworthy reading on screen while the ADC and sender
  // power settle after startup. A sustained invalid signal below will still
  // replace it with the disconnected state.
  if (Number.isFinite(lastFuelPct)) {
    ecuDataStore.write(DATA_MAP.FUEL_LEVEL, lastFuelPct);
    ecuDataStore.write(DATA_MAP.FUEL_SENDER_CONNECTED, 1);
  }

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

  let sampleInFlight = false;

  const interval = setInterval(async () => {
    if (sampleInFlight) return;
    sampleInFlight = true;

    try {
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
    let rawSample;

    if (process.env.TYPE === "development") {
      const pct = getTestFuelPercent(now);

      // convert percent → fake raw value
      rawSample = rawMax - (pct / 100) * (rawMax - rawMin);
    } else {
      try {
        rawSample = await readAds1115Raw(0);
      } catch {}
    }

    // Judge connectivity from the actual sample, not the moving average.
    // Failed reads and key-off zeroes must never poison the smoothing window,
    // otherwise one intermittent I2C error can hold the gauge at null.
    const validSenderSample =
      Number.isFinite(rawSample) &&
      rawSample > RAW_DISCONNECTED_THRESHOLD;

    if (!validSenderSample) {
      if (senderInvalidSince === null) senderInvalidSince = now;

      if (now - senderInvalidSince < SENDER_DISCONNECT_CONFIRM_MS) return;

      ecuDataStore.write(DATA_MAP.FUEL_SENDER_CONNECTED, 0);
      resetStoppedRefuelObservation();
      resetCalibrationObservation();
      window.length = 0;
      ecuDataStore.write(DATA_MAP.FUEL_LEVEL, FUEL_INVALID);
      return;
    }

    senderInvalidSince = null;
    ecuDataStore.write(DATA_MAP.FUEL_SENDER_CONNECTED, 1);

    const raw = smoothMA(rawSample);

    trackHighestRawSeen(now, raw);
    flushObservedRawMax(now);

    const percent = rawToPercent(
      Math.max(rawMin, Math.min(raw, rawMax))
    );

    if (percent === null) {
      ecuDataStore.write(DATA_MAP.FUEL_SENDER_CONNECTED, 0);
      resetStoppedRefuelObservation();
      resetCalibrationObservation();
      ecuDataStore.write(DATA_MAP.FUEL_LEVEL, FUEL_INVALID);
      return;
    }

    const speed = ecuDataStore.read(DATA_MAP.SPEEDO) || 0;
    const stopped = speed < STOPPED_SPEED_MPH;
    learnStableCalibration(
      now,
      raw,
      stopped,
      percent,
      refuelLocked
    );

    if (!stopped) {
      resetStoppedRefuelObservation();
      refuelLocked = false;
    } else {
      if (stoppedSince === null) {
        stoppedSince = now;
        // On startup this is the persisted pre-refill percentage. During
        // normal operation it is the most recent reading before stopping.
        stoppedBaselinePct = Number.isFinite(lastFuelPct)
          ? lastFuelPct
          : percent;
      }

      const stableFuelPct = getStableStoppedFuelPercent(now, percent);
      const stoppedLongEnough =
        now - stoppedSince >= REFUEL_STOPPED_MIN_MS;
      const refillDelta =
        stableFuelPct === null ? 0 : stableFuelPct - stoppedBaselinePct;

      dbg("REFUEL chk", {
        percent,
        stableFuelPct,
        stoppedBaselinePct,
        refillDelta,
        stoppedLongEnough,
        refuelLocked
      });

      if (
        !refuelLocked &&
        stoppedLongEnough &&
        stableFuelPct !== null &&
        refillDelta >= REFUEL_DELTA_PCT &&
        stableFuelPct > REFUEL_MIN_PCT
      ) {
        gallonsSinceRefuel = 0;
        tripGallonsUsed    = 0;
        lastSavedGallons   = 0;
        refuelLocked = true;

        ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, 0);
        ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, 0);

        saveUsed(0);

        console.info("[FUEL] Refuel detected — counters reset", {
          previousPercent: stoppedBaselinePct,
          currentPercent: stableFuelPct,
          increasePercent: refillDelta
        });

        stoppedBaselinePct = stableFuelPct;
        saveFuelPctNow(stableFuelPct);
      } else if (stableFuelPct !== null) {
        maybeSaveFuelPct(stableFuelPct);
      }

    }

    lastFuelPct = percent;

    ecuDataStore.write(DATA_MAP.FUEL_LEVEL, percent);
    ecuDataStore.write(DATA_MAP.ADC1, raw);

    markFresh();
    } finally {
      sampleInFlight = false;
    }
  }, SAMPLE_MS);

  return () => clearInterval(interval);
}
