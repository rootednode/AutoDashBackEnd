const DYNO_TORQUE_POINTS = [
  { rpm: 0, torque: 0 },
  { rpm: 1500, torque: 105 },
  { rpm: 2000, torque: 120 },
  { rpm: 2500, torque: 145 },
  { rpm: 3000, torque: 190 },
  { rpm: 3500, torque: 198 },
  { rpm: 4000, torque: 194 },
  { rpm: 4500, torque: 188 },
  { rpm: 5000, torque: 178 }
];

const PEAK_DYNO_TORQUE = Math.max(
  ...DYNO_TORQUE_POINTS.map((point) => point.torque)
);
const TACH_SEGMENT_COUNT = 40;
const RPM_PER_SEGMENT = 5000 / TACH_SEGMENT_COUNT;

function torqueAtRpm(rpm) {
  const upperIndex = DYNO_TORQUE_POINTS.findIndex((point) => point.rpm >= rpm);
  if (upperIndex <= 0) return DYNO_TORQUE_POINTS[0].torque;
  if (upperIndex === -1) {
    return DYNO_TORQUE_POINTS[DYNO_TORQUE_POINTS.length - 1].torque;
  }

  const lower = DYNO_TORQUE_POINTS[upperIndex - 1];
  const upper = DYNO_TORQUE_POINTS[upperIndex];
  const ratio = (rpm - lower.rpm) / (upper.rpm - lower.rpm);
  return lower.torque + (upper.torque - lower.torque) * ratio;
}

export default {
  initialize: function () {
    this.update.g = document.getElementById("rpmbar");
    this.update.segments = document.getElementById("rpm-segments");

    if (this.update.segments && this.update.segments.children.length === 0) {
      for (let index = 0; index < TACH_SEGMENT_COUNT; index += 1) {
        const segment = document.createElement("span");
        const upperRpm = (index + 1) * RPM_PER_SEGMENT;
        const normalizedTorque = torqueAtRpm(upperRpm) / PEAK_DYNO_TORQUE;
        segment.style.height = `${Math.max(10, normalizedTorque * 100)}%`;
        segment.className = upperRpm > 4750
          ? "red"
          : upperRpm > 4500
            ? "orange"
            : upperRpm > 4000
              ? "yellow"
              : "green";
        this.update.segments.appendChild(segment);
      }
    }
    this.render(0);
  },

  render: function (rpm) {
    const gauge = this.update.g;
    if (!gauge) return;
    const clamped = Math.max(0, Math.min(5000, rpm));
    const activeSegments = Math.ceil(clamped / RPM_PER_SEGMENT);
    Array.from(this.update.segments?.children || []).forEach((segment, index) => {
      segment.classList.toggle("active", index < activeSegments);
    });
    gauge.classList.toggle("redline", clamped >= 4800);
    gauge.setAttribute("aria-valuenow", String(Math.round(clamped)));
  },

  update: function (rpm, noComm) {
    if (!this.update.g) {
      this.initialize();
      if (!this.update.g) return;
    }
    if (noComm) {
      this.render(0);
      return;
    }
    const numericRpm = Number(rpm);
    this.render(Number.isFinite(numericRpm) ? numericRpm : 0);
  }
};
