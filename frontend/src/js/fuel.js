export default {
  initialize: function () {
    this.update.g = document.gauges.get("fuellevelgauge");
    this.update.elGal = document.getElementById("galdisplay");

    // Startup default only
    if (this.update.elGal)
      this.update.elGal.textContent = '0.0 / 0.0';
  },

  update: function (fuel, gallons, gallonssincelastrefill, noComm) {

    // lazy-load if initialize ran too early
    if (!this.update.g) {
      this.update.g = document.gauges.get("fuellevelgauge");
      if (!this.update.g) return;
    }

    //console.log(gallons, gallonssincelastrefill);

    const gauge = this.update.g;
    const elGal = this.update.elGal;

    if (noComm) {
      gauge.update({ valueText: "null" });
      return;
    }

    // ----- Gallons display -----
    if (elGal) {
      const g1 = Number.isFinite(gallons) ? gallons : 0;
      const g2 = Number.isFinite(gallonssincelastrefill) ? gallonssincelastrefill : 0;
      elGal.textContent = `${g1.toFixed(3)} / ${g2.toFixed(3)}`;
    }


		//console.log('fuel', fuel);

    // ----- Fuel gauge -----
    if (fuel === undefined || fuel === null)
		{
						try {
							gauge.update({ valueText: "null" });
							//gauge?.classList.add("disabled");
						} catch (error) {
							console.log(error);
						}

		} else {

						try {
							gauge.update({ value: fuel });
						} catch (error) {
							console.log(error);
						}
  	}
	}
};





