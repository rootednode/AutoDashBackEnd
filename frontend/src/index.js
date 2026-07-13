"use strict";

import { DATA_MAP } from "./js/common/dataMap";

import tachometer from "./js/tachometer";
import speedo from "./js/speedo";
import clt from "./js/clt";
import tps from "./js/tps";
import mat from "./js/mat";
import eco from "./js/eco";
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

// --------------------------------------------------
function reinitGauges() {
  tachometer.initialize();
  speedo.initialize();
  clt.initialize();
  tps.initialize();
  mat.initialize();
  eco.initialize();
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
// MAIN TICK LOOP
// --------------------------------------------------
const tick = () => {
  const now = Date.now();
  counter++;




  // ----------------------------
  // WATCHDOG
  // ----------------------------
  const sinceLastPacket = now - lastPacketTime;
  isWatchdogTripped = sinceLastPacket > AUTO_REFRESH_TIMEOUT ? 1 : 0;

  // ----------------------------
  // GLOBAL COMM LOSS → HARD RESET
  // ----------------------------
  const commLost = isCommError === 1 || isWatchdogTripped === 1;

  if (commLost && !commsDead) {
    console.warn("[DASH] Communications lost → full reinit");

    commsDead = true;
    canReady = false;

	    setDashboardOpacity("0.3");



    reinitGauges();
  }

  // ----------------------------
  // RENDER GATE
  // ----------------------------
  if (
    canReady &&
    !commsDead &&
    isCommError === 0 &&
    isWatchdogTripped === 0
  ) {
    // CAN health indicator
    canIndicator.update(false);

	    setDashboardOpacity("1");

    const rpm = updateData[DATA_MAP.RPM.id];
    tachometer.update(rpm, isCommError);

    try { map.update(updateData[DATA_MAP.MAP.id], isCommError); } catch {}
    try { afr.update(updateData[DATA_MAP.AFR.id], isCommError); } catch {}
    try { ego.update(updateData[DATA_MAP.EGO.id], isCommError); } catch {}

    if (counter >= 5) {
      counter = 0;

      try {
        fuel.update(
          updateData[DATA_MAP.FUEL_LEVEL.id],
          updateData[DATA_MAP.FUEL_GALLONS_USED.id],
          updateData[DATA_MAP.FUEL_GALLONS_SINCE_REFILL.id],
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
      try { pw.update(updateData[DATA_MAP.PW1.id], isCommError); } catch {}
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

  requestAnimationFrame(tick);
};

// --------------------------------------------------
// INIT
// --------------------------------------------------
const initializeApp = () => {
  dataWorker.postMessage({ msg: "start" });
  reinitGauges();
  tick();
};

// --------------------------------------------------
// WORKER HANDLER
// --------------------------------------------------
dataWorker.onmessage = (event) => {
  switch (event.data.msg) {
    case "comm_error":
      isCommError = event.data.value ? 1 : 0;
      canIndicator.update(isCommError);
      return;

    case "comm_reconnected":
      lastPacketTime = Date.now();
      reinitGauges();
      return;

    case "update_data_ready":
      lastPacketTime = Date.now();
      updateData = event.data.updateData;

      // A decoded packet is proof of life. The backend only publishes packets
      // while CAN data is fresh, so do not block the whole dashboard waiting
      // for a particular sensor frame (such as battery voltage).
      if (!canReady && Array.isArray(updateData) && updateData.length > 0) {
        canReady = true;
        commsDead = false;
        console.log("[DASH] CAN ready");
      }
      return;

    case "error":
      console.error("[Worker ERROR]", event.data);
      return;
  }
};

// --------------------------------------------------
initializeApp();
