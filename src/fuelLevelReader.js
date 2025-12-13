import i2c from "i2c-bus";
import fs from "fs";
import { DATA_MAP } from "./dataKeys.js";

const ADS1115_ADDR = 0x48;
const bus = i2c.openSync(1);

const DEBUG_FUEL = true;
const dbg = (...args) => DEBUG_FUEL && console.log("[FUEL]", ...args);

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CAL_FILE   = "./fuelCal.json";
const USED_FILE  = "./fuelUsed.json";
const PCT_FILE   = "./fuelPct.json";

const SAMPLE_MS = 100;

// Injector / fuel math
const INJECTOR_FLOW_CC = 390;
const NUM_INJECTORS = 4;
const CC_PER_GALLON = 3785.41;

// Refuel detection
const REFUEL_STEP_PCT = 15;
const REFUEL_MIN_PCT  = 30;
const REFUEL_CONFIRM_SAMPLES = 10;

// Sender
const RAW_DISCONNECTED_THRESHOLD = 100;
const FUEL_INVALID = -1;

// ADS1115
const CONFIG_OS = 0x8000;
const CONFIG_MODE_SINGLE = 0x0100;
const CONFIG_DR_860SPS = 0x00E0;
const CONFIG_COMP_DISABLE = 0x0003;
const CONFIG_PGA_4096 = 0x0200;
const MUX = [0x4000, 0x5000, 0x6000, 0x7000];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function safeAdd(acc, delta) {
  if (!Number.isFinite(delta) || delta <= 0) return acc;
  return acc + delta;
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
  const cal = { rawMin: 200, rawMax: 8000 };
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
function readAds1115Raw(channel = 0) {
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

  const start = process.hrtime.bigint();
  while (process.hrtime.bigint() - start < 2_000_000n) {}

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
let refuelCount = 0;
let refuelLocked = false;

let gallonsSinceRefuel = loadUsed();
let tripGallonsUsed = 0;

let lastTime = Date.now();

// ─────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────
export default function fuelLevelUpdater(ecuDataStore, markFresh) {

  ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, gallonsSinceRefuel);
  ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, tripGallonsUsed);

  setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt <= 0 || dt > 0.5) return;

    // ────────── FUEL USED (PW + RPM) ──────────
    const pwMs = ecuDataStore.read(DATA_MAP.PW1) || 0;
    const rpm  = ecuDataStore.read(DATA_MAP.RPM) || 0;

    if (pwMs > 0 && rpm > 500) {
      const injectionsPerSec = rpm / 2 / 60;
      const ccPerInjection = (INJECTOR_FLOW_CC / 60) * (pwMs / 1000);
      const gallonsPerSec =
        (ccPerInjection * injectionsPerSec * NUM_INJECTORS) /
        CC_PER_GALLON;

      const delta = gallonsPerSec * dt;
      gallonsSinceRefuel = safeAdd(gallonsSinceRefuel, delta);
      tripGallonsUsed    = safeAdd(tripGallonsUsed, delta);

      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, gallonsSinceRefuel);
      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, tripGallonsUsed);
      maybeSaveUsed(gallonsSinceRefuel);
    }

    // ────────── FUEL SENDER ──────────
    let raw = null;
    try { raw = readAds1115Raw(0); } catch {}

    const senderConnected =
      Number.isFinite(raw) &&
      raw >= RAW_DISCONNECTED_THRESHOLD &&
      raw <= rawMax;

    dbg("RAW:", raw, "CONNECTED:", senderConnected);

    ecuDataStore.write(
      DATA_MAP.FUEL_SENDER_CONNECTED,
      senderConnected ? 1 : 0
    );

    if (!senderConnected) {
      lastFuelPct = null;
      refuelLocked = true;
      ecuDataStore.write(DATA_MAP.FUEL_LEVEL, FUEL_INVALID);
      return;
    }

    const percent = rawToPercent(
      Math.max(rawMin, Math.min(raw, rawMax))
    );

    if (percent === null) {
      ecuDataStore.write(DATA_MAP.FUEL_LEVEL, FUEL_INVALID);
      return;
    }

    const speed = ecuDataStore.read(DATA_MAP.SPEEDO) || 0;

    if (speed < 1) saveFuelPct(percent);

    if (lastFuelPct !== null && percent < lastFuelPct - 5) {
      refuelLocked = false;
    }

    if (
      !refuelLocked &&
      lastFuelPct !== null &&
      speed < 1 &&
      percent - lastFuelPct > REFUEL_STEP_PCT &&
      percent > REFUEL_MIN_PCT
    ) {
      refuelCount++;
    } else {
      refuelCount = 0;
    }

    if (refuelCount >= REFUEL_CONFIRM_SAMPLES) {
      gallonsSinceRefuel = 0;
      tripGallonsUsed    = 0;
      lastSavedGallons   = 0;
      refuelLocked = true;

      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_SINCE_REFILL, 0);
      ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, 0);
      saveUsed(0);

      dbg("⛽ Refuel detected — counters reset");
      refuelCount = 0;
    }

    lastFuelPct = percent;
    ecuDataStore.write(DATA_MAP.FUEL_LEVEL, percent);
    ecuDataStore.write(DATA_MAP.ADC1, raw);

    markFresh();
  }, SAMPLE_MS);
}

