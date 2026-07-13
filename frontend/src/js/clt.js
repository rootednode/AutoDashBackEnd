export default {

  initialize: function () {
    this.update.g = document.gauges.get("cltgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 100,
			valueText: "null"
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
      gauge.update({ value: 0, valueText: "0" });
      return;
    }

    if (clt === undefined || clt === null) clt = 0;
    clt = Number(clt);
    if (!Number.isFinite(clt)) clt = 0;

    var clamped = clt;
    if (clamped < 100) clamped = 100;
    if (clamped > 230) clamped = 230;

    gauge.update({
      value: clamped,
      valueText: String(clt)
    });
  }
};

