import {
  TACH_MAX_RPM,
  TACH_MIN_RPM,
  TACH_REDLINE_RPM
} from "./common/vehicleConfig";

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
  { rpm: TACH_MAX_RPM, level: 82 }
];

const PEAK_POWER_LEVEL = Math.max(
  ...POWER_BAND_POINTS.map((point) => point.level)
);
const TACH_WIDTH = 705;
const TACH_HEIGHT = 92;
const LOW_BOOST_TARGET_KPA = 140;
const HIGH_BOOST_TARGET_KPA = 160;
const POWER_GLOW_START_RPM = 1800;
const POWER_GLOW_AMBER_RPM = 3900;

function powerBandGlow(rpm) {
  if (rpm < POWER_GLOW_START_RPM) {
    return { color: "rgba(0, 250, 0, 0)", blur: 0 };
  }
  if (rpm < POWER_GLOW_AMBER_RPM) {
    const intensity = Math.min(
      1,
      (rpm - POWER_GLOW_START_RPM) / 900
    );
    return {
      color: `rgba(0, 250, 80, ${(0.25 + intensity * 0.55).toFixed(2)})`,
      blur: 3 + intensity * 7
    };
  }
  if (rpm < TACH_REDLINE_RPM) {
    const intensity = Math.min(
      1,
      (rpm - POWER_GLOW_AMBER_RPM) /
        Math.max(1, TACH_REDLINE_RPM - POWER_GLOW_AMBER_RPM)
    );
    return {
      color: `rgba(255, 180, 0, ${(0.5 + intensity * 0.35).toFixed(2)})`,
      blur: 7 + intensity * 4
    };
  }
  return { color: "rgba(255, 35, 25, 0.95)", blur: 13 };
}

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

function torqueScaleForTarget(boostTarget) {
  const numericTarget = Number(boostTarget);
  if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
    return LOW_BOOST_TARGET_KPA / HIGH_BOOST_TARGET_KPA;
  }
  const boundedTarget = Math.max(
    LOW_BOOST_TARGET_KPA,
    Math.min(HIGH_BOOST_TARGET_KPA, numericTarget)
  );
  return boundedTarget / HIGH_BOOST_TARGET_KPA;
}

function tachometerPath(torqueScale) {
  const points = [
    { rpm: TACH_MIN_RPM, level: powerLevelAtRpm(TACH_MIN_RPM) },
    ...POWER_BAND_POINTS.filter(
      (point) => point.rpm > TACH_MIN_RPM && point.rpm <= TACH_MAX_RPM
    )
  ];
  const topEdge = points.map((point) => {
    const x = (point.rpm - TACH_MIN_RPM) /
      (TACH_MAX_RPM - TACH_MIN_RPM) * TACH_WIDTH;
    const y = TACH_HEIGHT -
      point.level / PEAK_POWER_LEVEL * (TACH_HEIGHT - 4) * torqueScale;
    return `L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return `M 0 ${TACH_HEIGHT} ${topEdge} L ${TACH_WIDTH} ${TACH_HEIGHT} Z`;
}

export default {
  initialize: function () {
    this.update.g = document.getElementById("rpmbar");
    if (this.update.g) {
      this.update.g.setAttribute("aria-valuemax", String(TACH_MAX_RPM));
    }
    this.update.value = document.getElementById("rpm-value");
    this.update.track = document.getElementById("rpm-track");
    this.update.progress = document.getElementById("rpm-progress");
    this.update.clip = document.getElementById("rpm-progress-clip-rect");
    this.update.marker = document.getElementById("rpm-marker");
    this.update.torqueScale = torqueScaleForTarget(LOW_BOOST_TARGET_KPA);
    this.update.pathTorqueScale = null;
    this.render(0, LOW_BOOST_TARGET_KPA);
  },

  render: function (rpm, boostTarget) {
    const gauge = this.update.g;
    if (!gauge) return;
    const torqueScale = torqueScaleForTarget(boostTarget);
    this.update.torqueScale = torqueScale;
    if (this.update.pathTorqueScale !== torqueScale) {
      const path = tachometerPath(torqueScale);
      if (this.update.track) this.update.track.setAttribute("d", path);
      if (this.update.progress) this.update.progress.setAttribute("d", path);
      this.update.pathTorqueScale = torqueScale;
    }
    const clamped = Math.max(0, Math.min(TACH_MAX_RPM, rpm));
    const ratio = clamped <= TACH_MIN_RPM
      ? 0
      : (clamped - TACH_MIN_RPM) / (TACH_MAX_RPM - TACH_MIN_RPM);
    const progressWidth = Math.max(0, Math.min(TACH_WIDTH, ratio * TACH_WIDTH));
    if (this.update.clip) this.update.clip.setAttribute("width", progressWidth.toFixed(2));
    if (this.update.marker) {
      const markerRpm = Math.max(TACH_MIN_RPM, clamped);
      const markerTop = TACH_HEIGHT -
        powerLevelAtRpm(markerRpm) / PEAK_POWER_LEVEL *
        (TACH_HEIGHT - 4) * torqueScale;
      this.update.marker.setAttribute("x1", progressWidth.toFixed(2));
      this.update.marker.setAttribute("x2", progressWidth.toFixed(2));
      this.update.marker.setAttribute("y1", markerTop.toFixed(2));
      this.update.marker.setAttribute("y2", String(TACH_HEIGHT));
      this.update.marker.classList.toggle("active", progressWidth > 0);
    }
    if (this.update.value) {
      this.update.value.textContent = String(Math.round(clamped));
    }
    const glow = powerBandGlow(clamped);
    gauge.style.setProperty("--rpm-glow-color", glow.color);
    gauge.style.setProperty("--rpm-glow-blur", `${glow.blur.toFixed(1)}px`);
    gauge.classList.toggle("redline", clamped >= TACH_REDLINE_RPM);
    gauge.setAttribute("aria-valuenow", String(Math.round(clamped)));
  },

  update: function (rpm, boostTarget, noComm) {
    if (!this.update.g) {
      this.initialize();
      if (!this.update.g) return;
    }
    if (noComm) {
      this.render(0, LOW_BOOST_TARGET_KPA);
      return;
    }
    const numericRpm = Number(rpm);
    this.render(
      Number.isFinite(numericRpm) ? numericRpm : 0,
      boostTarget
    );
  }
};
