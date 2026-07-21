// Relative visual profile for the engine's power band. These values shape the
// tach silhouette; they are not displayed as measured torque numbers.
const POWER_BAND_POINTS = [
  { rpm: 0, level: 0 },
  { rpm: 1500, level: 40 },
  { rpm: 2000, level: 65 },
  { rpm: 2250, level: 72 },
  { rpm: 2500, level: 80 },
  { rpm: 2750, level: 87 },
  { rpm: 3000, level: 93 },
  { rpm: 3500, level: 100 },
  { rpm: 4000, level: 97 },
  { rpm: 4500, level: 90 },
  { rpm: 5000, level: 82 }
];

const PEAK_POWER_LEVEL = Math.max(
  ...POWER_BAND_POINTS.map((point) => point.level)
);
const TACH_SEGMENT_COUNT = 40;
const TACH_MIN_RPM = 500;
const TACH_MAX_RPM = 5000;
const RPM_PER_SEGMENT =
  (TACH_MAX_RPM - TACH_MIN_RPM) / TACH_SEGMENT_COUNT;

function powerLevelAtRpm(rpm) {
  const upperIndex = POWER_BAND_POINTS.findIndex((point) => point.rpm >= rpm);
  if (upperIndex <= 0) return POWER_BAND_POINTS[0].level;
  if (upperIndex === -1) {
    return POWER_BAND_POINTS[POWER_BAND_POINTS.length - 1].level;
  }

  const lower = POWER_BAND_POINTS[upperIndex - 1];
  const upper = POWER_BAND_POINTS[upperIndex];
  const ratio = (rpm - lower.rpm) / (upper.rpm - lower.rpm);
  return lower.level + (upper.level - lower.level) * ratio;
}

export default {
  initialize: function () {
    this.update.g = document.getElementById("rpmbar");
    this.update.value = document.getElementById("rpm-value");
    this.update.segments = document.getElementById("rpm-segments");

    if (this.update.segments && this.update.segments.children.length === 0) {
      for (let index = 0; index < TACH_SEGMENT_COUNT; index += 1) {
        const segment = document.createElement("span");
        const upperRpm = TACH_MIN_RPM + (index + 1) * RPM_PER_SEGMENT;
        const normalizedPower = powerLevelAtRpm(upperRpm) / PEAK_POWER_LEVEL;
        segment.style.height = `${Math.max(10, normalizedPower * 100)}%`;
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
    const clamped = Math.max(0, Math.min(TACH_MAX_RPM, rpm));
    const activeSegments = clamped <= TACH_MIN_RPM
      ? 0
      : Math.ceil((clamped - TACH_MIN_RPM) / RPM_PER_SEGMENT);
    Array.from(this.update.segments?.children || []).forEach((segment, index) => {
      segment.classList.toggle("active", index < activeSegments);
    });
    if (this.update.value) {
      this.update.value.textContent = String(Math.round(clamped));
    }
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
