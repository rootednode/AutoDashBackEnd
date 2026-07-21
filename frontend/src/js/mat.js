import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("matgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 40,
			valueText: "—"
    });
  }

  },

  update: function (mat, noComm) {

    // lazy init — guarantees gauge loads even if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("matgauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      setGaugeReading(gauge, { value: 40, valueText: "—" });
      return;
    }

    if (mat === undefined || mat === null) mat = 0;

    try {
      mat = Number(mat);
      if (!Number.isFinite(mat)) mat = 0;

      setGaugeReading(gauge, {
        value: mat,            // needle
        valueText: String(Math.round(mat)), // real value text
        colorBarProgress: colorForGaugeValue(gauge, mat)
      });

    } catch (error) {
      console.log(error);
    }
  }
};
