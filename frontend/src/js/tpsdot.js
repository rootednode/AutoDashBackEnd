import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {
  initialize: function () {
    this.update.g = document.gauges.get("tpsdotgauge");

    if (this.update.g) {
      setGaugeReading(this.update.g, { value: 0, valueText: "--" });
    }
  },

  update: function (tpsDot, noComm) {
    if (!this.update.g) {
      this.update.g = document.gauges.get("tpsdotgauge");
      if (!this.update.g) return;
    }

    const gauge = this.update.g;
    const value = Number(tpsDot);

    if (noComm || !Number.isFinite(value)) {
      setGaugeReading(gauge, { value: 0, valueText: "--" });
      return;
    }

    setGaugeReading(gauge, {
      value,
      valueText: value.toFixed(0),
      colorBarProgress: colorForGaugeValue(gauge, value)
    });
  }
};
