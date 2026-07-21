import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("egogauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "—"
    });
  }

  },

  update: function (ego, noComm) {

    // lazy-load if initialize executed too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("egogauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      setGaugeReading(gauge, { value: 0, valueText: "—" });
      return;
    }

    if (ego === undefined || ego === null) {
      ego = 0;
    }

    try {
      ego = Number(ego);
      if (!Number.isFinite(ego)) ego = 0;

      setGaugeReading(gauge, {
        value: ego,
        valueText: ego.toFixed(1),
        colorBarProgress: colorForGaugeValue(gauge, ego)
      });

    } catch (error) {
      console.log(error);
    }
  }
};
