export default {

  initialize: function () {
    this.update.g = document.gauges.get("advgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "null"
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
      gauge.update({ value: 0, valueText: "null" });
      return;
    }

    if (adv === undefined || adv === null) {
      adv = 0;
      console.log("undefined adv", adv);
    }

    try {
      adv = Number(adv);
      if (!Number.isFinite(adv)) adv = 0;

      gauge.update({ value: adv, valueText: adv.toFixed(2) });

    } catch (error) {
      console.log(error);
    }
  }
};

