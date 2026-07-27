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
const TACH_RISE_TIME_CONSTANT_MS = 55;
const TACH_FALL_TIME_CONSTANT_MS = 75;
const TACH_SETTLE_RPM = 1;
const MAX_ANIMATION_STEP_MS = 50;
const CLOSED_THROTTLE_TACH_SCALE = 0.42;

function colorWithAlpha(color, alpha) {
  const hex = String(color).trim().match(/^#([0-9a-f]{6})$/i);
  if (!hex) return color;
  const red = parseInt(hex[1].slice(0, 2), 16);
  const green = parseInt(hex[1].slice(2, 4), 16);
  const blue = parseInt(hex[1].slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function tachColor(gauge, role, fallback) {
  return getComputedStyle(gauge)
    .getPropertyValue(`--tach-${role}-color`)
    .trim() || fallback;
}

function powerBandGlow(rpm, gauge) {
  if (rpm < POWER_GLOW_START_RPM) {
    return {
      color: colorWithAlpha(tachColor(gauge, "low", "#3388ff"), 0),
      blur: 0
    };
  }
  if (rpm < POWER_GLOW_AMBER_RPM) {
    const intensity = Math.min(
      1,
      (rpm - POWER_GLOW_START_RPM) / 900
    );
    return {
      color: colorWithAlpha(
        tachColor(gauge, "normal", "#00fa00"),
        (0.25 + intensity * 0.55).toFixed(2)
      ),
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
      color: colorWithAlpha(
        tachColor(gauge, "medium", "#ffe100"),
        (0.5 + intensity * 0.35).toFixed(2)
      ),
      blur: 7 + intensity * 4
    };
  }
  return {
    color: colorWithAlpha(tachColor(gauge, "high", "#ff2020"), 0.95),
    blur: 13
  };
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

function throttleScale(tps) {
  const normalized = Math.max(0, Math.min(100, Number(tps) || 0)) / 100;
  return CLOSED_THROTTLE_TACH_SCALE +
    (1 - CLOSED_THROTTLE_TACH_SCALE) * Math.sqrt(normalized);
}

function tachometerPath(profileScale) {
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
      point.level / PEAK_POWER_LEVEL * (TACH_HEIGHT - 4) * profileScale;
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
    this.update.peakMarker = document.getElementById("rpm-peak-marker");
    this.update.torqueScale = torqueScaleForTarget(LOW_BOOST_TARGET_KPA);
    this.update.pathTorqueScale = null;
    this.update.displayRpm = 0;
    this.update.targetRpm = 0;
    this.update.peakRpm = null;
    this.update.boostTarget = LOW_BOOST_TARGET_KPA;
    this.update.tps = 0;
    this.update.animationFrame = null;
    this.update.lastAnimationTime = null;
    this.render(0, LOW_BOOST_TARGET_KPA, 0);
  },

  animate: function (timestamp) {
    this.update.animationFrame = null;
    const previousTime = this.update.lastAnimationTime;
    this.update.lastAnimationTime = timestamp;
    const elapsed = previousTime === null
      ? 16
      : Math.max(1, Math.min(MAX_ANIMATION_STEP_MS, timestamp - previousTime));
    const difference = this.update.targetRpm - this.update.displayRpm;
    const timeConstant = difference >= 0
      ? TACH_RISE_TIME_CONSTANT_MS
      : TACH_FALL_TIME_CONSTANT_MS;
    const blend = 1 - Math.exp(-elapsed / timeConstant);

    this.update.displayRpm += difference * blend;
    if (Math.abs(difference) <= TACH_SETTLE_RPM) {
      this.update.displayRpm = this.update.targetRpm;
    }
    this.render(this.update.displayRpm, this.update.boostTarget, this.update.tps);

    if (this.update.displayRpm !== this.update.targetRpm) {
      this.update.animationFrame = requestAnimationFrame(
        (nextTimestamp) => this.animate(nextTimestamp)
      );
    } else {
      this.update.lastAnimationTime = null;
    }
  },

  scheduleAnimation: function () {
    if (this.update.animationFrame !== null) return;
    this.update.animationFrame = requestAnimationFrame(
      (timestamp) => this.animate(timestamp)
    );
  },

  render: function (rpm, boostTarget, tps) {
    const gauge = this.update.g;
    if (!gauge) return;
    const profileScale =
      torqueScaleForTarget(boostTarget) * throttleScale(tps);
    this.update.torqueScale = profileScale;
    const roundedProfileScale = Math.round(profileScale * 100) / 100;
    if (this.update.pathTorqueScale !== roundedProfileScale) {
      const path = tachometerPath(roundedProfileScale);
      if (this.update.track) this.update.track.setAttribute("d", path);
      if (this.update.progress) this.update.progress.setAttribute("d", path);
      this.update.pathTorqueScale = roundedProfileScale;
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
        (TACH_HEIGHT - 4) * roundedProfileScale;
      this.update.marker.setAttribute("x1", progressWidth.toFixed(2));
      this.update.marker.setAttribute("x2", progressWidth.toFixed(2));
      this.update.marker.setAttribute("y1", markerTop.toFixed(2));
      this.update.marker.setAttribute("y2", String(TACH_HEIGHT));
      this.update.marker.classList.toggle("active", progressWidth > 0);
    }
    if (this.update.peakMarker && Number.isFinite(this.update.peakRpm)) {
      const peakRatio = Math.max(
        0,
        Math.min(
          1,
          (this.update.peakRpm - TACH_MIN_RPM) /
            (TACH_MAX_RPM - TACH_MIN_RPM)
        )
      );
      const peakX = peakRatio * TACH_WIDTH;
      const peakTop = TACH_HEIGHT -
        powerLevelAtRpm(Math.max(TACH_MIN_RPM, this.update.peakRpm)) /
          PEAK_POWER_LEVEL * (TACH_HEIGHT - 4) * roundedProfileScale;
      this.update.peakMarker.setAttribute("x1", peakX.toFixed(2));
      this.update.peakMarker.setAttribute("x2", peakX.toFixed(2));
      this.update.peakMarker.setAttribute("y1", peakTop.toFixed(2));
      this.update.peakMarker.setAttribute("y2", String(TACH_HEIGHT));
      this.update.peakMarker.style.display = "";
    }
    if (this.update.value) {
      this.update.value.textContent = String(Math.round(clamped));
    }
    const glow = powerBandGlow(clamped, gauge);
    gauge.style.setProperty("--rpm-glow-color", glow.color);
    gauge.style.setProperty("--rpm-glow-blur", `${glow.blur.toFixed(1)}px`);
    gauge.classList.toggle("redline", clamped >= TACH_REDLINE_RPM);
    gauge.setAttribute("aria-valuenow", String(Math.round(clamped)));
  },

  update: function (rpm, boostTarget, tps, noComm) {
    if (!this.update.g) {
      this.initialize();
      if (!this.update.g) return;
    }
    if (noComm) {
      if (this.update.animationFrame !== null) {
        cancelAnimationFrame(this.update.animationFrame);
        this.update.animationFrame = null;
      }
      this.update.displayRpm = 0;
      this.update.targetRpm = 0;
      this.update.lastAnimationTime = null;
      this.update.tps = 0;
      this.render(0, LOW_BOOST_TARGET_KPA, 0);
      return;
    }
    const numericRpm = Number(rpm);
    this.update.targetRpm = Math.max(
      0,
      Math.min(TACH_MAX_RPM, Number.isFinite(numericRpm) ? numericRpm : 0)
    );
    this.update.peakRpm = Number.isFinite(this.update.peakRpm)
      ? Math.max(this.update.peakRpm, this.update.targetRpm)
      : this.update.targetRpm;
    this.update.boostTarget = boostTarget;
    this.update.tps = Math.max(0, Math.min(100, Number(tps) || 0));
    this.scheduleAnimation();
  },

  clearPeak: function () {
    this.update.peakRpm = null;
    if (this.update.peakMarker) this.update.peakMarker.style.display = "none";
  }
};
