//
// status.js — MS3 engine + status bitfield decoding with debug
//

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

  if (DEBUG_STATUS) {
    console.log(`[status.js] indicator ${id}: ${on ? "ON" : "off"}`);
  }
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
  setIndicator("overheat", false);
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
    "overheat",
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
    resetIndicators("initialize");
  },

  // Expected order:
  // engine, status1, status2, status3, status4,
  // status5, status6, status7, status8, noComm
  //
  // Also supports old order:
  // engine, status1, status2, status3, status4,
  // status5, status6, status7, noComm
  update: function (engine, s1, s2, s3, s4, s5, s6, s7, s8, noComm) {
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

    const indicatorState = {
      engine_run: flags.ready,
      ase: flags.ase,
      cold: flags.warmup,
      idle: flags.clIdle,
      overheat: flags.egtSd || flags.afrSd,
      ac: flags.ac,
      warning,
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
    setIndicator("overheat", indicatorState.overheat);
    setIndicator("ac", indicatorState.ac);
    setIndicator("warning", indicatorState.warning);
  },
};
