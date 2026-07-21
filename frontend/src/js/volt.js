export default {

  setWarning: function (on) {
    const img = this.update.img;
    if (!img) return;
    img.style.opacity = on ? "1" : ".3";
    img.classList.toggle("indicator-active", on);
  },

  initialize: function () {
    this.update.img = document.getElementById("battery");
    this.update.value = document.getElementById("voltdisplay");

    // default = dim
    if (this.update.img) {
      this.setWarning(false);
    }
    if (this.update.value) this.update.value.textContent = "--";
  },

  update: function (volt, noComm) {

    // lazy-load image
    if (!this.update.img) {
      this.update.img = document.getElementById("battery");
      if (this.update.img) {
        this.setWarning(false);
      }
    }
    if (!this.update.value) {
      this.update.value = document.getElementById("voltdisplay");
    }

    const img = this.update.img;
    const valueDisplay = this.update.value;
    if (!img) return;

    // ----------------------------
    // NO COMM → DIM
    // ----------------------------
    if (noComm) {
      this.setWarning(false);
      if (valueDisplay) valueDisplay.textContent = "--";
      return;
    }

    // ----------------------------
    // SANITIZE VOLTAGE
    // ----------------------------
    volt = Number(volt);
    if (!Number.isFinite(volt)) {
      this.setWarning(false);
      if (valueDisplay) valueDisplay.textContent = "--";
      return;
    }

    // ----------------------------
    // WARNING LOGIC
    // ----------------------------
    if (valueDisplay) valueDisplay.textContent = volt.toFixed(1);
    this.setWarning(volt < 13.0);
  }
};
