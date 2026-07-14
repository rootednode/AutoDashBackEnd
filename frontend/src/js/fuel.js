import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {
  initialize: function () {
    this.update.g = document.gauges.get("fuellevelgauge");
    this.update.elGal = document.getElementById("galdisplay");

    // Startup default only
    if (this.update.elGal)
      this.update.elGal.textContent = '0.0 / 0.0';
  },

  update: function (
    fuel,
    gallons,
    gallonssincelastrefill,
    senderConnected,
    noComm
  ) {

    // lazy-load if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("fuellevelgauge");
      if (!this.update.g) return;
    }

    //console.log(gallons, gallonssincelastrefill);

    const gauge = this.update.g;
    const elGal = this.update.elGal;

    // ----- Gallons display -----
    if (elGal) {
      const g1 = Number.isFinite(gallons) ? gallons : 0;
      const g2 = Number.isFinite(gallonssincelastrefill) ? gallonssincelastrefill : 0;
      elGal.textContent = `${g1.toFixed(3)} / ${g2.toFixed(3)}`;
    }

    // ----- Fuel gauge -----
    const fuelValid =
      !noComm &&
      senderConnected === 1 &&
      Number.isFinite(fuel) &&
      fuel >= 0;

    try {
      if (!fuelValid) {
        setGaugeReading(gauge, { valueText: "null" });
        return;
      }

      // An empty valueText restores the gauge's normal numeric display after
      // a sender or communications failure.
      setGaugeReading(gauge, {
        value: fuel,
        valueText: "",
        colorBarProgress: colorForGaugeValue(gauge, fuel)
      });
    } catch (error) {
      console.log(error);
    }
  }
};


