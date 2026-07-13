export default {

  initialize: function () {
    this.update.g = document.gauges.get("ecogauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "null"
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
      gauge.update({ value: 0, valueText: "0" });
      return;
    }

    if (eco === undefined || eco === null) eco = 0;

    try {
      eco = Number(eco);
      if (!Number.isFinite(eco)) eco = 0;

      gauge.update({
        value: eco,       // needle
        valueText: String(eco) // real value text
      });

    } catch (error) {
      console.log(error);
    }
  }
};

