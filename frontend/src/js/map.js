import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

export default {

  initialize: function () {
    this.update.g = document.gauges.get("mapgauge");
    this.update.g2 = document.gauges.get("boostgauge");

  if (this.update.g) {
    this.update.g.update({
      value: 0,
			valueText: "null"
    });
  }

  if (this.update.g2) {
    this.update.g2.update({
      value: 0,
			valueText: "null"
    });
  }



  },

  update: function (map, noComm) {

    // lazy loading in case initialize ran before gauges existed
    if (!this.update.g) {
      this.update.g = document.gauges.get("mapgauge");
      if (!this.update.g) return;
    }

    // lazy loading in case initialize ran before gauges existed
    if (!this.update.g2) {
      this.update.g2 = document.gauges.get("boostgauge");
      if (!this.update.g2) return;
    }

    var gauge = this.update.g;
    var gauge2 = this.update.g2;

    if (noComm) {
      setGaugeReading(gauge, { value: 0, valueText: "null" });
      setGaugeReading(gauge2, { value: 0, valueText: "null" });
      return;
    }

    if (map === undefined || map === null || !Number.isFinite(Number(map))) {
      map = 0;
    }

    try {
      map = Number(map);
      if (!Number.isFinite(map)) map = 0;

			let baroKpa = 100;
			let boost = Math.max(0, (map - baroKpa) * 0.145038);

      setGaugeReading(gauge, {
        value: map,            // needle
        valueText: String(map), // real MAP reading
        colorBarProgress: colorForGaugeValue(gauge, map)
      });

      setGaugeReading(gauge2, {
        value: Number(boost.toFixed(1)),     // needle
        valueText: String(boost.toFixed(1)) // real MAP reading
      });

    } catch (err) {
      console.log(err);
    }
  }
};
