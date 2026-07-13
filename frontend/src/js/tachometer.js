export default {

initialize: function () {
  this.update.g = document.gauges.get("rpmbar");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
    });
  }

},



  update: function (rpm, noComm) {

    // lazy load if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("rpmbar");
      if (!this.update.g) return;
    }

    var gauge = this.update.g;

    if (noComm) {
      gauge.update({ value: 0, colorBarProgress: "rgba(0,250,0,.75)" });
      return;
    }

    if (rpm === undefined || rpm === null) {
      rpm = 0;
      console.log("undefined rpm", rpm);
    }

    try {
      rpm = Number(rpm);
      if (!Number.isFinite(rpm)) rpm = 0;

      // Default color (green)
      var rpmcolor = "rgba(0, 250, 0, .75)";

      // Update color depending on RPM range
      if (rpm >= 5200) {
        rpmcolor = "rgba(250, 0, 0, .75)";      // red
      } else if (rpm >= 4600) {
        rpmcolor = "rgba(250, 250, 0, .75)";    // yellow
      }

      // Update the gauge value and the bar color
      gauge.update({
        value: rpm,
        colorBarProgress: rpmcolor
      });

    } catch (error) {
      console.log("rpm error", error);
    }
  }
};

