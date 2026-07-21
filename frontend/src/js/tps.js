import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("tpsgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "—"
    });
  }


  },

  update: function (tps, noComm) {

    // lazy-load if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("tpsgauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      setGaugeReading(gauge, { value: 0, valueText: "—" });
      return;
    }

    if (tps === undefined || tps === null) {
      tps = 0;
      console.log("undefined tps", tps);
    }

    try {
      tps = Number(tps);
      if (!Number.isFinite(tps)) tps = 0;

      setGaugeReading(gauge, {
        value: tps,
        valueText: String(Math.round(tps)),
        colorBarProgress: colorForGaugeValue(gauge, tps)
      });

    } catch (error) {
      console.log(error);
    }
  }
};
