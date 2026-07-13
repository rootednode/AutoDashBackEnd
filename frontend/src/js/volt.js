export default {

  initialize: function () {
    this.update.img = document.getElementById("battery");

    // default = dim
    if (this.update.img) {
      this.update.img.style.opacity = ".3";
    }
  },

  update: function (volt, noComm) {

    // lazy-load image
    if (!this.update.img) {
      this.update.img = document.getElementById("battery");
      if (this.update.img) {
        this.update.img.style.opacity = ".3";
      }
    }

    const img = this.update.img;
    if (!img) return;

    // ----------------------------
    // NO COMM → DIM
    // ----------------------------
    if (noComm) {
      img.style.opacity = ".3";
      return;
    }

    // ----------------------------
    // SANITIZE VOLTAGE
    // ----------------------------
    volt = Number(volt);
    if (!Number.isFinite(volt)) {
      img.style.opacity = ".3";
      return;
    }

    // ----------------------------
    // WARNING LOGIC
    // ----------------------------
    img.style.opacity = volt < 13.0 ? "1" : ".3";
  }
};

