import fs from "fs";
import path from "path";
import { DATA_MAP } from "./dataKeys.js";
import { computeFuelGPH } from "./fuelFlow.js";
import { isRealVehicleCan } from "./vehiclePersistence.js";

// Sampling and speed bins
const SAMPLE_MS = 100;
const SPEED_BIN = 5;

// Powered, non-boost cruise guards
const MAX_LEARNING_MAP_KPA = 95;
const MIN_POWER_MAP_KPA = 40;
const MIN_POWER_PW_MS = 1.5;
const MIN_CRUISE_RPM = 1000;
const MIN_LEARNING_MPH = 10;
const MIN_REASONABLE_MPG = 3;
const MAX_REASONABLE_MPG = 80;

// Three-second rolling stability window sampled at 10 Hz
const STEADY_WINDOW_MS = 3000;
const STEADY_MIN_SPAN_MS = 2900;
const STEADY_MIN_SAMPLES = 20;
const MAX_DMAP_KPA = 1;
const MAX_DPW_MS = 0.3;
const MAX_DSPEED_MPH = 1;
const MAX_MAP_RANGE_KPA = 2;
const MAX_PW_RANGE_MS = 0.5;
const MAX_RPM_RANGE = 150;
const MAX_SPEED_RANGE_MPH = 1;

// Robust per-bin learning
const LEARN_INTERVAL_MS = 1000;
const LEARNING_HISTORY_SIZE = 120;
const LEARNING_MIN_HISTORY = 10;
const MIN_BIN_SPAN_MPG = 2;
const FAST_LEARN_ALPHA = 0.25;
const NORMAL_LEARN_ALPHA = 0.08;

// Display response
const ECO_SMOOTHING_SECONDS = 0.75;

// Persistence
const ECO_DATA_VERSION = 2;
const DATA_DIR = path.join(process.cwd(), "data");
const SAVE_FILE = path.join(DATA_DIR, "ecoBest.json");
const SAVE_DEBOUNCE_MS = 5000;

const bins = new Map();
const learningHistory = new Map();
const lastLearnTime = new Map();
const steadyWindow = [];

let lastSampleTime = null;
let lastMap = null;
let lastPw = null;
let lastSpeed = null;
let lastSpeedKey = null;
let ecoValue = 50;
let saveTimer = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const speedKey = speed => Math.floor(speed / SPEED_BIN) * SPEED_BIN;

function loadBins() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SAVE_FILE)) return;

    const saved = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
    if (saved?.version !== ECO_DATA_VERSION || !saved.bins) {
      console.log("[ECO] Ignoring legacy learning data; relearning v2 bins");
      return;
    }

    Object.entries(saved.bins).forEach(([key, record]) => {
      if (
        Number.isFinite(record?.best) &&
        Number.isFinite(record?.worst) &&
        record.best > record.worst &&
        record.samples >= LEARNING_MIN_HISTORY
      ) {
        bins.set(Number(key), record);
      }
    });

    console.log(`[ECO] Loaded ${bins.size} v2 bins`);
  } catch (error) {
    console.warn("[ECO] Load failed:", error.message);
  }
}

loadBins();

function scheduleSave() {
  if (!isRealVehicleCan()) return;
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const records = {};
      for (const [key, record] of bins.entries()) records[key] = record;

      const temporaryFile = `${SAVE_FILE}.tmp`;
      fs.writeFileSync(
        temporaryFile,
        JSON.stringify({ version: ECO_DATA_VERSION, bins: records }, null, 2)
      );
      fs.renameSync(temporaryFile, SAVE_FILE);
      console.log("[ECO] Saved v2 bins");
    } catch (error) {
      console.warn("[ECO] Save failed:", error.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

function resetSteadyWindow() {
  steadyWindow.length = 0;
}

function rpmMatchesSpeed(speed, rpm) {
  if (speed > 35 && rpm < 1800) return false;
  if (speed > 55 && rpm < 2200) return false;
  if (speed > 70 && rpm < 2600) return false;
  return true;
}

function isPoweredCruise(speed, map, pw, rpm, mpg) {
  return (
    speed >= MIN_LEARNING_MPH &&
    map >= MIN_POWER_MAP_KPA &&
    map <= MAX_LEARNING_MAP_KPA &&
    pw >= MIN_POWER_PW_MS &&
    rpm >= MIN_CRUISE_RPM &&
    mpg >= MIN_REASONABLE_MPG &&
    mpg <= MAX_REASONABLE_MPG &&
    rpmMatchesSpeed(speed, rpm)
  );
}

function stableCruiseSample(now, map, pw, speed, rpm, mpg) {
  const key = speedKey(speed);
  if (lastSpeedKey !== key) {
    lastSpeedKey = key;
    resetSteadyWindow();
  }

  const hasPrevious =
    lastMap !== null && lastPw !== null && lastSpeed !== null;
  const steadyStep =
    hasPrevious &&
    Math.abs(map - lastMap) <= MAX_DMAP_KPA &&
    Math.abs(pw - lastPw) <= MAX_DPW_MS &&
    Math.abs(speed - lastSpeed) <= MAX_DSPEED_MPH;

  lastMap = map;
  lastPw = pw;
  lastSpeed = speed;

  if (!steadyStep) resetSteadyWindow();

  steadyWindow.push({ now, map, pw, speed, rpm, mpg });
  const windowStart = now - STEADY_WINDOW_MS;
  while (steadyWindow.length > 0 && steadyWindow[0].now < windowStart) {
    steadyWindow.shift();
  }

  if (steadyWindow.length < STEADY_MIN_SAMPLES) return null;
  const span = steadyWindow[steadyWindow.length - 1].now - steadyWindow[0].now;
  if (span < STEADY_MIN_SPAN_MS) return null;

  let mapMin = Infinity;
  let mapMax = -Infinity;
  let rpmMin = Infinity;
  let rpmMax = -Infinity;
  let pwMin = Infinity;
  let pwMax = -Infinity;
  let speedMin = Infinity;
  let speedMax = -Infinity;
  let mapSum = 0;
  let rpmSum = 0;
  let pwSum = 0;
  let speedSum = 0;
  let mpgSum = 0;

  for (const sample of steadyWindow) {
    mapMin = Math.min(mapMin, sample.map);
    mapMax = Math.max(mapMax, sample.map);
    rpmMin = Math.min(rpmMin, sample.rpm);
    rpmMax = Math.max(rpmMax, sample.rpm);
    pwMin = Math.min(pwMin, sample.pw);
    pwMax = Math.max(pwMax, sample.pw);
    speedMin = Math.min(speedMin, sample.speed);
    speedMax = Math.max(speedMax, sample.speed);
    mapSum += sample.map;
    rpmSum += sample.rpm;
    pwSum += sample.pw;
    speedSum += sample.speed;
    mpgSum += sample.mpg;
  }

  if (mapMax - mapMin > MAX_MAP_RANGE_KPA) return null;
  if (pwMax - pwMin > MAX_PW_RANGE_MS) return null;
  if (rpmMax - rpmMin > MAX_RPM_RANGE) return null;
  if (speedMax - speedMin > MAX_SPEED_RANGE_MPH) return null;

  return {
    map: mapSum / steadyWindow.length,
    pw: pwSum / steadyWindow.length,
    rpm: rpmSum / steadyWindow.length,
    speed: speedSum / steadyWindow.length,
    mpg: mpgSum / steadyWindow.length
  };
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function learnBin(now, speed, mpg, map, pw, rpm) {
  if (!isPoweredCruise(speed, map, pw, rpm, mpg)) {
    resetSteadyWindow();
    return;
  }

  const stable = stableCruiseSample(now, map, pw, speed, rpm, mpg);
  if (!stable) return;
  if (
    !isPoweredCruise(
      stable.speed,
      stable.map,
      stable.pw,
      stable.rpm,
      stable.mpg
    )
  ) return;

  const key = speedKey(speed);
  const previousLearnTime = lastLearnTime.get(key) ?? -Infinity;
  if (now - previousLearnTime < LEARN_INTERVAL_MS) return;
  lastLearnTime.set(key, now);

  let history = learningHistory.get(key);
  if (!history) {
    history = [];
    learningHistory.set(key, history);
  }
  history.push(stable.mpg);
  if (history.length > LEARNING_HISTORY_SIZE) history.shift();

  let record = bins.get(key);
  if (!record) {
    record = { best: stable.mpg, worst: stable.mpg, samples: 1 };
    bins.set(key, record);
  } else {
    record.samples = (record.samples || 0) + 1;
  }

  if (history.length >= LEARNING_MIN_HISTORY) {
    const sorted = [...history].sort((a, b) => a - b);
    const observedWorst = percentile(sorted, 0.1);
    const observedBest = percentile(sorted, 0.9);
    const alpha = record.samples < 30
      ? FAST_LEARN_ALPHA
      : NORMAL_LEARN_ALPHA;

    record.best += (observedBest - record.best) * alpha;
    record.worst += (observedWorst - record.worst) * alpha;

    if (stable.mpg >= observedBest) {
      record.bestRpm = Math.round(stable.rpm);
      record.bestMap = Number(stable.map.toFixed(1));
      record.bestSpeed = Number(stable.speed.toFixed(1));
    }
  }

  scheduleSave();
}

function scoreForRecord(record, mpg) {
  if (!record || record.samples < LEARNING_MIN_HISTORY) return null;
  const span = record.best - record.worst;
  if (span < MIN_BIN_SPAN_MPG) return null;

  const normalized = clamp((mpg - record.worst) / span, 0, 1);
  return Math.sqrt(normalized) * 100;
}

function ecoPercent(speed, mpg) {
  const lowerKey = speedKey(speed);
  const upperKey = lowerKey + SPEED_BIN;
  const lowerScore = scoreForRecord(bins.get(lowerKey), mpg);
  const upperScore = scoreForRecord(bins.get(upperKey), mpg);

  if (lowerScore === null && upperScore === null) return 50;
  if (lowerScore === null) return upperScore;
  if (upperScore === null) return lowerScore;

  const fraction = (speed - lowerKey) / SPEED_BIN;
  return lowerScore + (upperScore - lowerScore) * fraction;
}

function smoothEco(raw, elapsedSeconds) {
  const alpha = 1 - Math.exp(-elapsedSeconds / ECO_SMOOTHING_SECONDS);
  ecoValue += (clamp(raw, 0, 100) - ecoValue) * alpha;
  return ecoValue;
}

export function computeEcoBar(dataStore, now = Date.now()) {
  if (lastSampleTime !== null && now - lastSampleTime < SAMPLE_MS) return null;

  const elapsedSeconds = lastSampleTime === null
    ? SAMPLE_MS / 1000
    : clamp((now - lastSampleTime) / 1000, 0.05, 0.5);
  lastSampleTime = now;

  const rpm = Number(dataStore.read(DATA_MAP.RPM));
  const pw = Number(dataStore.read(DATA_MAP.PW1));
  const speed = Number(dataStore.read(DATA_MAP.SPEEDO));
  const map = Number(dataStore.read(DATA_MAP.MAP));
  const fuelPsi = Number(dataStore.read(DATA_MAP.SENSOR2));
  const volts = Number(dataStore.read(DATA_MAP.VOLT));

  if (![rpm, pw, speed, map].every(Number.isFinite)) return null;
  if (rpm <= 0) return null;

  // Overrun fuel cut is zero-fuel coasting, not zero-MPG operation. Reward it
  // on the display, but keep it out of the powered-cruise learning history.
  const overrunFuelCut =
    speed >= 5 &&
    rpm >= MIN_CRUISE_RPM &&
    pw < MIN_POWER_PW_MS;
  if (overrunFuelCut) {
    resetSteadyWindow();
    return { eco_pct: smoothEco(100, elapsedSeconds) };
  }

  const gallonsPerHour = computeFuelGPH(pw, rpm, fuelPsi, map, volts);
  const mpg = speed >= 5 && gallonsPerHour > 0
    ? speed / gallonsPerHour
    : 0;

  learnBin(now, speed, mpg, map, pw, rpm);

  let raw = ecoPercent(speed, mpg);
  if (map < 65 && pw < 3 && rpm > 2000) raw = Math.min(100, raw * 1.1);

  return { eco_pct: smoothEco(raw, elapsedSeconds) };
}

export function resetEcoLearning() {
  bins.clear();
  learningHistory.clear();
  lastLearnTime.clear();
  resetSteadyWindow();
  ecoValue = 50;
  scheduleSave();
}
