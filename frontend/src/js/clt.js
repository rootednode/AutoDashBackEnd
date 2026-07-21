import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("cltgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 100,
			valueText: "—"
    });
  }


  },

  update: function (clt, noComm) {

    // lazy load if initialize didn't run in time
    if (!this.update.g) {
      this.update.g = document.gauges.get("cltgauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      setGaugeReading(gauge, { value: 100, valueText: "—" });
      return;
    }

    if (clt === undefined || clt === null) clt = 0;
    clt = Number(clt);
    if (!Number.isFinite(clt)) clt = 0;

    setGaugeReading(gauge, {
      value: clt,
      valueText: String(Math.round(clt)),
      colorBarProgress: colorForGaugeValue(gauge, clt)
    });
  }
};
