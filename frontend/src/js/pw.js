export default {

  initialize: function () {
    this.update.g = document.gauges.get("pwgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "null"
    });
  }
  },

  update: function (pw, noComm) {

    // lazy-load gauge if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("pwgauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      gauge.update({ value: 0, valueText: "null" });
      return;
    }

    if (pw === undefined || pw === null) {
      pw = 0;
      console.log("undefined pw", pw);
    }

    try {
      pw = Number(pw);
      if (!Number.isFinite(pw)) pw = 0;

      gauge.update({ value: pw, valueText: pw.toFixed(2) });

    } catch (error) {
      console.log(error);
    }
  }
};

