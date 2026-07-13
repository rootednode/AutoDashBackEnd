export default {

  initialize: function () {
    this.update.g = document.gauges.get("matgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 40,
			valueText: "null"
    });
  }

  },

  update: function (mat, noComm) {

    // lazy init — guarantees gauge loads even if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("matgauge");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      gauge.update({ value: 0, valueText: "0" });
      return;
    }

    if (mat === undefined || mat === null) mat = 0;

    try {
      mat = Number(mat);
      if (!Number.isFinite(mat)) mat = 0;

      // clamp MAT range (editable)
      var clamped = mat;
      if (clamped < 40) clamped = 40;
      if (clamped > 200) clamped = 200;

      gauge.update({
        value: clamped,       // needle
        valueText: String(mat) // real value text
      });

    } catch (error) {
      console.log(error);
    }
  }
};

