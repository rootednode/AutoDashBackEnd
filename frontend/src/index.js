"use strict";

import { DATA_MAP } from "./js/common/dataMap";

import tachometer from "./js/tachometer";
import speedo from "./js/speedo";
import clt from "./js/clt";
import tps from "./js/tps";
import mat from "./js/mat";
import eco from "./js/eco";
import tpsdot from "./js/tpsdot";
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
import { setEfficiencyWallpaperTint } from "./js/common/gaugeColor";

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
const BOOST_THRESHOLD_KPA = 100;
const KPA_TO_PSI = 0.145038;
let summaryVisible = false;
let driveSession = null;
let latestVehicleTime = null;

function numberValue(dataKey) {
  const value = Number(updateData[dataKey.id]);
  return Number.isFinite(value) ? value : 0;
}

function beginDriveSession(now) {
  engineDetails.startSession();
  driveSession = {
    startedAt: now,
    lastDataAt: now,
    lastSampleAt: now,
    lastWallSampleAt: Date.now(),
    idleMilliseconds: 0,
    startFuel: numberValue(DATA_MAP.FUEL_GALLONS_USED),
    endFuel: numberValue(DATA_MAP.FUEL_GALLONS_USED),
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
  driveSession.endFuel = numberValue(DATA_MAP.FUEL_GALLONS_USED);
  driveSession.endOdometer = numberValue(DATA_MAP.CURRENT_ODOMETER);
  driveSession.maxRpm = Math.max(driveSession.maxRpm, rpm);
  const mapKpa = numberValue(DATA_MAP.MAP);
  driveSession.maxMap = Math.max(driveSession.maxMap, mapKpa);
  const boostPsi = Math.max(0, (mapKpa - BOOST_THRESHOLD_KPA) * KPA_TO_PSI);
  driveSession.maxBoostPsi = Math.max(driveSession.maxBoostPsi, boostPsi);
  if (
    continuousSample &&
    vehicleDelta > 0 &&
    rpm > 0 &&
    mapKpa > BOOST_THRESHOLD_KPA
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

function showDriveSummary() {
  if (!driveSession || summaryVisible) return;
  const overlay = document.getElementById("drive-summary-overlay");
  if (!overlay) return;
  const duration = driveSession.lastDataAt - driveSession.startedAt;
  const fuelUsed = Math.max(0, driveSession.endFuel - driveSession.startFuel);
  const distance = Math.max(
    0,
    driveSession.endOdometer - driveSession.startOdometer
  );
  const calculatedMpg = fuelUsed > 0.001
    ? distance / fuelUsed
    : driveSession.reportedAverageMpg;
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
        ? "#ff5555"
        : (stat.averageAfrDelta < -0.5 ? "#55aaff" : "#55ff55");
      item.append(label, value);
      return item;
    }));
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
    ["left", "right", "rpmbar", "main_container1", "main_container2"],
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
    counter++;

    const rpm = updateData[DATA_MAP.RPM.id];
    tachometer.update(rpm, isCommError);

    try { map.update(updateData[DATA_MAP.MAP.id], isCommError); } catch {}
    try { afr.update(updateData[DATA_MAP.AFR.id], isCommError); } catch {}
    try { ego.update(updateData[DATA_MAP.EGO.id], isCommError); } catch {}
    try { tpsdot.update(updateData[DATA_MAP.TPS_DOT.id], isCommError); } catch {}
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

    if (counter >= 5) {
      counter = 0;

      try {
        fuel.update(
          updateData[DATA_MAP.FUEL_LEVEL.id],
          updateData[DATA_MAP.FUEL_GALLONS_USED.id],
          updateData[DATA_MAP.FUEL_GALLONS_SINCE_REFILL.id],
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

      try { clt.update(updateData[DATA_MAP.CTS.id], isCommError); } catch {}
      try { tps.update(updateData[DATA_MAP.TPS.id], isCommError); } catch {}
      try { mat.update(updateData[DATA_MAP.MAT.id], isCommError); } catch {}
      try { eco.update(updateData[DATA_MAP.ECO.id], isCommError); } catch {}
      try {
        setEfficiencyWallpaperTint({
          eco: updateData[DATA_MAP.ECO.id],
          speed: updateData[DATA_MAP.SPEEDO.id],
          rpm: updateData[DATA_MAP.RPM.id],
          noComm: isCommError
        });
      } catch {}
      try { volt.update(updateData[DATA_MAP.VOLT.id], isCommError); } catch {}
      try { adv.update(updateData[DATA_MAP.ADV.id], isCommError); } catch {}

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
          isCommError
        );
      } catch { console.log('status err'); }

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
  dataWorker.postMessage({ msg: "start" });
  reinitGauges();
  checkCommunications();
  setInterval(checkCommunications, WATCHDOG_INTERVAL);
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
      if (summaryVisible) {
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

    case "error":
      console.error("[Worker ERROR]", event.data);
      return;
  }
};

// --------------------------------------------------
initializeApp();
