"use strict";

import "@fontsource/orbitron/400.css";
import "@fontsource/orbitron/700.css";

import { DATA_MAP } from "./js/common/dataMap";

import tachometer from "./js/tachometer";
import speedo from "./js/speedo";
import clt from "./js/clt";
import tps from "./js/tps";
import mat from "./js/mat";
import eco from "./js/eco";
import tpsdot from "./js/tpsdot";
import pw from "./js/pw";
import volt from "./js/volt";
import map from "./js/map";
import adv from "./js/adv";
import status from "./js/status";
import afr from "./js/afr";
import ego from "./js/ego";
import sensors from "./js/sensors";
import fuel from "./js/fuel";
import canIndicator from "./js/canIndicator";
import engineDetails from "./js/engineDetails";
import {
  clearGaugePeaks,
  dimGaugeHighlights
} from "./js/common/gaugeColor";
import {
  ATMOSPHERIC_PRESSURE_KPA,
  DRIVEN_TIRE_DIAMETER_INCHES,
  FINAL_DRIVE_RATIO,
  KPA_TO_PSI,
  TANK_CAPACITY_GALLONS,
  TRANSFER_CASE_LOW_RATIO,
  TRANSMISSION_GEAR_RATIOS
} from "./js/common/vehicleConfig";
import { initializeNativeRadialGauges } from "./js/common/nativeRadialGauge";
import { initializeNativeLinearGauges } from "./js/common/nativeLinearGauge";
import {
  initializeStarfield,
  setScreenSaverEngineData,
  setStarfieldVehicleSpeed
} from "./js/starfield";

// --------------------------------------------------
// WORKER
// --------------------------------------------------
const dataWorker = new Worker(
  new URL("./js/comms/drawDataWorker.js", import.meta.url)
);

// --------------------------------------------------
// STATE
// --------------------------------------------------
let updateData = [];
let hasNewData = false;
let renderScheduled = false;

let canReady = false;        // latched proof-of-life
let commsDead = false;      // full reset latch

let isCommError = 0;         // authoritative failure
let isWatchdogTripped = 0;   // inferred silence

let counter = 0;

// --------------------------------------------------
// WATCHDOG
// --------------------------------------------------
let lastPacketTime = Date.now();
const AUTO_REFRESH_TIMEOUT = 1000;
const WATCHDOG_INTERVAL = 250;
const DRIVE_SUMMARY_CAN_SILENCE = 2000;
let summaryVisible = false;
let driveSession = null;
let latestVehicleTime = null;
let boostModeBannerTimer = null;
let engineAlertBannerTimer = null;
let oilChangeMilesAtSync = null;
let oilChangeOdometerAtSync = null;
let maintenanceItemsAtSync = {};
let controllerPersistenceEnabled = false;
let dashboardPage = "main";
let lastPinnedSummaryRefresh = 0;
let lastPeakResetSequence = null;
let lastControllerAppearanceSignature = null;
let lastControllerBrightness = null;
let lastControllerPage = null;
let lastControllerScreenSaver = null;
let candidateGear = null;
let candidateRange = null;
let candidateGearSince = 0;
let confirmedGear = null;
let confirmedRange = null;
let lastGearMatchAt = 0;
const OIL_CHANGE_WARNING_MILES = 2500;
const OIL_CHANGE_INTERVAL_MILES = 3000;
const MAINTENANCE_INTERVALS = {
  transmission: 30000,
  transferCase: 30000,
  frontDifferential: 30000,
  rearDifferential: 30000
};
const AFR_MAP_RPM_BINS = Array.from({ length: 9 }, (_, index) => 1000 + index * 500);
const AFR_MAP_KPA_BINS = Array.from({ length: 8 }, (_, index) => 20 + index * 20);
const HIGH_RANGE_MIN_GEAR_SPEED_MPH = [3, 7, 12, 18, 28];
const afrMapSamples = new Map();
const boostDutyMapSamples = new Map();

function initializeDashboardClock() {
  const clock = document.getElementById("dashboard-clock");
  const driveTime = document.getElementById("drive-time-indicator");
  if (!clock) return;
  const updateClock = () => {
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = now.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
    clock.setAttribute(
      "aria-label",
      `Current time ${clock.textContent}`
    );
    if (driveTime) {
      const elapsed = driveSession
        ? Math.max(0, driveSession.lastDataAt - driveSession.startedAt)
        : 0;
      const totalMinutes = Math.floor(elapsed / 60_000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      driveTime.textContent = hours > 0
        ? `${hours}h ${String(minutes).padStart(2, "0")}m`
        : `${minutes}m`;
    }
  };
  updateClock();
  setInterval(updateClock, 1000);
}

function moveAeGaugeToTuningPage() {
  const slot = document.getElementById("ae-tpsdot-gauge-slot");
  const gauge = document.getElementById("tpsdot_container");
  if (slot && gauge && gauge.parentElement !== slot) slot.append(gauge);
}

function updateGearIndicator(rpmValue, speedValue) {
  const indicator = document.getElementById("gear-indicator");
  const rangeIndicator = document.getElementById("drive-range-indicator");
  if (!indicator) return;
  const rpm = Number(rpmValue);
  const speed = Number(speedValue);
  const now = performance.now();
  if (!Number.isFinite(rpm) || !Number.isFinite(speed) || rpm < 500 || speed < 3) {
    candidateGear = null;
    candidateRange = null;
    candidateGearSince = 0;
    if (now - lastGearMatchAt > 800) {
      confirmedGear = null;
      confirmedRange = null;
      indicator.textContent = "--";
      if (rangeIndicator) rangeIndicator.textContent = "--";
    }
    return;
  }

  const wheelRpm = speed * 5280 * 12 /
    (60 * Math.PI * DRIVEN_TIRE_DIAMETER_INCHES);
  const observedTransmissionRatio =
    rpm / (wheelRpm * FINAL_DRIVE_RATIO);
  const matches = TRANSMISSION_GEAR_RATIOS.flatMap((ratio, index) => {
    const highRangeMinimum = HIGH_RANGE_MIN_GEAR_SPEED_MPH[index];
    const lowRangeMinimum = Math.max(
      3,
      highRangeMinimum / TRANSFER_CASE_LOW_RATIO
    );
    return [
    speed >= highRangeMinimum ? {
      gear: index + 1,
      range: "high",
      error: Math.abs(observedTransmissionRatio - ratio) / ratio
    } : null,
    speed >= lowRangeMinimum ? {
      gear: index + 1,
      range: "low",
      error: Math.abs(
        observedTransmissionRatio - ratio * TRANSFER_CASE_LOW_RATIO
      ) / (ratio * TRANSFER_CASE_LOW_RATIO)
    } : null
  ].filter(Boolean);
  });
  const highMatches = matches
    .filter((match) => match.range === "high")
    .sort((left, right) => left.error - right.error);
  const lowMatches = matches
    .filter((match) => match.range === "low")
    .sort((left, right) => left.error - right.error);
  const validHigh = highMatches[0]?.error <= 0.14 ? highMatches[0] : null;
  const validLow = lowMatches[0]?.error <= 0.14 ? lowMatches[0] : null;
  // Several W56 high-range ratios overlap low-range ratios. Prefer the
  // already-confirmed range while moving; on a fresh launch, assume high
  // unless no high-range gear is plausible. Stopping clears the range latch.
  const match = confirmedRange === "low"
    ? validLow || validHigh
    : confirmedRange === "high"
      ? validHigh || validLow
      : validHigh || validLow;
  if (!match || match.error > 0.14) {
    candidateGear = null;
    candidateRange = null;
    candidateGearSince = 0;
    if (now - lastGearMatchAt > 800) {
      indicator.textContent = "--";
      if (rangeIndicator) rangeIndicator.textContent = "--";
    }
    return;
  }

  lastGearMatchAt = now;
  if (
    candidateGear !== match.gear ||
    candidateRange !== match.range
  ) {
    candidateGear = match.gear;
    candidateRange = match.range;
    candidateGearSince = now;
  }
  if (
    (confirmedGear === match.gear && confirmedRange === match.range) ||
    now - candidateGearSince >= 350
  ) {
    confirmedGear = match.gear;
    confirmedRange = match.range;
    indicator.textContent = String(confirmedGear);
    if (rangeIndicator) {
      rangeIndicator.textContent = confirmedRange === "low"
        ? "L"
        : "H";
    }
  }
}

function nearestAfrMapBin(value, bins, halfStep) {
  if (
    !Number.isFinite(value) ||
    value < bins[0] ||
    value > bins[bins.length - 1]
  ) {
    return null;
  }
  const nearest = bins.reduce((best, bin) =>
    Math.abs(value - bin) < Math.abs(value - best) ? bin : best
  );
  return Math.abs(value - nearest) <= halfStep ? nearest : null;
}

function initializeAfrMap() {
  initializeOperatingMapTable("afr-map-table", "afr-map");
}

function initializeBoostDutyMap() {
  initializeOperatingMapTable("boost-duty-map-table", "boost-duty-map");
}

function initializeOperatingMapTable(tableId, cellPrefix) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const heading = document.createElement("tr");
  heading.innerHTML = "<th>kPa ↓<br>RPM →</th>";
  AFR_MAP_RPM_BINS.forEach((rpm) => {
    const cell = document.createElement("th");
    cell.textContent = rpm;
    heading.appendChild(cell);
  });
  const head = document.createElement("thead");
  head.appendChild(heading);
  table.appendChild(head);

  const body = document.createElement("tbody");
  [...AFR_MAP_KPA_BINS].reverse().forEach((mapKpa) => {
    const row = document.createElement("tr");
    const label = document.createElement("th");
    label.textContent = mapKpa;
    row.appendChild(label);
    AFR_MAP_RPM_BINS.forEach((rpm) => {
      const cell = document.createElement("td");
      cell.id = `${cellPrefix}-${mapKpa}-${rpm}`;
      cell.className = "empty";
      cell.textContent = "—";
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  table.appendChild(body);
}

function recordAfrMapSample(rpmValue, mapValue, afrRawValue, afrTargetValue) {
  const rpm = nearestAfrMapBin(Number(rpmValue), AFR_MAP_RPM_BINS, 250);
  const mapKpa = nearestAfrMapBin(Number(mapValue), AFR_MAP_KPA_BINS, 10);
  const afrValue = Number(afrRawValue) / 10;
  if (rpm === null || mapKpa === null || afrValue < 7 || afrValue > 30) return;

  const key = `${mapKpa}-${rpm}`;
  const targetAfr = Number(afrTargetValue);
  if (!Number.isFinite(targetAfr) || targetAfr < 7 || targetAfr > 30) return;
  const afrError = afrValue - targetAfr;
  const sample = afrMapSamples.get(key) || { total: 0, count: 0 };
  sample.total += afrError;
  sample.count += 1;
  afrMapSamples.set(key, sample);

  const cell = document.getElementById(`afr-map-${key}`);
  if (!cell) return;
  const averageError = sample.total / sample.count;
  cell.classList.remove("empty");
  cell.classList.toggle("afr-error-lean", averageError > 0.3);
  cell.classList.toggle("afr-error-rich", averageError < -0.3);
  cell.classList.toggle("afr-error-good", Math.abs(averageError) <= 0.3);
  cell.replaceChildren(
    document.createTextNode(
      `${averageError >= 0 ? "+" : ""}${averageError.toFixed(1)}`
    ),
    Object.assign(document.createElement("small"), {
      textContent: `TGT ${targetAfr.toFixed(1)} · ${sample.count}`
    })
  );
}

function recordBoostDutyMapSample(rpmValue, mapValue, dutyValue) {
  const rpm = nearestAfrMapBin(Number(rpmValue), AFR_MAP_RPM_BINS, 250);
  const mapKpa = nearestAfrMapBin(Number(mapValue), AFR_MAP_KPA_BINS, 10);
  const duty = Number(dutyValue);
  if (rpm === null || mapKpa === null || duty < 0 || duty > 100) return;

  const key = `${mapKpa}-${rpm}`;
  const sample = boostDutyMapSamples.get(key) || { total: 0, count: 0 };
  sample.total += duty;
  sample.count += 1;
  boostDutyMapSamples.set(key, sample);

  const cell = document.getElementById(`boost-duty-map-${key}`);
  if (!cell) return;
  cell.classList.remove("empty");
  cell.replaceChildren(
    document.createTextNode(`${(sample.total / sample.count).toFixed(1)}%`),
    Object.assign(document.createElement("small"), {
      textContent: `${sample.count} sample${sample.count === 1 ? "" : "s"}`
    })
  );
}

function updateOilServiceIndicator(currentOdometer) {
  const indicator = document.getElementById("oil-service-indicator");
  const mileage = document.getElementById("oil-service-mileage");
  if (!indicator || !mileage) return;

  const numericOdometer = Number(currentOdometer);
  const hasReading =
    Number.isFinite(numericOdometer) &&
    Number.isFinite(oilChangeMilesAtSync) &&
    Number.isFinite(oilChangeOdometerAtSync);
  const miles = hasReading
    ? oilChangeMilesAtSync +
      Math.max(0, numericOdometer - oilChangeOdometerAtSync)
    : null;
  mileage.textContent = miles === null
    ? "--"
    : miles >= 1000
      ? `${(miles / 1000).toFixed(1)}k`
      : String(Math.round(miles));
  indicator.classList.toggle(
    "service-due-soon",
    miles !== null &&
      miles >= OIL_CHANGE_WARNING_MILES &&
      miles < OIL_CHANGE_INTERVAL_MILES
  );
  indicator.classList.toggle(
    "service-overdue",
    miles !== null && miles >= OIL_CHANGE_INTERVAL_MILES
  );
  indicator.setAttribute(
    "aria-label",
    miles === null
      ? "Oil change mileage unavailable"
      : `${Math.round(miles)} miles since last oil change`
  );
  return miles;
}

function setControllerPageValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setDiagnosticState(id, stateName) {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.remove("diagnostic-good", "diagnostic-caution", "diagnostic-bad");
  if (stateName) element.classList.add(`diagnostic-${stateName}`);
}

function maintenanceMiles(item, currentOdometer) {
  const saved = maintenanceItemsAtSync[item];
  const odometer = Number(currentOdometer);
  if (!saved || !Number.isFinite(odometer)) return null;
  return saved.miles + Math.max(0, odometer - saved.odometer);
}

function formatControllerUptime(seconds) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds) / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor(totalMinutes % 1440 / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function updateControllerHealthPage() {
  if (dashboardPage !== "controller-health") return;
  try {
    const response = await fetch("/api/controller/health", {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Health request returned ${response.status}`);
    const health = await response.json();
    const statusElement = document.getElementById("controller-health-status");
    const healthy = health.status === "ok";
    if (statusElement) {
      statusElement.textContent = healthy ? "ONLINE" : "DEGRADED";
      statusElement.classList.toggle("health-good", healthy);
      statusElement.classList.toggle("health-bad", !healthy);
    }
    setControllerPageValue(
      "controller-health-mode",
      String(health.mode || "--").toUpperCase()
    );
    setControllerPageValue(
      "controller-health-can-interface",
      health.can?.interface || "--"
    );
    setControllerPageValue(
      "controller-health-can-fresh",
      health.can?.fresh ? "FRESH" : "STALE"
    );
    setControllerPageValue(
      "controller-health-can-age",
      Number.isFinite(health.can?.lastUpdateAgeMs)
        ? `${health.can.lastUpdateAgeMs} ms`
        : "--"
    );
    setControllerPageValue(
      "controller-health-dashboards",
      String(health.dashboard?.connectedDashboards ?? "--")
    );
    setControllerPageValue(
      "controller-health-uptime",
      formatControllerUptime(health.uptimeSeconds)
    );
    setControllerPageValue(
      "controller-health-persistence",
      health.controller?.persistenceEnabled ? "ENABLED" : "MEMORY ONLY"
    );
  } catch (error) {
    const statusElement = document.getElementById("controller-health-status");
    if (statusElement) {
      statusElement.textContent = "OFFLINE";
      statusElement.classList.remove("health-good");
      statusElement.classList.add("health-bad");
    }
  }
}

function updateControllerPageValues() {
  const oilMiles = updateOilServiceIndicator(
    updateData[DATA_MAP.CURRENT_ODOMETER.id]
  );
  setControllerPageValue(
    "controller-diagnostic-rpm",
    `${Math.round(numberValue(DATA_MAP.RPM))} RPM`
  );
  setControllerPageValue(
    "controller-diagnostic-speed",
    `${Math.round(numberValue(DATA_MAP.SPEEDO))} MPH`
  );
  const rpm = numberValue(DATA_MAP.RPM);
  const engineByte = numberValue(DATA_MAP.ENGINE) & 0xff;
  const status2 = numberValue(DATA_MAP.STATUS2) & 0xff;
  const status6 = numberValue(DATA_MAP.STATUS6) & 0xff;
  const status7 = numberValue(DATA_MAP.STATUS7) & 0xff;
  const engineState = (engineByte & 0x02) ? "CRANKING"
    : rpm >= 500 ? ((engineByte & 0x08) ? "WARMUP" : "RUNNING")
      : "STOPPED";
  const ecuFaults = [];
  if (status7 & 0x80) ecuFaults.push("LIMP");
  if (status7 & 0x40) ecuFaults.push("CEL");
  if (status7 & 0x10) ecuFaults.push("KNOCK");
  if (status2 & 0x40) ecuFaults.push("OVERBOOST");
  if (status2 & 0x20) ecuFaults.push("SPARK CUT");
  if (status6 & 0x0c) ecuFaults.push("AFR");
  if (status6 & 0x03) ecuFaults.push("EGT");
  const sessionWarnings = status.getSessionSummary();
  setControllerPageValue(
    "controller-diagnostic-can",
    isCommError || isWatchdogTripped ? "STALE" : "FRESH"
  );
  setControllerPageValue("controller-diagnostic-engine-state", engineState);
  setControllerPageValue(
    "controller-diagnostic-faults",
    ecuFaults.length ? ecuFaults.join(" · ") : "NONE"
  );
  setControllerPageValue(
    "controller-diagnostic-warnings",
    sessionWarnings.length
      ? sessionWarnings.map((warning) => warning.label).join(" · ")
      : "NONE"
  );
  setDiagnosticState("controller-diagnostic-can",
    isCommError || isWatchdogTripped ? "bad" : "good");
  setDiagnosticState("controller-diagnostic-faults",
    ecuFaults.length ? "bad" : "good");
  setDiagnosticState("controller-diagnostic-warnings",
    sessionWarnings.length ? "caution" : "good");
  setControllerPageValue(
    "controller-diagnostic-clt",
    `${Math.round(numberValue(DATA_MAP.CTS))} °F`
  );
  setControllerPageValue(
    "controller-diagnostic-mat",
    `MAT ${Math.round(numberValue(DATA_MAP.MAT))} °F`
  );
  const oilPressure = numberValue(DATA_MAP.SENSOR4);
  const minimumOilPressure = rpm >= 500
    ? Math.max(10, Math.min(55, rpm / 100))
    : 0;
  setControllerPageValue(
    "controller-diagnostic-oil-pressure",
    `${oilPressure.toFixed(1)} / ${minimumOilPressure.toFixed(0)} PSI`
  );
  setControllerPageValue(
    "controller-diagnostic-oil-temp",
    `OIL TEMP ${numberValue(DATA_MAP.SENSOR3).toFixed(0)} °F`
  );
  setDiagnosticState(
    "controller-diagnostic-oil-pressure",
    minimumOilPressure && oilPressure < minimumOilPressure ? "bad" : "good"
  );
  const fuelPressure = numberValue(DATA_MAP.SENSOR2);
  const mapKpa = numberValue(DATA_MAP.MAP);
  const fuelDelta = fuelPressure -
    (mapKpa - ATMOSPHERIC_PRESSURE_KPA) * KPA_TO_PSI;
  setControllerPageValue(
    "controller-diagnostic-fuel-pressure",
    `${fuelPressure.toFixed(1)} PSI`
  );
  setControllerPageValue(
    "controller-diagnostic-fuel-delta",
    `RAIL Δ ${fuelDelta.toFixed(1)} PSI`
  );
  setDiagnosticState(
    "controller-diagnostic-fuel-pressure",
    rpm >= 1000 && fuelDelta < 35 ? "bad" : "good"
  );
  setControllerPageValue(
    "controller-diagnostic-map",
    `${numberValue(DATA_MAP.MAP).toFixed(1)} kPa`
  );
  setControllerPageValue(
    "controller-diagnostic-afr",
    `${(numberValue(DATA_MAP.AFR) / 10).toFixed(1)} AFR`
  );
  setControllerPageValue(
    "controller-diagnostic-ego",
    `EGO ${numberValue(DATA_MAP.EGO).toFixed(1)}%`
  );
  setControllerPageValue(
    "controller-diagnostic-voltage",
    `${numberValue(DATA_MAP.VOLT).toFixed(1)} V`
  );
  setControllerPageValue(
    "controller-diagnostic-tps",
    `${Math.round(numberValue(DATA_MAP.TPS))}% TPS`
  );
  setControllerPageValue(
    "controller-diagnostic-tpsdot",
    `${numberValue(DATA_MAP.TPS_DOT).toFixed(1)} %/s`
  );
  setControllerPageValue(
    "controller-diagnostic-target",
    `${numberValue(DATA_MAP.BOOST_TARGET).toFixed(1)} kPa`
  );
  setControllerPageValue(
    "controller-diagnostic-duty",
    `${Math.round(numberValue(DATA_MAP.BOOST_CONTROLLER_DUTY))}%`
  );
  setControllerPageValue(
    "controller-diagnostic-pw",
    `${numberValue(DATA_MAP.PW1).toFixed(2)} ms`
  );
  setControllerPageValue(
    "controller-diagnostic-advance",
    `ADV ${numberValue(DATA_MAP.ADV).toFixed(1)}°`
  );
  setControllerPageValue(
    "controller-diagnostic-baro",
    `${numberValue(DATA_MAP.BARO).toFixed(1)} kPa`
  );
  setControllerPageValue(
    "controller-diagnostic-map-error",
    `MAP-BARO ${(mapKpa - numberValue(DATA_MAP.BARO)).toFixed(1)} kPa`
  );
  setControllerPageValue(
    "controller-diagnostic-ae",
    `${numberValue(DATA_MAP.AE_AMOUNT).toFixed(1)}%`
  );
  setControllerPageValue(
    "controller-diagnostic-eae",
    `EAE ${numberValue(DATA_MAP.EAE1).toFixed(1)}%`
  );
  setControllerPageValue(
    "controller-diagnostic-status",
    [engineByte, status2, status6, status7]
      .map((value) => value.toString(16).padStart(2, "0").toUpperCase())
      .join(" · ")
  );
  setControllerPageValue(
    "ae-tuning-tpsdot",
    `${numberValue(DATA_MAP.TPS_DOT).toFixed(1)} %/s`
  );
  setControllerPageValue(
    "ae-tuning-tps",
    `${numberValue(DATA_MAP.TPS).toFixed(1)}%`
  );
  setControllerPageValue(
    "ae-tuning-afr",
    `${(numberValue(DATA_MAP.AFR) / 10).toFixed(1)}`
  );
  setControllerPageValue(
    "ae-tuning-load",
    `${Math.round(numberValue(DATA_MAP.RPM))} / ` +
      `${Math.round(numberValue(DATA_MAP.MAP))} kPa`
  );
  const guidance = document.getElementById("ae-tuning-guidance");
  if (guidance) {
    const tuningStats = engineDetails.getSessionSummary();
    const qualifiedBins = tuningStats
      .filter((stat) => stat.stableEvents >= 5)
      .sort((left, right) => {
        const score = (stat) =>
          Math.abs(stat.averageInitialAfrDelta || 0) +
          Math.abs(stat.averageTailAfrDelta || 0) +
          Math.max(0, (stat.averageTriggerDelay || 0) - 100) / 100;
        return score(right) - score(left);
      });
    const strongest = qualifiedBins[0];
    if (!strongest) {
      const progress = tuningStats.reduce(
        (best, stat) => stat.stableEvents > best.stableEvents ? stat : best,
        { stableEvents: 0, bin: null }
      );
      guidance.textContent = progress.bin === null
        ? "COLLECTING STABLE EVENTS · 0 / 5"
        : `COLLECTING ${progress.bin} %/s EVENTS · ` +
          `${Math.floor(progress.stableEvents)} / 5`;
      guidance.style.color = "var(--dash-accent)";
    } else {
      const recommendations = [`${strongest.bin} %/s`];
      if (strongest.averageTriggerDelay > 100) {
        recommendations.push(
          `TRIGGER ${Math.round(strongest.averageTriggerDelay)}ms LATE`
        );
        recommendations.push("LOWER TPSdot THRESHOLD / TRIGGER EARLIER");
      } else {
        recommendations.push(
          `TIMING ${Math.round(strongest.averageTriggerDelay)}ms · OK`
        );
      }
      if (strongest.averageInitialAfrDelta > 0.5) {
        recommendations.push(
          `ADD INITIAL AE (+${strongest.averageInitialAfrDelta.toFixed(1)} AFR)`
        );
      } else if (strongest.averageInitialAfrDelta < -0.5) {
        recommendations.push(
          `REDUCE INITIAL AE (${strongest.averageInitialAfrDelta.toFixed(1)} AFR)`
        );
      } else {
        recommendations.push("INITIAL AE BALANCED");
      }
      if (strongest.averageTailAfrDelta > 0.5) {
        recommendations.push(
          `MORE EAE TAIL (+${strongest.averageTailAfrDelta.toFixed(1)} AFR)`
        );
      } else if (strongest.averageTailAfrDelta < -0.5) {
        recommendations.push(
          `LESS EAE TAIL (${strongest.averageTailAfrDelta.toFixed(1)} AFR)`
        );
      } else {
        recommendations.push("EAE TAIL BALANCED");
      }
      guidance.textContent = recommendations.join(" · ");
      const needsChange =
        strongest.averageTriggerDelay > 100 ||
        Math.abs(strongest.averageInitialAfrDelta || 0) > 0.5 ||
        Math.abs(strongest.averageTailAfrDelta || 0) > 0.5;
      guidance.style.color = needsChange
        ? "var(--dash-medium-color)"
        : "var(--dash-normal-color)";
    }
  }
  setControllerPageValue(
    "controller-maintenance-oil-miles",
    oilMiles === null ? "--" : `${oilMiles.toFixed(1)} mi`
  );
  setControllerPageValue(
    "controller-maintenance-oil-remaining",
    oilMiles === null
      ? "--"
      : `${Math.max(0, OIL_CHANGE_INTERVAL_MILES - oilMiles).toFixed(1)} mi`
  );
  setControllerPageValue(
    "controller-maintenance-odometer",
    `${numberValue(DATA_MAP.CURRENT_ODOMETER).toFixed(1)} mi`
  );
  setControllerPageValue(
    "controller-maintenance-persistence",
    controllerPersistenceEnabled ? "LIVE · SAVED" : "TEST · MEMORY ONLY"
  );
  Object.entries(MAINTENANCE_INTERVALS).forEach(([item, interval]) => {
    const miles = maintenanceMiles(
      item,
      numberValue(DATA_MAP.CURRENT_ODOMETER)
    );
    setControllerPageValue(
      `controller-maintenance-${item}-miles`,
      miles === null ? "--" : `${miles.toFixed(0)} mi`
    );
    setControllerPageValue(
      `controller-maintenance-${item}-remaining`,
      miles === null ? "--" : `${Math.max(0, interval - miles).toFixed(0)} mi left`
    );
    setDiagnosticState(
      `controller-maintenance-${item}-miles`,
      miles !== null && miles >= interval
        ? "bad"
        : miles !== null && miles >= interval * 0.85
          ? "caution"
          : "good"
    );
  });
}

function selectDashboardPage(page) {
  const validPages = Array.from(
    document.querySelectorAll("[data-dashboard-page]"),
    (element) => element.dataset.dashboardPage
  );
  dashboardPage = validPages.includes(page) ? page : "main";
  const overlay = document.getElementById("controller-page-overlay");
  if (!overlay) return;
  const controllerOverlayVisible = Boolean(
    document.querySelector(
      `[data-controller-page="${dashboardPage}"]`
    )
  );
  overlay.classList.toggle("visible", controllerOverlayVisible);
  overlay.setAttribute(
    "aria-hidden",
    controllerOverlayVisible ? "false" : "true"
  );
  document.querySelectorAll("[data-controller-page]").forEach((element) => {
    element.classList.toggle(
      "active",
      element.dataset.controllerPage === dashboardPage
    );
  });
  if (dashboardPage === "drive-summary") {
    showDriveSummary(true);
  } else if (summaryVisible) {
    hideDriveSummary();
  }
  updateControllerPageValues();
  updateControllerHealthPage();
}

function resetFrontendTripSession() {
  driveSession = null;
  const rpm = numberValue(DATA_MAP.RPM);
  if (rpm > 0) {
    beginDriveSession(
      Number.isFinite(latestVehicleTime) ? latestVehicleTime : Date.now()
    );
  } else {
    engineDetails.startSession();
    status.startSession();
  }
}

const DASHBOARD_FONT_STACKS = {
  orbitron: "Orbitron, sans-serif",
  sans: "Arial, Helvetica, sans-serif",
  system: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  condensed: "\"Arial Narrow\", \"Liberation Sans Narrow\", Arial, sans-serif",
  rounded: "\"Trebuchet MS\", \"DejaVu Sans\", sans-serif",
  serif: "Georgia, \"DejaVu Serif\", serif",
  mono: "\"Courier New\", Courier, monospace",
  quicksand: "Quicksand, \"DejaVu Sans\", sans-serif",
  gothic: "\"URW Gothic\", \"Century Gothic\", sans-serif",
  bookman: "\"URW Bookman\", \"Bookman Old Style\", serif",
  charter: "\"Bitstream Charter\", Charter, serif",
  "nimbus-sans": "\"Nimbus Sans\", Helvetica, Arial, sans-serif",
  liberation: "\"Liberation Sans\", Arial, sans-serif",
  "noto-mono": "\"Noto Sans Mono\", \"DejaVu Sans Mono\", monospace",
  "dejavu-sans": "\"DejaVu Sans\", sans-serif",
  "dejavu-serif": "\"DejaVu Serif\", serif",
  "dejavu-mono": "\"DejaVu Sans Mono\", monospace",
  "liberation-serif": "\"Liberation Serif\", \"Times New Roman\", serif",
  "liberation-mono": "\"Liberation Mono\", \"Courier New\", monospace",
  "liberation-narrow": "\"Liberation Sans Narrow\", \"Arial Narrow\", sans-serif",
  "nimbus-roman": "\"Nimbus Roman\", \"Times New Roman\", serif",
  "nimbus-mono": "\"Nimbus Mono PS\", \"Courier New\", monospace",
  "nimbus-narrow": "\"Nimbus Sans Narrow\", \"Arial Narrow\", sans-serif",
  p052: "P052, Palatino, serif"
};

const TRENDING_ICON_FILTERS = {
  cool: "brightness(0) saturate(100%) invert(66%) sepia(45%) " +
    "saturate(1200%) hue-rotate(165deg) brightness(98%) contrast(96%)",
  green: "brightness(0) saturate(100%) invert(68%) sepia(34%) " +
    "saturate(900%) hue-rotate(48deg) brightness(93%) contrast(88%)",
  warm: "brightness(0) saturate(100%) invert(70%) sepia(82%) " +
    "saturate(1400%) hue-rotate(338deg) brightness(101%) contrast(96%)",
  pink: "brightness(0) saturate(100%) invert(66%) sepia(54%) " +
    "saturate(1500%) hue-rotate(295deg) brightness(102%) contrast(98%)",
  purple: "brightness(0) saturate(100%) invert(57%) sepia(45%) " +
    "saturate(2100%) hue-rotate(228deg) brightness(99%) contrast(96%)",
  neutral: "brightness(0) saturate(100%) invert(78%) sepia(9%) " +
    "saturate(500%) hue-rotate(170deg) brightness(94%) contrast(89%)"
};

const TRENDING_SCHEME_APPEARANCE = {
  "olive-garden": ["#dda15e", "#fefae0", "warm"],
  "deep-sea": ["#778da9", "#e0e1dd", "cool"],
  "fiery-red-sunset": ["#f48c06", "#ffba08", "warm"],
  "bold-berry": ["#da627d", "#f9dbbd", "pink"],
  "rustic-charm": ["#eb5e28", "#fffcf2", "warm"],
  "golden-twilight": ["#ffc300", "#ffd60a", "warm"],
  "light-steel": ["#adb5bd", "#f8f9fa", "neutral"],
  "vivid-nightfall": ["#c77dff", "#e0aaff", "purple"],
  "bold-hues": ["#4cc9f0", "#f72585", "purple"],
  "ocean-rose": ["#b56576", "#eaac8b", "pink"],
  "bright-green": ["#70e000", "#ccff33", "green"],
  "gothic-romance": ["#a9927d", "#f2f4f3", "neutral"],
  firelight: ["#ff7d00", "#ffecd1", "warm"],
  "cherry-blossom": ["#a4c78a", "#cbea34", "green"],
  "deep-sea-blue": ["#5c677d", "#979dac", "cool"],
  cyberpunk: ["#00e5ff", "#ff00a8", "cool"],
  "ice-fire": ["#00b4d8", "#ffbf69", "cool"],
  "copper-teal": ["#2a9d8f", "#e9c9a5", "green"],
  "acid-violet": ["#b8f500", "#e0aaff", "green"],
  "racing-stripe": ["#d90429", "#f5f5f5", "neutral"]
};

function applyTrendingSchemeAppearance(colorScheme) {
  const appearance = TRENDING_SCHEME_APPEARANCE[colorScheme];
  const properties = [
    "--dash-accent",
    "--dash-accent-rgb",
    "--dash-value",
    "--dash-icon-filter",
    "--dash-indicator-filter"
  ];
  if (!appearance) {
    properties.forEach((property) => {
      document.body.style.removeProperty(property);
    });
    return;
  }
  const [accent, value, filterName] = appearance;
  const rgb = accent.match(/[0-9a-f]{2}/gi)
    .map((component) => parseInt(component, 16))
    .join(", ");
  const filter = TRENDING_ICON_FILTERS[filterName];
  document.body.style.setProperty("--dash-accent", accent);
  document.body.style.setProperty("--dash-accent-rgb", rgb);
  document.body.style.setProperty("--dash-value", value);
  document.body.style.setProperty("--dash-icon-filter", filter);
  document.body.style.setProperty("--dash-indicator-filter", filter);
}

function rangeColorRole(range, index, ranges, minValue, maxValue) {
  if (["low", "normal", "medium", "high"].includes(range.role)) {
    return range.role;
  }
  const color = String(range.color || "").toLowerCase();
  const numbers = color.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  const [red = 0, green = 0, blue = 0] = numbers;
  if (blue > red * 1.25 && blue > green * 1.25) return "low";
  if (green > red * 1.2 && green > blue * 1.2) return "normal";
  if (red > 150 && green > 80 && green < red * 1.1) return "medium";
  if (red > green * 1.3 && red > blue * 1.3) {
    const midpoint = (Number(minValue) + Number(maxValue)) / 2;
    return Number(range.to) <= midpoint ? "low" : "high";
  }
  return ["low", "normal", "medium", "high"][
    Math.min(3, Math.round(index * 3 / Math.max(1, ranges.length - 1)))
  ];
}

function applyGaugeColors(gaugeColors = {}) {
  if (gaugeColors?.low && gaugeColors?.normal &&
      gaugeColors?.medium && gaugeColors?.high) {
    ["low", "normal", "medium", "high"].forEach((role) => {
      document.documentElement.style.setProperty(
        `--dash-${role}-color`,
        gaugeColors[role]
      );
    });
  }
  document.querySelectorAll("[data-highlights]").forEach((host) => {
    const colors = gaugeColors;
    if (!colors?.low || !colors?.normal || !colors?.medium || !colors?.high) {
      return;
    }
    if (!host.dataset.baseHighlights) {
      host.dataset.baseHighlights = host.dataset.highlights;
    }
    let ranges;
    try {
      ranges = JSON.parse(host.dataset.baseHighlights);
    } catch {
      return;
    }
    if (!Array.isArray(ranges)) return;
    const recolored = ranges.map((range, index) => ({
      ...range,
      role: rangeColorRole(
        range,
        index,
        ranges,
        host.dataset.minValue,
        host.dataset.maxValue
      ),
      color: colors[
        rangeColorRole(
          range,
          index,
          ranges,
          host.dataset.minValue,
          host.dataset.maxValue
        )
      ] || range.color
    }));
    host.dataset.highlights = JSON.stringify(recolored);
    const gauge = document.gauges?.find(
      (candidate) => candidate?.options?.renderTo === host
    );
    if (gauge) {
      gauge.options.highlights = recolored;
      dimGaugeHighlights(gauge);
      if (typeof gauge.draw === "function") gauge.draw();
    }
  });
  const tachColors = gaugeColors;
  const tach = document.getElementById("rpmbar");
  if (tach && tachColors) {
    ["low", "normal", "medium", "high"].forEach((role) => {
      tach.style.setProperty(`--tach-${role}-color`, tachColors[role]);
    });
    const stopColors = [
      ["rpm-gradient-low", tachColors.low],
      ["rpm-gradient-normal-start", tachColors.normal],
      ["rpm-gradient-normal-end", tachColors.normal],
      ["rpm-gradient-medium", tachColors.medium],
      ["rpm-gradient-high", tachColors.high]
    ];
    stopColors.forEach(([id, color]) => {
      const stop = document.getElementById(id);
      if (stop) stop.style.stopColor = color;
    });
  }
  if (gaugeColors?.low && gaugeColors?.normal &&
      gaugeColors?.medium && gaugeColors?.high) {
    document.documentElement.style.setProperty(
      "--dash-palette-low",
      gaugeColors.low
    );
    document.documentElement.style.setProperty(
      "--dash-palette-normal",
      gaugeColors.normal
    );
    document.documentElement.style.setProperty(
      "--dash-palette-medium",
      gaugeColors.medium
    );
    document.documentElement.style.setProperty(
      "--dash-palette-high",
      gaugeColors.high
    );
    document.documentElement.style.setProperty(
      "--gauge-peak-color",
      gaugeColors.low
    );
    document.documentElement.style.setProperty(
      "--boost-duty-color",
      gaugeColors.low
    );
    document.documentElement.style.setProperty(
      "--boost-target-low-color",
      gaugeColors.normal
    );
    document.documentElement.style.setProperty(
      "--boost-target-high-color",
      gaugeColors.high
    );
    [
      ["boost-gradient-low", gaugeColors.low],
      ["boost-gradient-green", gaugeColors.normal],
      ["boost-gradient-target", gaugeColors.medium],
      ["boost-gradient-over", gaugeColors.high],
      ["boost-gradient-high", gaugeColors.high]
    ].forEach(([id, color]) => {
      const stop = document.getElementById(id);
      if (stop) stop.style.stopColor = color;
    });
  }
}

function applyControllerState(state) {
  const displayMode = state?.displayMode === "night" ? "night" : "day";
  const colorSchemes = [
    "amber",
    "ice",
    "emerald",
    "violet",
    "crimson",
    "solar",
    "monochrome",
    "high-contrast",
    "catppuccin",
    "dracula",
    "nord",
    "gruvbox",
    "solarized",
    "fiery-ocean",
    "summer-breeze",
    "ocean-sunset",
    "summer-fun",
    "vibrant-tones",
    "sunny-beach",
    "fiery-palette",
    "pastel-rainbow",
    "color-fiesta",
    "watermelon",
    "daybreak",
    "neutral-harmony",
    "olive-garden",
    "deep-sea",
    "fiery-red-sunset",
    "bold-berry",
    "rustic-charm",
    "golden-twilight",
    "light-steel",
    "vivid-nightfall",
    "bold-hues",
    "ocean-rose",
    "bright-green",
    "gothic-romance",
    "firelight",
    "cherry-blossom",
    "deep-sea-blue",
    "cyberpunk",
    "ice-fire",
    "copper-teal",
    "acid-violet",
    "racing-stripe"
  ];
  const colorScheme = colorSchemes.includes(state?.colorScheme)
    ? state.colorScheme
    : "amber";
  const brightnessValue = Number(state?.brightness);
  const brightness = Number.isFinite(brightnessValue)
    ? Math.max(20, Math.min(100, brightnessValue))
    : 100;
  const savedOilChangeMiles = Number(state?.oilChangeMiles);
  const syncedOdometer = Number(state?.odometer);
  oilChangeMilesAtSync = Number.isFinite(savedOilChangeMiles)
    ? savedOilChangeMiles
    : null;
  oilChangeOdometerAtSync = Number.isFinite(syncedOdometer)
    ? syncedOdometer
    : null;
  maintenanceItemsAtSync = Object.fromEntries(
    Object.entries(state?.serviceItems || {}).map(([id, item]) => [
      id,
      {
        miles: Number(item?.miles) || 0,
        odometer: Number(item?.odometer) || syncedOdometer || 0
      }
    ])
  );
  controllerPersistenceEnabled = state?.persistenceEnabled === true;
  const peakResetSequence = Number(state?.peakResetSequence) || 0;
  if (
    lastPeakResetSequence !== null &&
    peakResetSequence !== lastPeakResetSequence
  ) {
    clearGaugePeaks();
    tachometer.clearPeak();
    map.clearPeak();
  }
  lastPeakResetSequence = peakResetSequence;
  const dashboardFont = DASHBOARD_FONT_STACKS[state?.dashboardFont]
    ? state.dashboardFont
    : "orbitron";
  const appearanceSignature = JSON.stringify({
    displayMode,
    displayInverted: state?.displayInverted === true,
    colorScheme,
    dashboardFont,
    gaugeColors: state?.gaugeColors
  });
  if (appearanceSignature !== lastControllerAppearanceSignature) {
    lastControllerAppearanceSignature = appearanceSignature;
    document.body.classList.toggle(
      "display-inverted",
      state?.displayInverted === true
    );
    document.body.classList.toggle("night-mode", displayMode === "night");
    document.body.classList.toggle("day-mode", displayMode === "day");
    colorSchemes.forEach((scheme) => {
      document.body.classList.toggle(
        `color-scheme-${scheme}`,
        scheme === colorScheme
      );
    });
    applyTrendingSchemeAppearance(colorScheme);
    document.body.dataset.displayMode = displayMode;
    document.body.dataset.colorScheme = colorScheme;
    document.body.dataset.dashboardFont = dashboardFont;
    document.documentElement.style.setProperty(
      "--dashboard-font",
      DASHBOARD_FONT_STACKS[dashboardFont]
    );
    const displayModeIndicator = document.getElementById(
      "display-mode-indicator"
    );
    const displayModeLabel = document.getElementById("display-mode-label");
    if (displayModeIndicator) {
      displayModeIndicator.dataset.mode = displayMode;
      displayModeIndicator.setAttribute(
        "aria-label",
        `${displayMode === "night" ? "Night" : "Day"} display mode`
      );
    }
    if (displayModeLabel) {
      displayModeLabel.textContent = displayMode === "night" ? "NIGHT" : "DAY";
    }
    applyGaugeColors(state?.gaugeColors);
    engineDetails.applyTheme();
  }
  const screenSaver = state?.screenSaver || "starfield";
  if (screenSaver !== lastControllerScreenSaver) {
    lastControllerScreenSaver = screenSaver;
    document.body.dataset.screenSaver = screenSaver;
  }
  if (brightness !== lastControllerBrightness) {
    lastControllerBrightness = brightness;
    document.documentElement.style.setProperty(
      "--dashboard-brightness",
      String(brightness / 100)
    );
  }
  updateOilServiceIndicator(updateData[DATA_MAP.CURRENT_ODOMETER.id]);
  const requestedPage = state?.dashboardPage || "main";
  if (requestedPage !== lastControllerPage) {
    lastControllerPage = requestedPage;
    selectDashboardPage(requestedPage);
  }
}

async function initializeControllerState() {
  try {
    const response = await fetch("/api/controller/state", {
      cache: "no-store"
    });
    if (!response.ok) return;
    applyControllerState(await response.json());
  } catch (error) {
    console.warn("Unable to load controller state", error);
  }
}

function initializeBoostModeBanner() {
  const banner = document.getElementById("boost-mode-banner");
  if (!banner) return;
  window.addEventListener("boost-mode-change", (event) => {
    const highBoostMode = Boolean(event.detail?.high);
    banner.textContent = highBoostMode ? "HIGH BOOST" : "LOW BOOST";
    banner.classList.toggle("high-boost-banner", highBoostMode);
    banner.classList.toggle("low-boost-banner", !highBoostMode);
    banner.classList.remove("visible");
    // Force a fresh transition when modes change again before the prior
    // banner has completely faded.
    void banner.offsetWidth;
    banner.classList.add("visible");
    if (boostModeBannerTimer) clearTimeout(boostModeBannerTimer);
    boostModeBannerTimer = setTimeout(() => {
      banner.classList.remove("visible");
    }, 1800);
  });
}

function initializeEngineAlertBanner() {
  const banner = document.getElementById("engine-alert-banner");
  if (!banner) return;
  window.addEventListener("engine-alert", (event) => {
    banner.textContent = String(event.detail?.message || "ENGINE ALERT");
    banner.classList.remove("visible");
    void banner.offsetWidth;
    banner.classList.add("visible");
    if (engineAlertBannerTimer) clearTimeout(engineAlertBannerTimer);
    engineAlertBannerTimer = setTimeout(() => {
      banner.classList.remove("visible");
    }, 2600);
  });
}

function numberValue(dataKey) {
  const value = Number(updateData[dataKey.id]);
  return Number.isFinite(value) ? value : 0;
}

function beginDriveSession(now) {
  engineDetails.startSession();
  status.startSession();
  driveSession = {
    startedAt: now,
    lastDataAt: now,
    lastSampleAt: now,
    lastWallSampleAt: Date.now(),
    idleMilliseconds: 0,
    startFuel: numberValue(DATA_MAP.FUEL_GALLONS_USED),
    endFuel: numberValue(DATA_MAP.FUEL_GALLONS_USED),
    fuelUsed: 0,
    lastTripFuel: numberValue(DATA_MAP.FUEL_GALLONS_USED),
    lastTankFuel: numberValue(DATA_MAP.FUEL_GALLONS_SINCE_REFILL),
    lastFuelPercent: Math.max(0, numberValue(DATA_MAP.FUEL_LEVEL)),
    lowestFuelPercentSinceRefill: Math.max(0, numberValue(DATA_MAP.FUEL_LEVEL)),
    refills: [],
    startOdometer: numberValue(DATA_MAP.CURRENT_ODOMETER),
    endOdometer: numberValue(DATA_MAP.CURRENT_ODOMETER),
    maxRpm: 0,
    maxMap: 0,
    maxBoostPsi: 0,
    boostMilliseconds: 0,
    maxTpsDot: 0,
    maxClt: 0,
    cltTotal: 0,
    cltSamples: 0,
    maxSpeed: 0,
    minMat: Infinity,
    maxMat: -Infinity,
    matTotal: 0,
    matSamples: 0,
    minOilTemp: Infinity,
    maxOilTemp: -Infinity,
    oilTempTotal: 0,
    oilTempSamples: 0,
    minVoltage: Infinity,
    voltageTotal: 0,
    voltageSamples: 0,
    afrTotal: 0,
    afrSamples: 0,
    ecoTotal: 0,
    ecoSamples: 0,
    ecoBest: 0,
    ecoEfficientSamples: 0,
    ecoLowSamples: 0,
    reportedAverageMpg: 0
  };
}

function recordDriveSample() {
  const now = Number.isFinite(latestVehicleTime) ? latestVehicleTime : Date.now();
  const rpm = numberValue(DATA_MAP.RPM);
  if (!driveSession && rpm > 0) beginDriveSession(now);
  if (!driveSession) return;
  const wallNow = Date.now();
  const vehicleDelta = now - driveSession.lastSampleAt;
  const continuousSample = wallNow - driveSession.lastWallSampleAt <= 500;
  if (
    continuousSample &&
    vehicleDelta > 0 &&
    rpm > 0 &&
    numberValue(DATA_MAP.SPEEDO) < 1
  ) {
    driveSession.idleMilliseconds += vehicleDelta;
  }
  driveSession.lastSampleAt = now;
  driveSession.lastWallSampleAt = wallNow;
  driveSession.lastDataAt = now;
  const tripFuel = numberValue(DATA_MAP.FUEL_GALLONS_USED);
  const tripFuelDelta = tripFuel - driveSession.lastTripFuel;
  if (tripFuelDelta >= 0 && tripFuelDelta < 0.25) {
    driveSession.fuelUsed += tripFuelDelta;
  }
  driveSession.lastTripFuel = tripFuel;
  driveSession.endFuel = tripFuel;

  const tankFuel = numberValue(DATA_MAP.FUEL_GALLONS_SINCE_REFILL);
  const fuelPercent = numberValue(DATA_MAP.FUEL_LEVEL);
  const tankCounterReset =
    driveSession.lastTankFuel > 0.05 &&
    tankFuel < driveSession.lastTankFuel - 0.05 &&
    tankFuel < 0.1;
  if (tankCounterReset) {
    driveSession.refills.push({
      at: now,
      beforePercent: driveSession.lowestFuelPercentSinceRefill,
      afterPercent: fuelPercent,
      gallonsBeforeRefill: driveSession.lastTankFuel
    });
    driveSession.lowestFuelPercentSinceRefill = fuelPercent;
  } else if (driveSession.refills.length > 0) {
    const latestRefill = driveSession.refills[driveSession.refills.length - 1];
    latestRefill.afterPercent = Math.max(latestRefill.afterPercent, fuelPercent);
    driveSession.lowestFuelPercentSinceRefill = Math.min(
      driveSession.lowestFuelPercentSinceRefill,
      fuelPercent
    );
  } else {
    driveSession.lowestFuelPercentSinceRefill = Math.min(
      driveSession.lowestFuelPercentSinceRefill,
      fuelPercent
    );
  }
  driveSession.lastTankFuel = tankFuel;
  driveSession.lastFuelPercent = fuelPercent;
  driveSession.endOdometer = numberValue(DATA_MAP.CURRENT_ODOMETER);
  driveSession.maxRpm = Math.max(driveSession.maxRpm, rpm);
  const mapKpa = numberValue(DATA_MAP.MAP);
  const reportedBaroKpa = numberValue(DATA_MAP.BARO);
  const baroKpa = reportedBaroKpa > 0
    ? reportedBaroKpa
    : ATMOSPHERIC_PRESSURE_KPA;
  driveSession.maxMap = Math.max(driveSession.maxMap, mapKpa);
  const boostPsi = Math.max(
    0,
    (mapKpa - baroKpa) * KPA_TO_PSI
  );
  driveSession.maxBoostPsi = Math.max(driveSession.maxBoostPsi, boostPsi);
  if (
    continuousSample &&
    vehicleDelta > 0 &&
    rpm > 0 &&
    mapKpa > baroKpa
  ) {
    driveSession.boostMilliseconds += vehicleDelta;
  }
  driveSession.maxTpsDot = Math.max(
    driveSession.maxTpsDot,
    numberValue(DATA_MAP.TPS_DOT)
  );
  const clt = numberValue(DATA_MAP.CTS);
  driveSession.maxClt = Math.max(driveSession.maxClt, clt);
  if (clt !== 0) {
    driveSession.cltTotal += clt;
    driveSession.cltSamples += 1;
  }
  driveSession.maxSpeed = Math.max(
    driveSession.maxSpeed,
    numberValue(DATA_MAP.SPEEDO)
  );
  const mat = numberValue(DATA_MAP.MAT);
  if (mat !== 0) {
    driveSession.minMat = Math.min(driveSession.minMat, mat);
    driveSession.maxMat = Math.max(driveSession.maxMat, mat);
    driveSession.matTotal += mat;
    driveSession.matSamples += 1;
  }
  const oilTemp = numberValue(DATA_MAP.SENSOR3);
  if (oilTemp !== 0) {
    driveSession.minOilTemp = Math.min(driveSession.minOilTemp, oilTemp);
    driveSession.maxOilTemp = Math.max(driveSession.maxOilTemp, oilTemp);
    driveSession.oilTempTotal += oilTemp;
    driveSession.oilTempSamples += 1;
  }
  const voltage = numberValue(DATA_MAP.VOLT);
  if (voltage > 0) {
    driveSession.minVoltage = Math.min(driveSession.minVoltage, voltage);
    driveSession.voltageTotal += voltage;
    driveSession.voltageSamples += 1;
  }
  driveSession.reportedAverageMpg = numberValue(DATA_MAP.AVERAGE_MPG);
  const rawAfr = numberValue(DATA_MAP.AFR);
  const currentAfr = rawAfr / 10;
  if (currentAfr >= 7 && currentAfr <= 30) {
    driveSession.afrTotal += currentAfr;
    driveSession.afrSamples += 1;
  }
  const ecoScore = numberValue(DATA_MAP.ECO);
  if (ecoScore > 0 && ecoScore <= 100) {
    driveSession.ecoTotal += ecoScore;
    driveSession.ecoSamples += 1;
    driveSession.ecoBest = Math.max(driveSession.ecoBest, ecoScore);
    if (ecoScore >= 70) driveSession.ecoEfficientSamples += 1;
    if (ecoScore < 40) driveSession.ecoLowSamples += 1;
  }
}

function setSummaryText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function formatIdleDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function showDriveSummary(force = false) {
  if (!driveSession && force) {
    beginDriveSession(
      Number.isFinite(latestVehicleTime) ? latestVehicleTime : Date.now()
    );
  }
  if (!driveSession || (summaryVisible && !force)) return;
  const overlay = document.getElementById("drive-summary-overlay");
  if (!overlay) return;
  const duration = driveSession.lastDataAt - driveSession.startedAt;
  const fuelUsed = Math.max(0, driveSession.fuelUsed);
  const distance = Math.max(
    0,
    driveSession.endOdometer - driveSession.startOdometer
  );
  const calculatedMpg = fuelUsed > 0.001
    ? distance / fuelUsed
    : driveSession.reportedAverageMpg;
  const fuelPercent = numberValue(DATA_MAP.FUEL_LEVEL);
  const senderConnected = numberValue(DATA_MAP.FUEL_SENDER_CONNECTED) === 1;
  const tankFuelUsed = numberValue(DATA_MAP.FUEL_GALLONS_SINCE_REFILL);
  const backendRemainingValue = Number(
    updateData[DATA_MAP.FUEL_GALLONS_REMAINING.id]
  );
  const backendRemainingFuel = Number.isFinite(backendRemainingValue)
    ? backendRemainingValue
    : -1;
  const fallbackTankFuelUsed = tankFuelUsed > 0 ? tankFuelUsed : driveSession.fuelUsed;
  const remainingFuel = backendRemainingFuel >= 0
    ? Math.min(TANK_CAPACITY_GALLONS, backendRemainingFuel)
    : senderConnected && Number.isFinite(fuelPercent) && fuelPercent >= 0
      ? Math.max(
        0,
        Math.min(TANK_CAPACITY_GALLONS, fuelPercent / 100 * TANK_CAPACITY_GALLONS)
      )
      : Math.max(
        0,
        TANK_CAPACITY_GALLONS - fallbackTankFuelUsed
      );
  const historicalMpg = numberValue(DATA_MAP.HISTORICAL_MPG);
  const rangeMpg = calculatedMpg > 0
    ? calculatedMpg
    : historicalMpg > 0
      ? historicalMpg
      : 0;
  const estimatedRange = remainingFuel * rangeMpg;
  const averageAfr = driveSession.afrSamples > 0
    ? driveSession.afrTotal / driveSession.afrSamples
    : null;
  const averageEco = driveSession.ecoSamples > 0
    ? driveSession.ecoTotal / driveSession.ecoSamples
    : null;
  const averageClt = driveSession.cltSamples > 0
    ? driveSession.cltTotal / driveSession.cltSamples
    : null;
  const averageMat = driveSession.matSamples > 0
    ? driveSession.matTotal / driveSession.matSamples
    : null;
  const averageOilTemp = driveSession.oilTempSamples > 0
    ? driveSession.oilTempTotal / driveSession.oilTempSamples
    : null;
  const averageVoltage = driveSession.voltageSamples > 0
    ? driveSession.voltageTotal / driveSession.voltageSamples
    : null;
  const efficientPercent = driveSession.ecoSamples > 0
    ? driveSession.ecoEfficientSamples / driveSession.ecoSamples * 100
    : null;
  const lowEcoPercent = driveSession.ecoSamples > 0
    ? driveSession.ecoLowSamples / driveSession.ecoSamples * 100
    : null;
  setSummaryText("drive-summary-duration", formatDuration(duration));
  setSummaryText(
    "drive-summary-idle-time",
    formatIdleDuration(driveSession.idleMilliseconds)
  );
  setSummaryText("drive-summary-rpm", Math.round(driveSession.maxRpm));
  setSummaryText("drive-summary-map", `${driveSession.maxMap.toFixed(1)} kPa`);
  setSummaryText(
    "drive-summary-boost-max",
    `${driveSession.maxBoostPsi.toFixed(1)} psi`
  );
  setSummaryText(
    "drive-summary-boost-time",
    formatIdleDuration(driveSession.boostMilliseconds)
  );
  setSummaryText("drive-summary-tpsdot", `${driveSession.maxTpsDot.toFixed(1)} %/s`);
  setSummaryText("drive-summary-clt", `${Math.round(driveSession.maxClt)}°`);
  setSummaryText(
    "drive-summary-clt-average",
    averageClt === null ? "--" : `${Math.round(averageClt)}°`
  );
  setSummaryText("drive-summary-speed", `${driveSession.maxSpeed.toFixed(1)} mph`);
  setSummaryText("drive-summary-distance", `${distance.toFixed(1)} mi`);
  setSummaryText("drive-summary-fuel", `${fuelUsed.toFixed(2)} gal`);
  setSummaryText(
    "drive-summary-fuel-remaining",
    `${remainingFuel.toFixed(1)} gal`
  );
  setSummaryText(
    "drive-summary-range",
    rangeMpg > 0 ? `${Math.round(estimatedRange)} mi` : "--"
  );
  const refillSummary = document.getElementById("drive-summary-refill");
  if (refillSummary) {
    const refillCount = driveSession.refills.length;
    refillSummary.classList.toggle("visible", refillCount > 0);
    if (refillCount > 0) {
      const latestRefill = driveSession.refills[refillCount - 1];
      setSummaryText("drive-summary-refill-count", String(refillCount));
      setSummaryText(
        "drive-summary-refill-level",
        `${Math.round(latestRefill.beforePercent)}% → ${Math.round(latestRefill.afterPercent)}%`
      );
      setSummaryText(
        "drive-summary-refill-counter",
        `${latestRefill.gallonsBeforeRefill.toFixed(2)} gal`
      );
    }
  }
  setSummaryText(
    "drive-summary-mpg",
    calculatedMpg > 0 ? calculatedMpg.toFixed(1) : "--"
  );
  setSummaryText(
    "drive-summary-afr-average",
    averageAfr === null ? "--" : averageAfr.toFixed(1)
  );
  setSummaryText(
    "drive-summary-mat",
    Number.isFinite(driveSession.minMat) && Number.isFinite(driveSession.maxMat)
      ? `${Math.round(driveSession.minMat)}–${Math.round(driveSession.maxMat)}°`
      : "--"
  );
  setSummaryText(
    "drive-summary-mat-average",
    averageMat === null ? "--" : `${Math.round(averageMat)}°`
  );
  setSummaryText(
    "drive-summary-oil-temp",
    Number.isFinite(driveSession.minOilTemp) &&
      Number.isFinite(driveSession.maxOilTemp)
      ? `${Math.round(driveSession.minOilTemp)}–${Math.round(driveSession.maxOilTemp)}°`
      : "--"
  );
  setSummaryText(
    "drive-summary-oil-temp-average",
    averageOilTemp === null ? "--" : `${Math.round(averageOilTemp)}°`
  );
  setSummaryText(
    "drive-summary-voltage",
    Number.isFinite(driveSession.minVoltage)
      ? `${driveSession.minVoltage.toFixed(1)} V`
      : "--"
  );
  setSummaryText(
    "drive-summary-voltage-average",
    averageVoltage === null ? "--" : `${averageVoltage.toFixed(1)} V`
  );
  setSummaryText(
    "drive-summary-eco-average",
    averageEco === null ? "--" : `${averageEco.toFixed(0)} / 100`
  );
  setSummaryText(
    "drive-summary-eco-best",
    driveSession.ecoSamples > 0 ? `${driveSession.ecoBest.toFixed(0)} / 100` : "--"
  );
  setSummaryText(
    "drive-summary-eco-efficient",
    efficientPercent === null ? "--" : `${efficientPercent.toFixed(0)}%`
  );
  setSummaryText(
    "drive-summary-eco-low",
    lowEcoPercent === null ? "--" : `${lowEcoPercent.toFixed(0)}%`
  );

  const aeContainer = document.getElementById("drive-summary-ae");
  if (aeContainer) {
    aeContainer.replaceChildren(...engineDetails.getSessionSummary().map((stat) => {
      const item = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = `${stat.bin} %/s · ${stat.hits.toFixed(1)} hits`;
      value.textContent = stat.averageAfrDelta === null
        ? "-- AFR"
        : `${stat.averageAfrDelta >= 0 ? "+" : ""}${stat.averageAfrDelta.toFixed(1)} AFR`;
      value.style.color = stat.averageAfrDelta > 0.5
        ? "var(--dash-high-color)"
        : (stat.averageAfrDelta < -0.5
          ? "var(--dash-low-color)"
          : "var(--dash-normal-color)");
      item.append(label, value);
      return item;
    }));
  }
  const warningContainer = document.getElementById("drive-summary-warnings");
  if (warningContainer) {
    const warningEvents = status.getSessionSummary();
    if (warningEvents.length === 0) {
      const item = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = "NO WARNINGS";
      value.textContent = "CLEAR DRIVE";
      item.append(label, value);
      warningContainer.replaceChildren(item);
    } else {
      warningContainer.replaceChildren(...warningEvents.map((event) => {
        const item = document.createElement("div");
        const label = document.createElement("span");
        const value = document.createElement("strong");
        label.textContent = event.count > 1
          ? `${event.label} ×${event.count}`
          : event.label;
        value.textContent = `${event.detail} · ${Math.round(event.rpm)} RPM`;
        item.append(label, value);
        return item;
      }));
    }
  }
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
  summaryVisible = true;
}

function hideDriveSummary() {
  const overlay = document.getElementById("drive-summary-overlay");
  if (overlay) {
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
  }
  summaryVisible = false;
}

// --------------------------------------------------
function reinitGauges() {
  tachometer.initialize();
  speedo.initialize();
  clt.initialize();
  tps.initialize();
  mat.initialize();
  eco.initialize();
  tpsdot.initialize();
  pw.initialize();
  volt.initialize();
  map.initialize();
  adv.initialize();
  status.initialize();
  afr.initialize();
  ego.initialize();
  sensors.initialize();
  fuel.initialize();
  canIndicator.initialize();
  engineDetails.initialize();
}

function setElementsOpacity(ids, opacity) {
  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.style.transition = "opacity 0.3s ease";
      element.style.opacity = opacity;
    }
  });
}

function setDashboardOpacity(opacity) {
  setElementsOpacity(
    [
      "left",
      "right",
      "rpmbar",
      "boost-combo-gauge",
      "main_container1",
      "main_container2"
    ],
    opacity
  );
  setElementsOpacity(["galdisplay", "mpgdisplay", "odometer"], opacity);
}

// --------------------------------------------------
// COMMUNICATIONS WATCHDOG
// --------------------------------------------------
const checkCommunications = () => {
  const sinceLastPacket = Date.now() - lastPacketTime;
  isWatchdogTripped = sinceLastPacket > AUTO_REFRESH_TIMEOUT ? 1 : 0;

  const commLost = isCommError === 1 || isWatchdogTripped === 1;

  if (commLost) {
    if (sinceLastPacket >= DRIVE_SUMMARY_CAN_SILENCE) showDriveSummary();
  }

  if (commLost && !commsDead) {
    console.warn("[DASH] Communications lost → full reinit");

    commsDead = true;
    canReady = false;
    hasNewData = false;

    setDashboardOpacity("0.3");

    reinitGauges();
  }
};

// --------------------------------------------------
// RENDER ONLY WHEN FRESH DATA ARRIVES
// --------------------------------------------------
const renderDashboard = () => {
  renderScheduled = false;
  checkCommunications();

  if (
    canReady &&
    !commsDead &&
    isCommError === 0 &&
    isWatchdogTripped === 0 &&
    hasNewData
  ) {
    hasNewData = false;
    counter = (counter + 1) % 5;

    const rpm = updateData[DATA_MAP.RPM.id];
    setStarfieldVehicleSpeed(updateData[DATA_MAP.SPEEDO.id]);
    updateGearIndicator(rpm, updateData[DATA_MAP.SPEEDO.id]);
    setScreenSaverEngineData(
      rpm,
      updateData[DATA_MAP.MAP.id],
      updateData[DATA_MAP.TPS.id],
      updateData[DATA_MAP.AE_AMOUNT.id]
    );
    updateOilServiceIndicator(
      updateData[DATA_MAP.CURRENT_ODOMETER.id]
    );
    if (dashboardPage !== "main") updateControllerPageValues();
    if (
      dashboardPage === "drive-summary" &&
      Date.now() - lastPinnedSummaryRefresh >= 1000
    ) {
      lastPinnedSummaryRefresh = Date.now();
      showDriveSummary(true);
    }
    tachometer.update(
      rpm,
      updateData[DATA_MAP.BOOST_TARGET.id],
      updateData[DATA_MAP.TPS.id],
      isCommError
    );

    try {
      map.update(
        updateData[DATA_MAP.MAP.id],
        updateData[DATA_MAP.BOOST_TARGET.id],
        updateData[DATA_MAP.BARO.id],
        updateData[DATA_MAP.BOOST_CONTROLLER_DUTY.id],
        isCommError
      );
    } catch {}
    try { afr.update(updateData[DATA_MAP.AFR.id], isCommError); } catch {}
    try { ego.update(updateData[DATA_MAP.EGO.id], isCommError); } catch {}
    try { tpsdot.update(updateData[DATA_MAP.TPS_DOT.id], isCommError); } catch {}
    try { pw.update(updateData[DATA_MAP.PW1.id], isCommError); } catch {}
    try {
      engineDetails.update(
        updateData[DATA_MAP.IDLE_POSITION.id],
        updateData[DATA_MAP.AE_AMOUNT.id],
        updateData[DATA_MAP.EAE1.id],
        updateData[DATA_MAP.TPS_DOT.id],
        updateData[DATA_MAP.AFR.id],
        isCommError
      );
    } catch {}

    if (counter === 0) {
      try {
        fuel.update(
          updateData[DATA_MAP.FUEL_LEVEL.id],
          updateData[DATA_MAP.FUEL_GALLONS_USED.id],
          updateData[DATA_MAP.FUEL_GALLONS_SINCE_REFILL.id],
          updateData[DATA_MAP.FUEL_GALLONS_REMAINING.id],
          updateData[DATA_MAP.AVERAGE_MPG.id],
          updateData[DATA_MAP.HISTORICAL_MPG.id],
          updateData[DATA_MAP.FUEL_SENDER_CONNECTED.id],
          isCommError
        );
      } catch {}

      try {
        speedo.update(
          updateData[DATA_MAP.SPEEDO.id],
          updateData[DATA_MAP.CURRENT_ODOMETER.id],
          updateData[DATA_MAP.TRIP_ODOMETER.id],
          updateData[DATA_MAP.CURRENT_MPG.id],
          updateData[DATA_MAP.AVERAGE_MPG.id],
          updateData[DATA_MAP.HISTORICAL_MPG.id],
          isCommError
        );
      } catch {}
    }

    if (counter === 1) {
      try { clt.update(updateData[DATA_MAP.CTS.id], isCommError); } catch {}
      try { tps.update(updateData[DATA_MAP.TPS.id], isCommError); } catch {}
      try { mat.update(updateData[DATA_MAP.MAT.id], isCommError); } catch {}
    }

    if (counter === 2) {
      try { eco.update(updateData[DATA_MAP.ECO.id], isCommError); } catch {}
      try { volt.update(updateData[DATA_MAP.VOLT.id], isCommError); } catch {}
      try { adv.update(updateData[DATA_MAP.ADV.id], isCommError); } catch {}
    }

    if (counter === 3) {
      try {
        status.update(
          updateData[DATA_MAP.ENGINE.id],
          updateData[DATA_MAP.STATUS1.id],
          updateData[DATA_MAP.STATUS2.id],
          updateData[DATA_MAP.STATUS3.id],
          updateData[DATA_MAP.STATUS4.id],
          updateData[DATA_MAP.STATUS5.id],
          updateData[DATA_MAP.STATUS6.id],
          updateData[DATA_MAP.STATUS7.id],
          updateData[DATA_MAP.STATUS8.id],
          isCommError,
          updateData[DATA_MAP.RPM.id],
          updateData[DATA_MAP.SENSOR2.id],
          updateData[DATA_MAP.SENSOR3.id],
          updateData[DATA_MAP.SENSOR4.id],
          updateData[DATA_MAP.MAP.id],
          updateData[DATA_MAP.TPS.id],
          updateData[DATA_MAP.AFR.id],
          updateData[DATA_MAP.SPEEDO.id],
          latestVehicleTime
        );
      } catch { console.log('status err'); }
    }

    if (counter === 4) {
      try {
        sensors.update(
          updateData[DATA_MAP.SENSOR1.id],
          updateData[DATA_MAP.SENSOR2.id],
          updateData[DATA_MAP.SENSOR3.id],
          updateData[DATA_MAP.SENSOR4.id],
          isCommError
        );
      } catch {}
    }
  }
};

const scheduleRender = () => {
  if (renderScheduled) return;

  renderScheduled = true;
  requestAnimationFrame(renderDashboard);
};

// --------------------------------------------------
// INIT
// --------------------------------------------------
const initializeApp = () => {
  initializeAfrMap();
  initializeBoostDutyMap();
  initializeStarfield();
  initializeDashboardClock();
  moveAeGaugeToTuningPage();
  initializeControllerState();
  initializeBoostModeBanner();
  initializeEngineAlertBanner();
  dataWorker.postMessage({ msg: "start" });
  initializeNativeRadialGauges();
  initializeNativeLinearGauges();
  reinitGauges();
  checkCommunications();
  setInterval(checkCommunications, WATCHDOG_INTERVAL);
  // Controller appearance must not depend solely on the CAN websocket. The
  // dashboard can be opened by IP or a development hostname while that socket
  // still targets the vehicle hostname.
  setInterval(initializeControllerState, 2000);
  setInterval(updateControllerHealthPage, 1000);
};

// --------------------------------------------------
// WORKER HANDLER
// --------------------------------------------------
dataWorker.onmessage = (event) => {
  switch (event.data.msg) {
    case "comm_error":
      isCommError = event.data.value ? 1 : 0;
      canIndicator.update(isCommError);
      checkCommunications();
      return;

    case "comm_reconnected":
      lastPacketTime = Date.now();
      reinitGauges();
      checkCommunications();
      return;

    case "update_data_ready":
      if (summaryVisible && dashboardPage !== "drive-summary") {
        hideDriveSummary();
        driveSession = null;
      }
      lastPacketTime = Date.now();
      updateData = event.data.updateData;
      recordDriveSample();
      hasNewData = true;

      // A decoded packet is proof of life. The backend only publishes packets
      // while CAN data is fresh, so do not block the whole dashboard waiting
      // for a particular sensor frame (such as battery voltage).
      if (!canReady && Array.isArray(updateData) && updateData.length > 0) {
        canReady = true;
        commsDead = false;
        setDashboardOpacity("1");
        canIndicator.update(false);
        console.log("[DASH] CAN ready");
      }
      scheduleRender();
      return;

    case "analysis_sample": {
      const sample = event.data.sample;
      const sampleTime = Number(sample.timestampMs);
      if (Number.isFinite(sampleTime)) latestVehicleTime = sampleTime;
      if (sample.source === "afr") {
        recordAfrMapSample(
          sample.rpm,
          sample.map,
          sample.afr,
          sample.afrTarget
        );
      }
      if (sample.source === "boost") {
        recordBoostDutyMapSample(
          sample.rpm,
          sample.map,
          sample.boostDuty
        );
      }
      engineDetails.sample(
        sample.aeAmount,
        sample.eae1,
        sample.tpsDot,
        sample.afr,
        false,
        sample.source,
        sample.timestampMs
      );
      return;
    }

    case "controller_state":
      applyControllerState(event.data.state);
      return;

    case "controller_event":
      if (event.data.event === "trip_reset") {
        resetFrontendTripSession();
      }
      return;

    case "error":
      console.error("[Worker ERROR]", event.data);
      return;
  }
};

// --------------------------------------------------
initializeApp();
