import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";
import { TANK_CAPACITY_GALLONS } from "./common/vehicleConfig";

export default {
  initialize: function () {
    this.update.g = document.gauges.get("fuellevelgauge");
    this.update.elGal = document.getElementById("galdisplay");

    // Startup default only
    if (this.update.elGal)
      this.update.elGal.textContent = "0.0 / 0.0 / 0.0";
  },

  update: function (
    fuel,
    gallons,
    gallonssincelastrefill,
    averageMpg,
    historicalMpg,
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
      const fuelPercent = Number(fuel);
      const senderIsValid = Number(senderConnected) === 1;
      const tankGallonsUsed = senderIsValid || g2 > 0 ? g2 : g1;
      const remainingGallons = senderIsValid && Number.isFinite(fuelPercent) && fuelPercent >= 0
        ? Math.max(0, Math.min(TANK_CAPACITY_GALLONS, fuelPercent / 100 * TANK_CAPACITY_GALLONS))
        : Math.max(0, TANK_CAPACITY_GALLONS - tankGallonsUsed);
      const tripMpg = Number(averageMpg);
      const lifetimeMpg = Number(historicalMpg);
      const rangeMpg = Number.isFinite(tripMpg) && tripMpg > 0
        ? tripMpg
        : Number.isFinite(lifetimeMpg) && lifetimeMpg > 0
          ? lifetimeMpg
          : 0;
      const estimatedRange = remainingGallons * rangeMpg;
      elGal.textContent = `${g1.toFixed(1)} / ${tankGallonsUsed.toFixed(1)} / ${remainingGallons.toFixed(1)}`;
      elGal.dataset.range = rangeMpg > 0
        ? `RANGE ${Math.round(estimatedRange)} MI`
        : "RANGE --";
    }

    // ----- Fuel gauge -----
    const fuelValid =
      !noComm &&
      senderConnected === 1 &&
      Number.isFinite(fuel) &&
      fuel >= 0;

    try {
      if (!fuelValid) {
        setGaugeReading(gauge, { valueText: "—" });
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
