import fs from "fs";
import path from "path";
import { DATA_MAP } from "./dataKeys.js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const INJECTOR_FLOW_CC = 360;   // ✅ corrected
const NUM_INJECTORS = 4;

const SPEED_BIN = 5;           // mph
const BOOST_KPA = 95;

// Noise rejection
const MAX_DMAP = 1.0;          // kPa
const MAX_DPW  = 0.3;          // ms
const MAX_DSPD = 0.5;          // mph

// Window stability
const MAX_MAP_RANGE   = 2.0;
const MAX_RPM_RANGE   = 150;
const MAX_SPEED_RANGE = 1.0;

// Powered driving guards
const MIN_POWER_MAP = 45;
const MIN_POWER_PW  = 1.5;

// Cruise plausibility
const MIN_CRUISE_RPM = 2000;
const MIN_CRUISE_MAP = 40;

// Timing
const STEADY_SAMPLES = 30; // ~3s @ 10Hz

// Sanity
const MIN_EFF = 5.0;

// Persistence
const DATA_DIR = path.join(process.cwd(), "data");
const SAVE_FILE = path.join(DATA_DIR, "ecoBest.json");
const SAVE_DEBOUNCE_MS = 5000;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const bins = new Map();

let ecoFast = 50;
let ecoSlow = 50;

let lastMap = 0;
let lastPw = 0;
let lastSpeed = 0;
let lastSpeedKey = null;

let steadyCount = 0;
let saveTimer = null;

// Rolling window
let steadySamples = 0;
let steadyRpmSum = 0;
let steadyMapSum = 0;
let steadySpeedSum = 0;

let steadyMapMin = Infinity;
let steadyMapMax = -Infinity;
let steadyRpmMin = Infinity;
let steadyRpmMax = -Infinity;
let steadySpeedMin = Infinity;
let steadySpeedMax = -Infinity;

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
(function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SAVE_FILE)) return;

    const raw = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
    Object.entries(raw).forEach(([k, v]) => {
      if (v?.best > 0 && v?.worst > 0 && v.best > v.worst) {
        bins.set(Number(k), v);
      }
    });

    console.log(`[ECO] Loaded ${bins.size} bins`);
  } catch (e) {
    console.warn("[ECO] Load failed:", e.message);
  }
})();

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const speedKey = s => Math.floor(s / SPEED_BIN) * SPEED_BIN;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function rpmMatchesSpeed(speed, rpm) {
  if (speed > 35 && rpm < 1800) return false;
  if (speed > 55 && rpm < 2200) return false;
  if (speed > 70 && rpm < 2600) return false;
  return true;
}

function fuelCcPerSec(pw, rpm) {
  if (pw <= 0 || rpm <= 0) return 0;
  return (pw / 1000) * (rpm / 120) * (INJECTOR_FLOW_CC / 60) * NUM_INJECTORS;
}

function efficiency(speed, fuel) {
  if (speed < 5 || fuel <= 0) return 0;
  return speed / fuel;
}

function resetWindow() {
  steadyCount = 0;
  steadySamples = 0;
  steadyRpmSum = 0;
  steadyMapSum = 0;
  steadySpeedSum = 0;

  steadyMapMin = Infinity;
  steadyMapMax = -Infinity;
  steadyRpmMin = Infinity;
  steadyRpmMax = -Infinity;
  steadySpeedMin = Infinity;
  steadySpeedMax = -Infinity;
}

// ─────────────────────────────────────────────
// STEADY DETECTION
// ─────────────────────────────────────────────
function updateSteady(map, pw, speed, rpm) {
  const dMap = Math.abs(map - lastMap);
  const dPw  = Math.abs(pw - lastPw);
  const dSpd = Math.abs(speed - lastSpeed);

  lastMap = map;
  lastPw = pw;
  lastSpeed = speed;

  const steady =
    dMap < MAX_DMAP &&
    dPw  < MAX_DPW &&
    dSpd < MAX_DSPD;

  if (!steady) {
    resetWindow();
    return false;
  }

  steadyCount++;
  steadySamples++;

  steadyRpmSum += rpm;
  steadyMapSum += map;
  steadySpeedSum += speed;

  steadyMapMin = Math.min(steadyMapMin, map);
  steadyMapMax = Math.max(steadyMapMax, map);
  steadyRpmMin = Math.min(steadyRpmMin, rpm);
  steadyRpmMax = Math.max(steadyRpmMax, rpm);
  steadySpeedMin = Math.min(steadySpeedMin, speed);
  steadySpeedMax = Math.max(steadySpeedMax, speed);

  return true;
}

// ─────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────
function scheduleSave() {
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj = {};
      for (const [k, v] of bins.entries()) obj[k] = v;
      const tmp = SAVE_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
      fs.renameSync(tmp, SAVE_FILE);
      console.log("[ECO] Saved bins");
    } catch (e) {
      console.warn("[ECO] Save failed:", e.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

// ─────────────────────────────────────────────
// LEARNING
// ─────────────────────────────────────────────
function updateBins(speed, eff, map, pw, rpm) {
  if (speed < 10) return;
  if (map > BOOST_KPA) return;
  if (eff < MIN_EFF) return;

  const key = speedKey(speed);
  if (key !== lastSpeedKey) {
    lastSpeedKey = key;
    resetWindow();
  }

  if (!updateSteady(map, pw, speed, rpm)) return;
  if (steadyCount < STEADY_SAMPLES) return;

  const mapRange = steadyMapMax - steadyMapMin;
  const rpmRange = steadyRpmMax - steadyRpmMin;
  const spdRange = steadySpeedMax - steadySpeedMin;

  if (mapRange > MAX_MAP_RANGE) return;
  if (rpmRange > MAX_RPM_RANGE) return;
  if (spdRange > MAX_SPEED_RANGE) return;

  let rec = bins.get(key);
  if (!rec) {
    rec = { best: eff, worst: eff };
    bins.set(key, rec);
    scheduleSave();
    return;
  }

  const avgRpm = steadyRpmSum / steadySamples;
  const avgMap = steadyMapSum / steadySamples;
  const avgSpd = steadySpeedSum / steadySamples;

  if (
    eff > rec.best * 1.02 &&
    pw >= MIN_POWER_PW &&
    avgRpm >= MIN_CRUISE_RPM &&
    avgMap >= MIN_CRUISE_MAP &&
    rpmMatchesSpeed(avgSpd, avgRpm)
  ) {
    rec.best = eff;
    rec.bestRpm = Math.round(avgRpm);
    rec.bestMap = avgMap;
    rec.bestSpeed = avgSpd;
    scheduleSave();
  }

  if (
    eff < rec.worst * 0.98 &&
    pw >= MIN_POWER_PW &&
    map >= MIN_POWER_MAP
  ) {
    rec.worst = eff;
    scheduleSave();
  }
}

// ─────────────────────────────────────────────
// ECO SCORING (HUMAN-FRIENDLY)
// ─────────────────────────────────────────────
function ecoPercent(speed, eff) {
  const rec = bins.get(speedKey(speed));
  if (!rec) return 50;

  const span = rec.best - rec.worst;
  if (span <= 0) return 50;

  let norm = (eff - rec.worst) / span;
  norm = clamp(norm, 0, 1);

  // 🔑 soften response
  norm = Math.sqrt(norm);

  return norm * 100;
}

// Slow, forgiving smoothing
function smooth(raw) {
  raw = clamp(raw, 0, 100);

  ecoFast += (raw - ecoFast) * 0.12;
  ecoSlow += (raw - ecoSlow) * 0.03;

  return { fast: ecoFast, slow: ecoSlow };
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────
export function computeEcoBar(ds) {
  const rpm   = ds.read(DATA_MAP.RPM);
  const pw    = ds.read(DATA_MAP.PW1);
  const speed = ds.read(DATA_MAP.SPEEDO);
  const map   = ds.read(DATA_MAP.MAP);

  if (rpm == null || pw == null || speed == null || map == null) return null;
  if (rpm <= 0) return null;

  const eff = efficiency(speed, fuelCcPerSec(pw, rpm));
  updateBins(speed, eff, map, pw, rpm);

  let raw = ecoPercent(speed, eff);

  // Forgive light cruise / tip-in
  if (map < 65 && pw < 3.0 && rpm > 2000) {
    raw = Math.max(raw, raw * 1.1);
  }

  const { fast, slow } = smooth(raw);

  return {
    eco_pct: fast,
    eco_target: slow
  };
}

export function resetEcoLearning() {
  bins.clear();
  ecoFast = 50;
  ecoSlow = 50;
  scheduleSave();
}

