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
if (this.update.s2_g)  this.update.s2_g.update({ value: 0, valueText: "null" });
if (this.update.s3_g)  this.update.s3_g.update({ value: 100, valueText: "null" });
if (this.update.s4_g)  this.update.s4_g.update({ value: 0, valueText: "null" });


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

    if (noComm) {
      if (s1g1) s1g1.update({ value: 0 });
      if (s1g2) s1g2.update({ value: 0 });
    } else {
      sensor1 = Number(sensor1); if (!Number.isFinite(sensor1)) sensor1 = 0;
      if (s1g1) s1g1.update({ value: sensor1 });
      if (s1g2) s1g2.update({ value: sensor1 });
    }


    // -------------------------
    // SENSOR 2 — fuel pressure
    // -------------------------

    if (!this.update.s2_g)
      this.update.s2_g = document.gauges.get("fuelpsigauge");

    var s2g = this.update.s2_g;

    if (noComm) {
      if (s2g) s2g.update({ value: 0, valueText: "null" });
    } else {
      sensor2 = Number(sensor2); if (!Number.isFinite(sensor2)) sensor2 = 0;
      if (s2g) s2g.update({ value: sensor2, valueText: sensor2 });
    }


    // -------------------------
    // SENSOR 3 — oil temp
    // -------------------------

    if (!this.update.s3_g)
      this.update.s3_g = document.gauges.get("oiltempgauge");

    var s3g = this.update.s3_g;

    if (noComm) {
      if (s3g) s3g.update({ value: 0, valueText: "null" });
    } else {
      sensor3 = Number(sensor3); if (!Number.isFinite(sensor3)) sensor3 = 0;

      var clamped = sensor3;
      if (clamped < 170) clamped = 170;
      if (clamped > 230) clamped = 230;

      if (s3g) s3g.update({
        value: clamped,
        valueText: String(sensor3)
      });
    }


    // -------------------------
    // SENSOR 4 — oil pressure
    // -------------------------

    if (!this.update.s4_g)
      this.update.s4_g = document.gauges.get("oilpsigauge");

    var s4g = this.update.s4_g;

    if (noComm) {
      if (s4g) s4g.update({ value: 0, valueText: "null" });
    } else {
      sensor4 = Number(sensor4); if (!Number.isFinite(sensor4)) sensor4 = 0;
      if (s4g) s4g.update({ value: sensor4, valueText: sensor4 });
    }
  }
};

