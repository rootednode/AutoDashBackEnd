import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("afrgauge")

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "null"
    });
  }

  },

  update: function (afr, noComm) {

    // Lazy-load gauge if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("afrgauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      setGaugeReading(gauge, { value: 0, valueText: "null" });
      return;
    }

    if (afr === undefined || afr === null) {
      afr = 0;
    }

    try {
      afr = Number(afr);
      if (!Number.isFinite(afr)) afr = 0;

      // AFR scaling (your original: afr = afr / 10)
      afr = afr / 10;

      setGaugeReading(gauge, {
        value: afr,
        valueText: afr,
        colorBarProgress: colorForGaugeValue(gauge, afr)
      });

    } catch (error) {
      console.log(error);
    }

    // -----------------
    // Optional background logic
    // -----------------
    // if (afr > 18.0) {
    //   document.body.style.backgroundColor = "#AA0000";
    // } else {
    //   document.body.style.backgroundColor = "#000000";
    // }

  }
};
