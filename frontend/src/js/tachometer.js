import {
  blendedColorForGaugeValue,
  setGaugeReading
} from "./common/gaugeColor";

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
      setGaugeReading(gauge, {
        value: 0,
        colorBarProgress: "rgba(0,250,0,.75)"
      });
      return;
    }

    if (rpm === undefined || rpm === null) {
      rpm = 0;
      console.log("undefined rpm", rpm);
    }

    try {
      rpm = Number(rpm);
      if (!Number.isFinite(rpm)) rpm = 0;

      setGaugeReading(gauge, {
        value: rpm,
        colorBarProgress: blendedColorForGaugeValue(gauge, rpm)
      });

    } catch (error) {
      console.log("rpm error", error);
    }
  }
};
