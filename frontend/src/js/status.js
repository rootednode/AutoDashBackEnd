//
// status.js — MS3 engine + status bitfield decoding with debug
//

import {
  ATMOSPHERIC_PRESSURE_KPA,
  KPA_TO_PSI
} from "./common/vehicleConfig";

// -------------------------------------------------------------
// DEBUG SETTINGS
// -------------------------------------------------------------

const DEBUG_STATUS = false;

// 1 = log every update.
// 10/25/50 = less spam.
const LOG_EVERY_N_UPDATES = 1;

let updateCounter = 0;
let lastDebugSignature = "";
const missingIndicatorsLogged = new Set();
const OIL_WARNING_DEBOUNCE_MS = 750;
const FUEL_WARNING_DEBOUNCE_MS = 750;
const AFR_WARNING_DEBOUNCE_MS = 500;
const ENGINE_RUNNING_RPM = 500;
const ENGINE_WARNING_GRACE_MS = 2_000;
const MIN_FUEL_DIFFERENTIAL_PSI = 35;
let sessionWarningLatched = false;
let lowOilSince = null;
let lowFuelPressureSince = null;
let leanSince = null;
let rememberedWarningLabel = "WARN";
let activeEventCodes = new Set();
let warningHistory = [];
let overheatAlertActive = false;
let oilPressureAlertActive = false;
let engineReadySince = null;

// -------------------------------------------------------------
// INDICATOR HELPERS
// -------------------------------------------------------------

function toByte(value) {
  const n = Number(value);
  return Number.isFinite(n) ? (n & 0xff) : 0;
}

function toWord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? (n & 0xffff) : 0;
}

function hasBit(value, mask) {
  return (toByte(value) & mask) !== 0;
}

function setIndicator(id, on) {
  const el = document.getElementById(id);

  if (!el) {
    if (DEBUG_STATUS && !missingIndicatorsLogged.has(id)) {
      missingIndicatorsLogged.add(id);
      console.log(`[status.js] Missing element for indicator: ${id}`, {
        id,
        found: null,
      });
    }
    return;
  }

  el.style.opacity = on ? "1" : ".3";
  el.classList.toggle("indicator-active", on && el.classList.contains("icon-warn"));

  if (DEBUG_STATUS) {
    console.log(`[status.js] indicator ${id}: ${on ? "ON" : "off"}`);
  }
}

function setOilPressureWarning(on) {
  const container = document.getElementById("oilpsi_container");
  if (container) container.classList.toggle("oil-pressure-warning", on);
}

function setAfrWarning(on) {
  const container = document.getElementById("afr_container");
  if (container) container.classList.toggle("afr-warning", on);
  document.body.classList.toggle("afr-warning-active", on);
}

function setWarningLabel(label) {
  const element = document.getElementById("warning-label");
  if (element) element.textContent = label || "WARN";
}

function showEngineAlert(message) {
  window.dispatchEvent(new CustomEvent("engine-alert", {
    detail: { message }
  }));
}

function requiredOilPressure(rpm) {
  if (!Number.isFinite(rpm) || rpm < ENGINE_RUNNING_RPM) return 0;
  return Math.max(10, Math.min(55, rpm / 100));
}

function oilPressureWarning(rpm, oilPressure, now) {
  const required = requiredOilPressure(rpm);
  if (required === 0 || !Number.isFinite(oilPressure)) {
    lowOilSince = null;
    return false;
  }

  if (oilPressure >= required) {
    lowOilSince = null;
    return false;
  }

  if (lowOilSince === null) lowOilSince = now;
  return now - lowOilSince >= OIL_WARNING_DEBOUNCE_MS;
}

function fuelPressureWarning(rpm, mapKpa, fuelPressure, now) {
  if (
    !Number.isFinite(rpm) || rpm < 1_000 ||
    !Number.isFinite(mapKpa) || !Number.isFinite(fuelPressure)
  ) {
    lowFuelPressureSince = null;
    return { active: false, differential: null };
  }

  const manifoldGaugePsi =
    (mapKpa - ATMOSPHERIC_PRESSURE_KPA) * KPA_TO_PSI;
  const differential = fuelPressure - manifoldGaugePsi;
  if (differential >= MIN_FUEL_DIFFERENTIAL_PSI) {
    lowFuelPressureSince = null;
    return { active: false, differential };
  }

  if (lowFuelPressureSince === null) lowFuelPressureSince = now;
  return {
    active: now - lowFuelPressureSince >= FUEL_WARNING_DEBOUNCE_MS,
    differential
  };
}

function leanUnderLoadWarning(rpm, mapKpa, tps, afr, now) {
  const boosted = mapKpa >= 105;
  const highLoad = mapKpa >= 80 && tps >= 60;
  const loaded = rpm >= 1_500 && (boosted || highLoad);
  const leanLimit = boosted ? 13.2 : 14.0;

  if (!loaded || !Number.isFinite(afr) || afr <= leanLimit) {
    leanSince = null;
    return { active: false, limit: leanLimit };
  }

  if (leanSince === null) leanSince = now;
  return {
    active: now - leanSince >= AFR_WARNING_DEBOUNCE_MS,
    limit: leanLimit
  };
}

function ecuWarningDetail(flags) {
  if (flags.limp) return { code: "ecu-limp", label: "LIMP", detail: "ECU LIMP" };
  if (flags.knock) return { code: "ecu-knock", label: "KNOCK", detail: "KNOCK" };
  if (flags.overboost) return { code: "ecu-boost", label: "BOOST", detail: "OVERBOOST" };
  if (flags.afrSd || flags.afrWarn) return { code: "ecu-afr", label: "AFR", detail: "ECU AFR" };
  if (flags.egtSd || flags.egtWarn) return { code: "ecu-egt", label: "EGT", detail: "ECU EGT" };
  if (flags.sparkCut) return { code: "spark-cut", label: "SPARK", detail: "SPARK CUT" };
  if (flags.cel) return { code: "ecu-cel", label: "CEL", detail: "CHECK ENGINE" };
  return null;
}

function recordNewWarnings(warnings, rpm, speed, timestamp) {
  const currentCodes = new Set(warnings.map((warning) => warning.code));
  warnings.forEach((warning) => {
    if (activeEventCodes.has(warning.code)) return;
    warningHistory.push({
      ...warning,
      rpm: Number.isFinite(rpm) ? rpm : 0,
      speed: Number.isFinite(speed) ? speed : 0,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
    });
    if (warningHistory.length > 50) warningHistory.shift();
  });
  activeEventCodes = currentCodes;
}

function resetIndicators(reason = "reset") {
  if (DEBUG_STATUS) {
    console.log(`[status.js] resetIndicators(): ${reason}`);
  }

  setIndicator("warning", false);
  setIndicator("ac", false);
  setIndicator("cold", false);
  setIndicator("ase", false);
  setIndicator("engine_run", false);
  setIndicator("idle", false);
  setOilPressureWarning(false);
  setAfrWarning(false);
  setWarningLabel("WARN");
  overheatAlertActive = false;
  oilPressureAlertActive = false;
  engineReadySince = null;
}

function debugElementCheck() {
  if (!DEBUG_STATUS) return;

  const ids = [
    "warning",
    "ac",
    "cold",
    "ase",
    "engine_run",
    "idle",
  ];

  const found = {};

  ids.forEach((id) => {
    found[id] = !!document.getElementById(id);
  });

  console.log("[status.js] element check:", found);
}

function shouldLogThisUpdate(signature) {
  if (!DEBUG_STATUS) return false;

  updateCounter += 1;

  // Always log when values/states changed.
  if (signature !== lastDebugSignature) {
    lastDebugSignature = signature;
    return true;
  }

  return updateCounter % LOG_EVERY_N_UPDATES === 0;
}

// -------------------------------------------------------------
// BITFIELD CONSTANTS
// -------------------------------------------------------------

const ENGINE = {
  READY:     0x01,
  CRANK:     0x02,
  ASE:       0x04,
  WUE:       0x08,
  TPS_ACCEL: 0x10,
  TPS_DECEL: 0x20,
  MAP_ACCEL: 0x40,
  MAP_DECEL: 0x80,
};

const STATUS2 = {
  N2O_STAGE1: 0x01,
  N2O_STAGE2: 0x02,
  LAUNCH_IN:  0x04,
  LAUNCH:     0x08,
  FLAT_SHIFT: 0x10,
  SPARK_CUT:  0x20,
  OVERBOOST:  0x40,
  CL_IDLE:    0x80,
};

const STATUS6 = {
  EGT_WARN:        0x01,
  EGT_SHUTDOWN:    0x02,
  AFR_WARN:        0x04,
  AFR_SHUTDOWN:    0x08,
  IDLE_VE:         0x10,
  IDLE_ADVANCE:    0x20,
  FAN:             0x40,
  MAPSAMPLE_ERROR: 0x80,
};

const STATUS7 = {
  VVT1_ERR: 0x01,
  VVT2_ERR: 0x02,
  VVT3_ERR: 0x04,
  VVT4_ERR: 0x08,
  KNOCK:    0x10,
  AC:       0x20,
  CEL:      0x40,
  LIMP:     0x80,
};

// -------------------------------------------------------------
// EXPORT
// -------------------------------------------------------------

export default {
  initialize: function () {
    if (DEBUG_STATUS) {
      console.log("[status.js] initialize()");
    }

    debugElementCheck();
    sessionWarningLatched = false;
    lowOilSince = null;
    lowFuelPressureSince = null;
    leanSince = null;
    rememberedWarningLabel = "WARN";
    activeEventCodes = new Set();
    resetIndicators("initialize");
  },

  startSession: function () {
    warningHistory = [];
    activeEventCodes = new Set();
    sessionWarningLatched = false;
    rememberedWarningLabel = "WARN";
    engineReadySince = null;
    setIndicator("warning", false);
    setWarningLabel("WARN");
  },

  getSessionSummary: function () {
    const reasons = new Map();
    warningHistory.forEach((event) => {
      const existing = reasons.get(event.code);
      reasons.set(event.code, {
        ...event,
        count: (existing?.count || 0) + 1,
        firstTimestamp: existing?.firstTimestamp || event.timestamp
      });
    });
    return Array.from(reasons.values());
  },

  // Expected order:
  // engine, status1, status2, status3, status4,
  // status5, status6, status7, status8, noComm
  //
  // Also supports old order:
  // engine, status1, status2, status3, status4,
  // status5, status6, status7, noComm
  update: function (
    engine, s1, s2, s3, s4, s5, s6, s7, s8, noComm,
    rpmValue, fuelPressureValue, oilTemperatureValue, oilPressureValue,
    mapValue, tpsValue, afrRawValue, speedValue, timestampValue
  ) {
    const raw = {
      engine,
      s1,
      s2,
      s3,
      s4,
      s5,
      s6,
      s7,
      s8,
      noComm,
    };

    // Backward compatibility if caller does not pass STATUS8.
    // Old caller:
    // update(engine, s1, s2, s3, s4, s5, s6, s7, noComm)
    if (
      noComm === undefined &&
      (typeof s8 === "boolean" || s8 === 0 || s8 === 1)
    ) {
      noComm = s8;
      s8 = 0;

      if (DEBUG_STATUS) {
        console.log("[status.js] old caller style detected: s8 was noComm", raw);
      }
    }

    // Hard default off before real data or during comm loss.
    if (noComm || engine === undefined || engine === null) {
      if (DEBUG_STATUS) {
        console.log("[status.js] noComm or missing engine:", {
          noComm,
          engine,
          raw,
        });
      }

      resetIndicators("noComm or missing engine");
      if (sessionWarningLatched) {
        setIndicator("warning", true);
        setWarningLabel(rememberedWarningLabel);
      }
      return;
    }

    const bytes = {
      engine: toByte(engine),
      s1: toByte(s1),
      s2: toByte(s2),
      s3: toByte(s3),
      s4: toByte(s4),
      s5: toWord(s5),
      s6: toByte(s6),
      s7: toByte(s7),
      s8: toByte(s8),
    };

    const flags = {
      // ENGINE byte
      ready:    hasBit(bytes.engine, ENGINE.READY),
      crank:    hasBit(bytes.engine, ENGINE.CRANK),
      ase:      hasBit(bytes.engine, ENGINE.ASE),
      warmup:   hasBit(bytes.engine, ENGINE.WUE),
      tpsAccel: hasBit(bytes.engine, ENGINE.TPS_ACCEL),
      tpsDecel: hasBit(bytes.engine, ENGINE.TPS_DECEL),
      mapAccel: hasBit(bytes.engine, ENGINE.MAP_ACCEL),
      mapDecel: hasBit(bytes.engine, ENGINE.MAP_DECEL),

      // STATUS2
      sparkCut:  hasBit(bytes.s2, STATUS2.SPARK_CUT),
      overboost: hasBit(bytes.s2, STATUS2.OVERBOOST),
      clIdle:    hasBit(bytes.s2, STATUS2.CL_IDLE),

      // STATUS6
      egtWarn: hasBit(bytes.s6, STATUS6.EGT_WARN),
      egtSd:   hasBit(bytes.s6, STATUS6.EGT_SHUTDOWN),
      afrWarn: hasBit(bytes.s6, STATUS6.AFR_WARN),
      afrSd:   hasBit(bytes.s6, STATUS6.AFR_SHUTDOWN),

      // STATUS7
      knock: hasBit(bytes.s7, STATUS7.KNOCK),
      ac:    hasBit(bytes.s7, STATUS7.AC),
      cel:   hasBit(bytes.s7, STATUS7.CEL),
      limp:  hasBit(bytes.s7, STATUS7.LIMP),
    };

    // Positive fault bits only.
    // All zero status bytes = warning off.
    const warning =
      flags.cel ||
      flags.knock ||
      flags.limp ||
      flags.overboost ||
      flags.sparkCut ||
      flags.afrWarn ||
      flags.egtWarn ||
      flags.afrSd ||
      flags.egtSd;

    const rpm = Number(rpmValue);
    const fuelPressure = Number(fuelPressureValue);
    const oilTemperature = Number(oilTemperatureValue);
    const oilPressure = Number(oilPressureValue);
    const mapKpa = Number(mapValue);
    const tps = Number(tpsValue);
    const afr = Number(afrRawValue) / 10;
    const speed = Number(speedValue);
    const timestamp = Number(timestampValue);
    const now = performance.now();
    const engineRunning = flags.ready && !flags.crank && rpm >= ENGINE_RUNNING_RPM;
    if (!engineRunning) {
      engineReadySince = null;
    } else if (engineReadySince === null) {
      engineReadySince = now;
    }
    const engineMonitoringReady = engineReadySince !== null &&
      now - engineReadySince >= ENGINE_WARNING_GRACE_MS;
    const oilWarning = engineMonitoringReady
      ? oilPressureWarning(rpm, oilPressure, now)
      : oilPressureWarning(Number.NaN, Number.NaN, now);
    const overheatWarning = flags.egtWarn || flags.egtSd;
    if (overheatWarning && !overheatAlertActive) {
      showEngineAlert("OVERHEAT");
    }
    overheatAlertActive = overheatWarning;
    if (oilWarning && !oilPressureAlertActive) {
      const requiredPressure = requiredOilPressure(rpm);
      showEngineAlert(
        `LOW OIL ${oilPressure.toFixed(0)} PSI / ${requiredPressure.toFixed(0)} MIN`
      );
    }
    oilPressureAlertActive = oilWarning;
    const fuelWarning = engineMonitoringReady
      ? fuelPressureWarning(rpm, mapKpa, fuelPressure, now)
      : fuelPressureWarning(Number.NaN, Number.NaN, Number.NaN, now);
    const leanWarning = engineMonitoringReady
      ? leanUnderLoadWarning(rpm, mapKpa, tps, afr, now)
      : leanUnderLoadWarning(0, 0, 0, Number.NaN, now);
    const afrWarningActive = leanWarning.active || flags.afrWarn || flags.afrSd;
    const warnings = [];
    if (oilWarning) {
      warnings.push({
        code: "low-oil-pressure",
        label: "LOW OIL",
        detail: `${oilPressure.toFixed(0)} PSI`
      });
    }
    if (fuelWarning.active) {
      warnings.push({
        code: "low-fuel-pressure",
        label: "FUEL PSI",
        detail: `${fuelWarning.differential.toFixed(0)} PSI Δ`
      });
    }
    if (leanWarning.active) {
      warnings.push({
        code: "lean-under-load",
        label: "LEAN",
        detail: `${afr.toFixed(1)} AFR`
      });
    }
    if (engineMonitoringReady && !Number.isFinite(fuelPressure)) {
      warnings.push({ code: "fuel-sensor", label: "SENSOR", detail: "FUEL PSI" });
    }
    if (engineMonitoringReady && !Number.isFinite(oilTemperature)) {
      warnings.push({ code: "oil-temp-sensor", label: "SENSOR", detail: "OIL TEMP" });
    }
    if (engineMonitoringReady && !Number.isFinite(oilPressure)) {
      warnings.push({ code: "oil-psi-sensor", label: "SENSOR", detail: "OIL PSI" });
    }
    const ecuDetail = warning ? ecuWarningDetail(flags) : null;
    if (ecuDetail) warnings.push(ecuDetail);
    recordNewWarnings(warnings, rpm, speed, timestamp);

    const activeWarning = warnings.length > 0;

    if (activeWarning) {
      sessionWarningLatched = true;
      rememberedWarningLabel = afrWarningActive ? "AFR!" : warnings[0].label;
    }
    const rememberedWarning = sessionWarningLatched;

    const indicatorState = {
      engine_run: flags.ready,
      ase: flags.ase,
      cold: flags.warmup,
      idle: flags.clIdle,
      ac: flags.ac,
      warning: rememberedWarning,
    };

    const signature = JSON.stringify({
      bytes,
      indicatorState,
    });

    if (shouldLogThisUpdate(signature)) {
      console.log("[status.js] update debug:", {
        updateCounter,
        raw,
        bytes,
        flags,
        indicatorState,
      });
    }

    // ---------------------------------------------------------
    // APPLY INDICATORS BY ID
    // ---------------------------------------------------------

    setIndicator("engine_run", indicatorState.engine_run);
    setIndicator("ase", indicatorState.ase);
    setIndicator("cold", indicatorState.cold);
    setIndicator("idle", indicatorState.idle);
    setIndicator("ac", indicatorState.ac);
    setIndicator("warning", indicatorState.warning);
    setWarningLabel(rememberedWarning ? rememberedWarningLabel : "WARN");
    setOilPressureWarning(oilWarning);
    setAfrWarning(afrWarningActive);
  },
};
