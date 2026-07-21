import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("ecogauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "—"
    });
  }

  },

  update: function (eco, noComm) {

    // lazy init — guarantees gauge loads even if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("ecogauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      setGaugeReading(gauge, { value: 0, valueText: "—" });
      return;
    }

    if (eco === undefined || eco === null) eco = 0;

    try {
      eco = Number(eco);
      if (!Number.isFinite(eco)) eco = 0;

      setGaugeReading(gauge, {
        value: eco,       // needle
        valueText: String(eco), // real value text
        colorBarProgress: colorForGaugeValue(gauge, eco)
      });

    } catch (error) {
      console.log(error);
    }
  }
};
