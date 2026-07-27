import { colorForGaugeValue, setGaugeReading } from "./common/gaugeColor";

function setSensorFault(gauge, fault) {
  const container = gauge?.canvas?.element?.parentElement;
  if (container) container.classList.toggle("sensor-fault", fault);

  if (fault && gauge) {
    const faultColor = getComputedStyle(document.body)
      .getPropertyValue("--dash-medium-color")
      .trim() || "#ffb020";
    setGaugeReading(gauge, {
      value: Number(gauge.options.minValue) || 0,
      valueText: "—",
      colorBarProgress: faultColor
    });
  }
}

function validReading(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export default {

  initialize: function () {

    // SENSOR 1 gauges
    this.update.s1_g1 = document.gauges.get("sensor1gauge");
    this.update.s1_g2 = document.gauges.get("sensor1gauge2");

    // SENSOR 2 gauge (Fuel PSI)
    this.update.s2_g = document.gauges.get("fuelpsigauge");

    // SENSOR 3 gauge (Oil Temp)
    this.update.s3_g = document.gauges.get("oiltempgauge");

    // SENSOR 4 gauge (Oil PSI)
    this.update.s4_g = document.gauges.get("oilpsigauge");

if (this.update.s1_g1) this.update.s1_g1.update({ value: 0 });
if (this.update.s1_g2) this.update.s1_g2.update({ value: 0 });
if (this.update.s2_g)  this.update.s2_g.update({ value: 0, valueText: "—" });
if (this.update.s3_g)  this.update.s3_g.update({ value: 100, valueText: "—" });
if (this.update.s4_g)  this.update.s4_g.update({ value: 0, valueText: "—" });


  },

  update: function (sensor1, sensor2, sensor3, sensor4, noComm) {

    // -------------------------
    // SENSOR 1 — dual gauge
    // -------------------------

    if (!this.update.s1_g1)
      this.update.s1_g1 = document.gauges.get("sensor1gauge");

    if (!this.update.s1_g2)
      this.update.s1_g2 = document.gauges.get("sensor1gauge2");

    var s1g1 = this.update.s1_g1;
    var s1g2 = this.update.s1_g2;

    sensor1 = Number(sensor1);
    const sensor1Fault = noComm || !Number.isFinite(sensor1);
    setSensorFault(s1g1, sensor1Fault);
    setSensorFault(s1g2, sensor1Fault);
    if (sensor1Fault) {
      // Fault state is applied above.
    } else {
      setGaugeReading(s1g1, {
        value: sensor1,
        valueText: String(Math.round(sensor1)),
        colorBarProgress: colorForGaugeValue(s1g1, sensor1)
      });
      setGaugeReading(s1g2, {
        value: sensor1,
        valueText: String(Math.round(sensor1)),
        colorBarProgress: colorForGaugeValue(s1g2, sensor1)
      });
    }


    // -------------------------
    // SENSOR 2 — fuel pressure
    // -------------------------

    if (!this.update.s2_g)
      this.update.s2_g = document.gauges.get("fuelpsigauge");

    var s2g = this.update.s2_g;

    sensor2 = Number(sensor2);
    const sensor2Fault = noComm || !validReading(sensor2, 0, 100);
    setSensorFault(s2g, sensor2Fault);
    if (sensor2Fault) {
      // Fault state is applied above.
    } else {
      setGaugeReading(s2g, {
        value: sensor2,
        valueText: String(Math.round(sensor2)),
        colorBarProgress: colorForGaugeValue(s2g, sensor2)
      });
    }


    // -------------------------
    // SENSOR 3 — oil temp
    // -------------------------

    if (!this.update.s3_g)
      this.update.s3_g = document.gauges.get("oiltempgauge");

    var s3g = this.update.s3_g;

    sensor3 = Number(sensor3);
    const sensor3Fault = noComm || !validReading(sensor3, -40, 350);
    setSensorFault(s3g, sensor3Fault);
    if (sensor3Fault) {
      // Fault state is applied above.
    } else {
      setGaugeReading(s3g, {
        value: sensor3,
        valueText: String(Math.round(sensor3)),
        colorBarProgress: colorForGaugeValue(s3g, sensor3)
      });
    }


    // -------------------------
    // SENSOR 4 — oil pressure
    // -------------------------

    if (!this.update.s4_g)
      this.update.s4_g = document.gauges.get("oilpsigauge");

    var s4g = this.update.s4_g;

    sensor4 = Number(sensor4);
    const sensor4Fault = noComm || !validReading(sensor4, 0, 150);
    setSensorFault(s4g, sensor4Fault);
    if (sensor4Fault) {
      // Fault state is applied above.
    } else {
      setGaugeReading(s4g, {
        value: sensor4,
        valueText: String(Math.round(sensor4)),
        colorBarProgress: colorForGaugeValue(s4g, sensor4)
      });
    }
  }
};
