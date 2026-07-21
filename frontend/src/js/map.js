import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

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
      "boost-fill",
      "boost-needle",
      "boost-peak-marker",
      "boost-value",
      "boost-scale-100",
      "boost-scale-80",
      "boost-scale-60",
      "boost-scale-40",
      "boost-scale-20"
    ];
    this.svg = this.svg || {};
    ids.forEach((id) => { this.svg[id] = document.getElementById(id); });
  },

  setSvgValue: function (prefix, value, max) {
    const bounded = Math.max(0, Math.min(max, value));
    const x = 82 + bounded / max * 560;
    const fill = this.svg[`${prefix}-fill`];
    const needle = this.svg[`${prefix}-needle`];
    if (fill) {
      fill.setAttribute("width", x - 82);
    }
    if (needle) {
      needle.setAttribute("x1", x);
      needle.setAttribute("x2", x);
    }
    return x;
  },

  setBoostScale: function (maxBoostPsi) {
    [100, 80, 60, 40, 20].forEach((percent) => {
      const label = this.svg[`boost-scale-${percent}`];
      if (!label) return;
      const value = maxBoostPsi * percent / 100;
      label.textContent = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    });
  },

  updatePeakBoost: function (boost, maxBoostPsi) {
    const marker = this.svg["boost-peak-marker"];
    if (!marker) return;

    if (Number.isFinite(boost) && boost > 0 &&
        (this.peakBoost === null || boost > this.peakBoost)) {
      this.peakBoost = boost;
    }
    if (this.peakBoost === null) return;

    const peakX = 82 + Math.max(0, Math.min(1, this.peakBoost / maxBoostPsi)) * 560;
    marker.setAttribute("x1", peakX);
    marker.setAttribute("x2", peakX);
    marker.style.display = "";
  },

  update: function (map, noComm) {

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
      this.setBoostScale(8);
      this.setSvgValue("boost", 0, 8);
      if (this.svg["boost-value"]) this.svg["boost-value"].textContent = "—";
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

			let baroKpa = 100;
			let boost = Math.max(0, (map - baroKpa) * 0.145038);
			const boostScaleMax = 8;

      setGaugeReading(gauge, {
        value: map,            // needle
        valueText: String(Math.round(map)), // real MAP reading
        colorBarProgress: colorForGaugeValue(gauge, map)
      });

      this.setBoostScale(boostScaleMax);
      this.setSvgValue("boost", boost, boostScaleMax);
      this.updatePeakBoost(boost, boostScaleMax);
      if (this.svg["boost-value"]) {
        this.svg["boost-value"].textContent = `${boost.toFixed(1)}`;
      }
    } catch (err) {
      console.log(err);
    }
  }
};
