import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("advgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "—"
    });
  }

  },

  update: function (adv, noComm) {

    // lazy-load in case initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("advgauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      setGaugeReading(gauge, { value: 0, valueText: "—" });
      return;
    }

    if (adv === undefined || adv === null) {
      adv = 0;
      console.log("undefined adv", adv);
    }

    try {
      adv = Number(adv);
      if (!Number.isFinite(adv)) adv = 0;

      setGaugeReading(gauge, {
        value: adv,
        valueText: String(Math.round(adv)),
        colorBarProgress: colorForGaugeValue(gauge, adv)
      });

    } catch (error) {
      console.log(error);
    }
  }
};
