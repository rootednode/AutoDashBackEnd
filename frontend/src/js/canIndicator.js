export default {

  initialize: function () {
    this.img = document.getElementById("can");

    if (this.img) {
      this.img.style.opacity = "1";
    }

  },

  update: function (noComm) {
    if (!this.img) {
      this.img = document.getElementById("can");
      if (!this.img) return;
      this.img.style.opacity = ".3";
    }

    // noComm === true → show CAN warning
    this.img.style.opacity = noComm ? "1" : ".3";
  }
};

