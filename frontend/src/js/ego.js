export default {

  initialize: function () {
    this.update.g = document.gauges.get("egogauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "null"
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
      gauge.update({ value: 0, valueText: "null" });
      return;
    }

    if (ego === undefined || ego === null) {
      ego = 0;
    }

    try {
      ego = Number(ego);
      if (!Number.isFinite(ego)) ego = 0;

      gauge.update({ value: ego, valueText: ego.toFixed(2) });

    } catch (error) {
      console.log(error);
    }
  }
};

