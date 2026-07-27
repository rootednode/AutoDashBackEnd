import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";
import {
  ATMOSPHERIC_PRESSURE_KPA,
  KPA_TO_PSI
} from "./common/vehicleConfig";

const DEFAULT_BOOST_SCALE_PSI = 5;
const BOOST_TARGET_HEADROOM_PSI = 2;
const LOW_BOOST_TARGET_KPA = 140;
const BOOST_TRACK_X = 10;
const BOOST_TRACK_WIDTH = 632;

export default {

  initialize: function () {
    this.g = document.gauges.get("mapgauge");
    this.svg = {};
    this.peakBoost = null;
    this.cacheSvgElements();

  if (this.g) {
    this.g.update({
      value: 0,
			valueText: "—"
    });
  }

  },

  cacheSvgElements: function () {
    const ids = [
      "boost-combo-gauge",
      "boost-fill",
      "boost-needle",
      "boost-peak-marker",
      "boost-target-marker",
      "boost-value",
      "boost-duty-fill",
      "boost-duty-value",
      "boost-gradient-low",
      "boost-gradient-green",
      "boost-gradient-target",
      "boost-gradient-over",
      "boost-gradient-high",
      "boost-scale-100",
      "boost-scale-80",
      "boost-scale-60",
      "boost-scale-40",
      "boost-scale-20"
    ];
    this.svg = this.svg || {};
    ids.forEach((id) => { this.svg[id] = document.getElementById(id); });
  },

  setBoostValue: function (boost, maximumBoost) {
    const ratio = Math.max(0, Math.min(1, boost / maximumBoost));
    const x = BOOST_TRACK_X + ratio * BOOST_TRACK_WIDTH;
    if (this.svg["boost-fill"]) {
      this.svg["boost-fill"].setAttribute(
        "width",
        (x - BOOST_TRACK_X).toFixed(2)
      );
    }
    if (this.svg["boost-needle"]) {
      this.svg["boost-needle"].setAttribute("x1", x.toFixed(2));
      this.svg["boost-needle"].setAttribute("x2", x.toFixed(2));
    }
  },

  setBoostScale: function (maximumBoost) {
    [20, 40, 60, 80, 100].forEach((percent) => {
      const label = this.svg[`boost-scale-${percent}`];
      if (!label) return;
      const value = maximumBoost * percent / 100;
      label.textContent = String(Math.round(value));
    });
  },

  updatePeakBoost: function (boost, maximumBoost) {
    const marker = this.svg["boost-peak-marker"];
    if (!marker) return;
    if (boost > 0 && (this.peakBoost === null || boost > this.peakBoost)) {
      this.peakBoost = boost;
    }
    if (this.peakBoost === null) return;
    const x = BOOST_TRACK_X +
      Math.max(0, Math.min(1, this.peakBoost / maximumBoost)) *
      BOOST_TRACK_WIDTH;
    marker.setAttribute("x1", x.toFixed(2));
    marker.setAttribute("x2", x.toFixed(2));
    marker.style.display = "";
  },

  setBoostMode: function (targetKpa, targetBoostPsi) {
    const gauge = this.svg["boost-combo-gauge"];
    const hasTarget = Number.isFinite(targetKpa) && targetKpa > 0;
    const highMode = hasTarget && targetKpa > LOW_BOOST_TARGET_KPA;
    const lowMode = hasTarget && !highMode;

    if (gauge) {
      gauge.classList.toggle("low-boost-mode", lowMode);
      gauge.classList.toggle("high-boost-mode", highMode);
      gauge.setAttribute(
        "aria-label",
        hasTarget
          ? `${highMode ? "High" : "Low"} boost mode, target ${targetBoostPsi.toFixed(1)} PSI`
          : "Boost pressure, mode unavailable"
      );
    }
    if (
      typeof this.highBoostMode === "boolean" &&
      this.highBoostMode !== highMode
    ) {
      window.dispatchEvent(new CustomEvent("boost-mode-change", {
        detail: { high: highMode }
      }));
    }
    this.highBoostMode = highMode;
  },

  setBoostTargetMarker: function (targetBoostPsi, maximumBoost) {
    const marker = this.svg["boost-target-marker"];
    if (!marker) return;
    if (!(targetBoostPsi > 0) || !(maximumBoost > 0)) {
      marker.style.display = "none";
      return;
    }
    const ratio = Math.max(0, Math.min(1, targetBoostPsi / maximumBoost));
    const x = BOOST_TRACK_X + ratio * BOOST_TRACK_WIDTH;
    marker.setAttribute("x1", x.toFixed(2));
    marker.setAttribute("x2", x.toFixed(2));
    marker.style.display = "";
  },

  setBoostGradient: function (targetBoostPsi, maximumBoost) {
    if (!(targetBoostPsi > 0) || !(maximumBoost > 0)) return;
    const targetPercent = Math.max(
      0,
      Math.min(100, targetBoostPsi / maximumBoost * 100)
    );
    const greenPercent = targetPercent * 0.78;
    const overPercent = targetPercent + (100 - targetPercent) * 0.55;
    if (this.svg["boost-gradient-green"]) {
      this.svg["boost-gradient-green"].setAttribute(
        "offset",
        `${greenPercent.toFixed(1)}%`
      );
    }
    if (this.svg["boost-gradient-target"]) {
      this.svg["boost-gradient-target"].setAttribute(
        "offset",
        `${targetPercent.toFixed(1)}%`
      );
    }
    if (this.svg["boost-gradient-over"]) {
      this.svg["boost-gradient-over"].setAttribute(
        "offset",
        `${overPercent.toFixed(1)}%`
      );
    }
  },

  setBoostDuty: function (duty) {
    const numericDuty = Number(duty);
    const hasDuty = Number.isFinite(numericDuty);
    const boundedDuty = hasDuty
      ? Math.max(0, Math.min(100, numericDuty))
      : 0;
    if (this.svg["boost-duty-fill"]) {
      this.svg["boost-duty-fill"].setAttribute(
        "width",
        (boundedDuty / 100 * BOOST_TRACK_WIDTH).toFixed(2)
      );
    }
    if (this.svg["boost-duty-value"]) {
      this.svg["boost-duty-value"].textContent = hasDuty
        ? `${Math.round(boundedDuty)}%`
        : "—%";
    }
  },

  clearPeak: function () {
    this.peakBoost = null;
    if (this.svg?.["boost-peak-marker"]) {
      this.svg["boost-peak-marker"].style.display = "none";
    }
  },

  update: function (map, boostTarget, baro, boostDuty, noComm) {

    // lazy loading in case initialize ran before gauges existed
    if (!this.g) {
      this.g = document.gauges.get("mapgauge");
      if (!this.g) return;
    }

    var gauge = this.g;
    if (!this.svg || !this.svg["boost-value"]) {
      this.cacheSvgElements();
    }

    if (noComm) {
      setGaugeReading(gauge, { value: 0, valueText: "—" });
      const fallbackMaximum =
        DEFAULT_BOOST_SCALE_PSI + BOOST_TARGET_HEADROOM_PSI;
      this.setBoostScale(fallbackMaximum);
      this.setBoostValue(0, fallbackMaximum);
      if (this.svg["boost-value"]) {
        this.svg["boost-value"].textContent = "— / —";
      }
      this.highBoostMode = undefined;
      this.setBoostMode(Number.NaN, 0);
      this.setBoostGradient(
        DEFAULT_BOOST_SCALE_PSI,
        DEFAULT_BOOST_SCALE_PSI + BOOST_TARGET_HEADROOM_PSI
      );
      this.setBoostDuty(Number.NaN);
      if (this.svg["boost-target-marker"]) {
        this.svg["boost-target-marker"].style.display = "none";
      }
      if (this.svg["boost-peak-marker"]) {
        this.svg["boost-peak-marker"].style.display = "none";
      }
      return;
    }

    if (map === undefined || map === null || !Number.isFinite(Number(map))) {
      map = 0;
    }

    try {
      map = Number(map);
      if (!Number.isFinite(map)) map = 0;
      const numericBaro = Number(baro);
      const baroKpa = Number.isFinite(numericBaro) && numericBaro > 0
        ? numericBaro
        : ATMOSPHERIC_PRESSURE_KPA;

			const boostPsi = Math.max(
				0,
				map - baroKpa
			) * KPA_TO_PSI;
      const numericTarget = Number(boostTarget);
      const hasTarget = Number.isFinite(numericTarget) && numericTarget > 0;
      const targetBoostPsi = hasTarget
        ? Math.max(0, numericTarget - baroKpa) * KPA_TO_PSI
        : 0;
      const effectiveTargetBoostPsi = targetBoostPsi > 0.05
        ? targetBoostPsi
        : DEFAULT_BOOST_SCALE_PSI;
      const scaleMaximum =
        effectiveTargetBoostPsi + BOOST_TARGET_HEADROOM_PSI;

      setGaugeReading(gauge, {
        value: map,            // needle
        valueText: String(Math.round(map)), // real MAP reading
        colorBarProgress: colorForGaugeValue(gauge, map)
      });

      this.setBoostScale(scaleMaximum);
      this.setBoostValue(boostPsi, scaleMaximum);
      this.updatePeakBoost(boostPsi, scaleMaximum);
      this.setBoostMode(hasTarget ? numericTarget : Number.NaN, targetBoostPsi);
      this.setBoostTargetMarker(effectiveTargetBoostPsi, scaleMaximum);
      this.setBoostGradient(effectiveTargetBoostPsi, scaleMaximum);
      this.setBoostDuty(boostDuty);
      if (this.svg["boost-value"]) {
        this.svg["boost-value"].textContent =
          `${boostPsi.toFixed(1)} / ${effectiveTargetBoostPsi.toFixed(1)}`;
      }
    } catch (err) {
      console.log(err);
    }
  }
};
