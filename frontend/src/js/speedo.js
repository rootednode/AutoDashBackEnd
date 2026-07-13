const zeroPad = (num, places) => String(num).padStart(places, "0");

export default {

  initialize: function () {
    // Preload elements if ready
    this.update.elSpeed = document.getElementById("digispeed");
    this.update.elOdo   = document.getElementById("odometer");
    this.update.elMpg   = document.getElementById("mpgdisplay");

    // Defaults
    if (this.update.elSpeed) this.update.elSpeed.textContent = zeroPad(0, 2);
    if (this.update.elOdo)   this.update.elOdo.textContent   = '0.0 / 0.0 / 0.0';
    if (this.update.elMpg)   this.update.elMpg.textContent   = '0.0 / 0.0 / 0.0';
  },

update: function (speed, odo, trip, mpg, avgMpg, histMpg, noComm) {

  if (noComm) return;

  // Lazy-load DOM nodes (if initialize ran too early)
  if (!this.update.elSpeed)
    this.update.elSpeed = document.getElementById("digispeed");
  if (!this.update.elOdo)
    this.update.elOdo   = document.getElementById("odometer");
  if (!this.update.elTrip)
    this.update.elMpg   = document.getElementById("mpgdisplay");

	//console.log(speed, odo, trip, mpg, avgMpg, histMpg);

  var elSpeed  = this.update.elSpeed;
  var elOdo    = this.update.elOdo;
  var elTrip   = this.update.elTrip;
  var elMpg    = this.update.elMpg;
  var elAvgMpg = this.update.elAvgMpg;

  try {
    // -------------------
    // Convert + sanitize
    // -------------------
    var s = Number(speed);
    if (!Number.isFinite(s) || s < 0) s = 0;

    var od = Number(odo);
    //od = Number.isFinite(od) && od >= 0 ? Math.floor(od) : 0;
		od = Number.isFinite(od) && od >= 0 ? od : 0;

    var tr = Number(trip);
    tr = Number.isFinite(tr) && tr >= 0 ? tr : 0;

    var m  = Number(mpg);
    m = Number.isFinite(m) && m >= 0 ? m : 0;

    var am = Number(avgMpg);
    am = Number.isFinite(am) && am >= 0 ? am : 0;

    var hm = Number(histMpg);
    hm = Number.isFinite(hm) && hm >= 0 ? hm : 0;

    // -------------------
    // Update MPG 
    // -------------------
    if (elMpg) elMpg.textContent = `${m.toFixed(1)} / ${am.toFixed(1)} / ${hm.toFixed(1)}`;

    // -------------------
    // Update ODO
    // -------------------
    if (elOdo) elOdo.textContent = `${od.toFixed(2)} / ${tr.toFixed(2)}`;

    // -------------------
    // Update digital speed
    // -------------------
    var sInt = Math.round(s);
    if (elSpeed) {
      elSpeed.textContent = (sInt < 100)
        ? zeroPad(sInt, 2)
        : String(sInt);
    }

  } catch (error) {
    console.log("speedo update error", error);
  }
}
















};

