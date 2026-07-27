const STAR_COUNT = 140;
const FRAME_INTERVAL_MS = 1000 / 30;
const DEPTH = 700;
const SPEED = 5;
const PLANET_MIN_DELAY_MS = 8000;
const PLANET_DELAY_RANGE_MS = 12000;
const SHOOTING_STAR_MIN_DELAY_MS = 15000;
const SHOOTING_STAR_DELAY_RANGE_MS = 15000;
const WARP_DURATION_MS = 4000;
let vehicleSpeedMph = 0;
let engineRpm = 0;
let engineMapKpa = 0;
let engineTps = 0;
let previousAeAmount = 0;
let pendingAeBurst = 0;

export function setStarfieldVehicleSpeed(speedMph) {
  const numericSpeed = Number(speedMph);
  vehicleSpeedMph = Number.isFinite(numericSpeed)
    ? Math.max(0, Math.min(120, numericSpeed))
    : 0;
}

export function setScreenSaverEngineData(rpm, mapKpa, tps, aeAmount) {
  engineRpm = Number.isFinite(Number(rpm)) ? Math.max(0, Number(rpm)) : 0;
  engineMapKpa = Number.isFinite(Number(mapKpa))
    ? Math.max(0, Number(mapKpa))
    : 0;
  engineTps = Number.isFinite(Number(tps))
    ? Math.max(0, Math.min(100, Number(tps)))
    : 0;
  const numericAe = Number.isFinite(Number(aeAmount))
    ? Math.max(0, Number(aeAmount))
    : 0;
  if (
    document.body.dataset.screenSaver === "engine-particles" &&
    numericAe >= 0.1 &&
    previousAeAmount < 0.1
  ) {
    pendingAeBurst = numericAe;
  }
  previousAeAmount = numericAe;
}

function randomStar(width, height, z = Math.random() * DEPTH + 1) {
  return {
    x: (Math.random() - 0.5) * width,
    y: (Math.random() - 0.5) * height,
    z,
    twinklePhase: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.001 + Math.random() * 0.002
  };
}

export function initializeStarfield() {
  const canvas = document.getElementById("starfield-background");
  if (!canvas) return;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  let width = 0;
  let height = 0;
  let stars = [];
  let planets = [];
  let shootingStar = null;
  let rainColumns = [];
  let embers = [];
  let aeStars = [];
  let previousFrame = 0;
  let randomMode = "aurora";
  let randomModeUntil = 0;
  let warpStartedAt = 0;
  let warpUntil = 0;
  let nextPlanetTime =
    performance.now() + PLANET_MIN_DELAY_MS + Math.random() * PLANET_DELAY_RANGE_MS;
  let nextShootingStarTime = performance.now() +
    SHOOTING_STAR_MIN_DELAY_MS +
    Math.random() * SHOOTING_STAR_DELAY_RANGE_MS;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const resize = () => {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    // A one-to-one backing buffer keeps this inexpensive on the Pi.
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    stars = Array.from(
      { length: STAR_COUNT },
      () => randomStar(width, height)
    );
    rainColumns = Array.from(
      { length: Math.ceil(width / 18) },
      () => Math.random() * height
    );
    embers = Array.from({ length: 70 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1 + Math.random() * 2.5,
      speed: 0.3 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 0.5
    }));
    planets = [];
  };

  const themeColors = () => {
    const styles = getComputedStyle(document.body);
    return {
      accent: styles.getPropertyValue("--dash-accent").trim() || "#ffb000",
      low: styles.getPropertyValue("--dash-low-color").trim() || "#3388ff",
      normal: styles.getPropertyValue("--dash-normal-color").trim() || "#22dd77",
      medium: styles.getPropertyValue("--dash-medium-color").trim() || "#ffb020",
      high: styles.getPropertyValue("--dash-high-color").trim() || "#ff3344"
    };
  };

  const drawAurora = (timestamp, colors) => {
    context.fillStyle = reducedMotion ? "#000" : "rgba(0, 0, 0, 0.16)";
    context.fillRect(0, 0, width, height);
    [colors.low, colors.normal, colors.medium].forEach((color, band) => {
      const phase = timestamp * (0.00018 + band * 0.00004);
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, "transparent");
      context.globalAlpha = 0.13;
      context.strokeStyle = gradient;
      context.lineWidth = 45 + band * 18;
      context.beginPath();
      for (let x = -20; x <= width + 20; x += 18) {
        const y = height * (0.3 + band * 0.14) +
          Math.sin(x * 0.012 + phase * (band + 1)) * (35 + band * 9);
        if (x === -20) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    });
    context.globalAlpha = 1;
  };

  const drawGrid = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const horizon = height * 0.28;
    const centerX = width / 2;
    context.strokeStyle = colors.accent;
    context.globalAlpha = 0.32;
    context.lineWidth = 1;
    for (let x = -width; x <= width * 2; x += width / 14) {
      context.beginPath();
      context.moveTo(centerX, horizon);
      context.lineTo(x, height);
      context.stroke();
    }
    const travel = reducedMotion ? 0 : (timestamp * 0.00025) % 1;
    for (let row = 0; row < 18; row += 1) {
      const progress = (row + travel) / 18;
      const eased = progress * progress;
      const y = horizon + eased * (height - horizon);
      context.globalAlpha = 0.1 + eased * 0.45;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const drawDigitalRain = (colors) => {
    context.fillStyle = reducedMotion ? "#000" : "rgba(0, 0, 0, 0.14)";
    context.fillRect(0, 0, width, height);
    context.font = "14px monospace";
    context.fillStyle = colors.normal;
    rainColumns.forEach((y, column) => {
      context.globalAlpha = 0.25 + Math.random() * 0.55;
      context.fillText(
        Math.random() > 0.5 ? "1" : "0",
        column * 18,
        y
      );
      if (!reducedMotion) {
        rainColumns[column] = y > height && Math.random() > 0.97
          ? 0
          : y + 9;
      }
    });
    context.globalAlpha = 1;
  };

  const drawEmbers = (colors) => {
    context.fillStyle = reducedMotion ? "#000" : "rgba(0, 0, 0, 0.2)";
    context.fillRect(0, 0, width, height);
    embers.forEach((ember) => {
      const gradient = context.createRadialGradient(
        ember.x, ember.y, 0, ember.x, ember.y, ember.size * 3
      );
      gradient.addColorStop(0, colors.medium);
      gradient.addColorStop(0.45, colors.high);
      gradient.addColorStop(1, "transparent");
      context.fillStyle = gradient;
      context.fillRect(
        ember.x - ember.size * 3,
        ember.y - ember.size * 3,
        ember.size * 6,
        ember.size * 6
      );
      if (!reducedMotion) {
        ember.y -= ember.speed;
        ember.x += ember.drift;
        if (ember.y < -10) {
          ember.y = height + 10;
          ember.x = Math.random() * width;
        }
      }
    });
  };

  const drawTopographic = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const motion = reducedMotion ? 0 : timestamp * 0.00012;
    const spacing = Math.max(24, height / 18);
    context.lineWidth = 1.2;
    for (let line = -2; line < 22; line += 1) {
      context.strokeStyle = line % 4 === 0 ? colors.medium : colors.accent;
      context.globalAlpha = line % 4 === 0 ? 0.38 : 0.2;
      context.beginPath();
      for (let x = -20; x <= width + 20; x += 12) {
        const wave = Math.sin(x * 0.012 + motion + line * 0.7) * 14 +
          Math.sin(x * 0.027 - motion * 1.7 + line) * 7;
        const ridge = Math.exp(
          -Math.pow((x - width * 0.56) / (width * 0.22), 2)
        ) * Math.sin(line * 0.75 + motion) * 38;
        const y = line * spacing + wave + ridge - spacing;
        if (x === -20) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const drawGeometricTunnel = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const travel = reducedMotion ? 0 : (timestamp * 0.00022) % 1;
    const sides = 8;
    for (let ring = 14; ring >= 0; ring -= 1) {
      const progress = (ring + travel) / 14;
      const radius = 8 + progress * Math.max(width, height) * 0.72;
      const rotation = timestamp * 0.00008 + progress * 0.35;
      context.strokeStyle = ring % 3 === 0 ? colors.medium : colors.accent;
      context.globalAlpha = 0.12 + (1 - progress) * 0.5;
      context.lineWidth = ring % 3 === 0 ? 1.8 : 1;
      context.beginPath();
      for (let side = 0; side <= sides; side += 1) {
        const angle = side / sides * Math.PI * 2 + rotation;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius * 0.62;
        if (side === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const drawEngineParticles = (colors) => {
    context.fillStyle = reducedMotion ? "#000" : "rgba(0, 0, 0, 0.38)";
    context.fillRect(0, 0, width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const rpmEnergy = Math.min(1, Math.max(0, (engineRpm - 750) / 5000));
    const manifoldLoad = Math.min(
      1,
      Math.max(0, (engineMapKpa - 40) / 180)
    );
    const loadEnergy = Math.min(1, Math.max(engineTps / 100, manifoldLoad));
    const speedEnergy = Math.min(1, vehicleSpeedMph / 100);
    const activity = rpmEnergy * 0.4 + loadEnergy * 0.4 + speedEnergy * 0.2;
    // A steeper curve keeps idle calm while making real load unmistakable.
    const energy = Math.pow(Math.max(0, activity), 1.55);
    const visibleStars = Math.round(55 + energy * 85);
    if (pendingAeBurst > 0) {
      const aeIntensity = Math.min(1, pendingAeBurst / 16);
      const burstSize = Math.min(
        110,
        12 + Math.round(pendingAeBurst * 6)
      );
      for (let index = 0; index < burstSize; index += 1) {
        aeStars.push({
          angle: Math.random() * Math.PI * 2,
          distance: 4 + Math.random() * 14,
          speed: 2.5 + Math.random() * (3 + aeIntensity * 8),
          size: 1.2 + Math.random() * (2 + aeIntensity * 3.5),
          life: 0.7 + aeIntensity * 0.6,
          spin: Math.random() * Math.PI * 2,
          colorRole: ["normal", "medium", "high"][
            Math.floor(Math.random() * 3)
          ]
        });
      }
      pendingAeBurst = 0;
    }
    stars.forEach((star, index) => {
      if (index >= visibleStars) return;
      const previousZ = star.z;
      if (!reducedMotion) star.z -= 1.2 + energy * 18;
      const scale = 260 / star.z;
      const previousScale = 260 / previousZ;
      const x = centerX + star.x * scale;
      const y = centerY + star.y * scale;
      const previousX = centerX + star.x * previousScale;
      const previousY = centerY + star.y * previousScale;
      if (
        star.z <= 1 ||
        x < -10 || x > width + 10 ||
        y < -10 || y > height + 10
      ) {
        resetStar(star);
        return;
      }
      const role = ["low", "normal", "medium", "high"][index % 4];
      const depthAlpha = Math.max(0.18, 1 - star.z / DEPTH);
      context.strokeStyle = colors[role];
      context.fillStyle = colors[role];
      context.globalAlpha = depthAlpha * (0.45 + energy * 0.55);
      context.lineWidth = 0.8 + depthAlpha * (1.2 + energy * 2.5);
      context.beginPath();
      context.moveTo(previousX, previousY);
      context.lineTo(x, y);
      context.stroke();
      context.fillRect(x, y, context.lineWidth, context.lineWidth);
    });
    aeStars = aeStars.filter((star) => {
      const x = centerX + Math.cos(star.angle) * star.distance;
      const y = centerY + Math.sin(star.angle) * star.distance * 0.62;
      context.save();
      context.translate(x, y);
      context.rotate(star.spin);
      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = point * Math.PI / 5 - Math.PI / 2;
        const radius = point % 2 === 0 ? star.size * 2.2 : star.size;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (point === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.globalAlpha = Math.max(0, star.life);
      context.fillStyle = colors[star.colorRole];
      context.fill();
      context.restore();
      if (!reducedMotion) {
        star.distance += star.speed;
        star.speed *= 0.985;
        star.life -= 0.018;
        star.spin += 0.08;
      }
      return star.life > 0;
    });
    context.globalAlpha = 1;
  };

  const drawOscilloscope = (timestamp, colors) => {
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(0, 0, width, height);
    const energy = Math.min(1, engineRpm / 6000);
    [colors.low, colors.normal, colors.medium, colors.high].forEach(
      (color, channel) => {
        context.strokeStyle = color;
        context.globalAlpha = 0.55;
        context.lineWidth = 1.5;
        context.beginPath();
        for (let x = 0; x <= width; x += 8) {
          const y = height * (0.2 + channel * 0.2) +
            Math.sin(x * (0.018 + channel * 0.004) +
              timestamp * 0.003 * (1 + energy)) *
              (8 + energy * 28);
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    );
    context.globalAlpha = 1;
  };

  const drawRadar = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const radius = Math.min(width, height) * 0.42;
    const cx = width / 2;
    const cy = height / 2;
    context.strokeStyle = colors.normal;
    context.globalAlpha = 0.22;
    [0.25, 0.5, 0.75, 1].forEach((scale) => {
      context.beginPath();
      context.arc(cx, cy, radius * scale, 0, Math.PI * 2);
      context.stroke();
    });
    const angle = reducedMotion ? 0 : timestamp * 0.0012;
    const beam = context.createLinearGradient(
      cx, cy, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius
    );
    beam.addColorStop(0, colors.normal);
    beam.addColorStop(1, "transparent");
    context.strokeStyle = beam;
    context.globalAlpha = 0.75;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    context.stroke();
    stars.slice(0, 18).forEach((star, index) => {
      context.fillStyle = colors[["low", "normal", "medium", "high"][index % 4]];
      context.globalAlpha = 0.45;
      context.fillRect(
        cx + star.x / width * radius,
        cy + star.y / height * radius,
        3,
        3
      );
    });
    context.globalAlpha = 1;
  };

  const drawPlasma = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    [colors.low, colors.normal, colors.medium, colors.high].forEach(
      (color, index) => {
        const x = width * (0.5 + Math.sin(timestamp * 0.0002 +
          index * 1.7) * 0.38);
        const y = height * (0.5 + Math.cos(timestamp * 0.00017 +
          index * 1.3) * 0.38);
        const gradient = context.createRadialGradient(
          x, y, 0, x, y, Math.max(width, height) * 0.55
        );
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "transparent");
        context.globalAlpha = 0.16;
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      }
    );
    context.globalAlpha = 1;
  };

  const drawTopographicGlobe = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.38;
    const rotation = timestamp * 0.00025;
    context.strokeStyle = colors.accent;
    context.lineWidth = 1;
    for (let latitude = -5; latitude <= 5; latitude += 1) {
      const ratio = latitude / 6;
      context.globalAlpha = 0.18 + (1 - Math.abs(ratio)) * 0.3;
      context.beginPath();
      context.ellipse(
        cx,
        cy + ratio * radius,
        Math.cos(Math.asin(ratio)) * radius,
        radius * 0.13,
        Math.sin(rotation + latitude) * 0.08,
        0,
        Math.PI * 2
      );
      context.stroke();
    }
    for (let longitude = 0; longitude < 9; longitude += 1) {
      context.beginPath();
      context.ellipse(
        cx, cy, radius * Math.abs(Math.cos(rotation + longitude * Math.PI / 9)),
        radius, 0, 0, Math.PI * 2
      );
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const drawVortex = (timestamp, colors) => {
    context.fillStyle = "rgba(0, 0, 0, 0.3)";
    context.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const speed = 0.00035 + Math.min(1, engineRpm / 6000) * 0.0015;
    stars.forEach((star, index) => {
      const progress = ((timestamp * speed + index / stars.length) % 1);
      const radius = progress * Math.hypot(width, height) * 0.5;
      const angle = progress * Math.PI * 7 + index;
      context.fillStyle = colors[["low", "normal", "medium", "high"][index % 4]];
      context.globalAlpha = 0.2 + progress * 0.7;
      context.fillRect(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius * 0.6,
        1 + progress * 3,
        1 + progress * 3
      );
    });
    context.globalAlpha = 1;
  };

  const drawEqualizer = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const bars = 36;
    const barWidth = width / bars;
    const energy = 0.12 + Math.min(1, engineRpm / 6000) * 0.88;
    for (let index = 0; index < bars; index += 1) {
      const wave = (0.2 + Math.abs(Math.sin(
        timestamp * 0.002 + index * 0.42
      )) * 0.8) * energy;
      const barHeight = wave * height * 0.72;
      context.fillStyle = colors[["low", "normal", "medium", "high"][
        Math.min(3, Math.floor(wave * 4))
      ]];
      context.globalAlpha = 0.55;
      context.fillRect(
        index * barWidth + 2,
        height - barHeight,
        Math.max(2, barWidth - 4),
        barHeight
      );
    }
    context.globalAlpha = 1;
  };

  const drawLightTrails = (timestamp, colors) => {
    context.fillStyle = "rgba(0, 0, 0, 0.18)";
    context.fillRect(0, 0, width, height);
    [colors.low, colors.normal, colors.medium, colors.high].forEach(
      (color, index) => {
        context.strokeStyle = color;
        context.globalAlpha = 0.32;
        context.lineWidth = 5 + index * 2;
        context.beginPath();
        for (let x = -20; x < width + 20; x += 14) {
          const y = height * (0.2 + index * 0.2) +
            Math.sin(x * 0.009 + timestamp * 0.001 *
              (1 + vehicleSpeedMph / 40) + index) * 45;
          if (x === -20) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    );
    context.globalAlpha = 1;
  };

  const drawHexGrid = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const size = 24;
    const pulse = timestamp * 0.002 + engineTps * 0.03;
    for (let row = -1; row < height / 36 + 2; row += 1) {
      for (let column = -1; column < width / 42 + 2; column += 1) {
        const cx = column * size * 1.73 + (row % 2) * size * 0.865;
        const cy = row * size * 1.5;
        context.strokeStyle = colors[
          ["low", "normal", "medium", "high"][
            Math.abs(row + column) % 4
          ]
        ];
        context.globalAlpha = 0.1 + Math.max(
          0,
          Math.sin(pulse - Math.hypot(cx - width / 2, cy - height / 2) * 0.018)
        ) * 0.38;
        context.beginPath();
        for (let side = 0; side <= 6; side += 1) {
          const angle = side * Math.PI / 3;
          const x = cx + Math.cos(angle) * size;
          const y = cy + Math.sin(angle) * size;
          if (side === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  };

  const drawConstellations = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const points = stars.slice(0, 42).map((star, index) => ({
      x: ((star.x + width / 2 + timestamp * 0.006) % width + width) % width,
      y: ((star.y + height / 2 + index * 13) % height + height) % height
    }));
    context.strokeStyle = colors.accent;
    context.globalAlpha = 0.16;
    points.forEach((point, index) => {
      const next = points[index + 1];
      if (!next || Math.hypot(point.x - next.x, point.y - next.y) > 180) return;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(next.x, next.y);
      context.stroke();
    });
    points.forEach((point, index) => {
      context.fillStyle = colors[["low", "normal", "medium", "high"][index % 4]];
      context.globalAlpha = 0.65;
      context.fillRect(point.x, point.y, 2, 2);
    });
    context.globalAlpha = 1;
  };

  const drawFireflies = (timestamp, colors) => {
    context.fillStyle = "rgba(0, 0, 0, 0.2)";
    context.fillRect(0, 0, width, height);
    embers.forEach((fly, index) => {
      fly.x += Math.sin(timestamp * 0.001 + index) * 0.22;
      fly.y += Math.cos(timestamp * 0.0008 + index) * 0.18;
      if (fly.x < 0) fly.x = width;
      if (fly.x > width) fly.x = 0;
      if (fly.y < 0) fly.y = height;
      if (fly.y > height) fly.y = 0;
      context.fillStyle = colors[index % 3 === 0 ? "medium" : "normal"];
      context.globalAlpha = 0.2 + Math.abs(Math.sin(timestamp * 0.002 + index)) * 0.65;
      context.beginPath();
      context.arc(fly.x, fly.y, fly.size, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  };

  const drawRainGlass = (timestamp, colors) => {
    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    context.fillRect(0, 0, width, height);
    rainColumns.forEach((y, index) => {
      const x = index * 18;
      const length = 6 + vehicleSpeedMph * 0.2;
      context.strokeStyle = colors.low;
      context.globalAlpha = 0.18 + index % 5 * 0.08;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - vehicleSpeedMph * 0.04, y + length);
      context.stroke();
      rainColumns[index] = (y + 2 + vehicleSpeedMph * 0.08) % height;
    });
    context.globalAlpha = 1;
  };

  const drawVectorMountains = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = colors.accent;
    const offset = timestamp * 0.03 * (0.4 + vehicleSpeedMph / 60);
    for (let row = 0; row < 14; row += 1) {
      const yBase = height * 0.36 + row * height * 0.055;
      context.globalAlpha = 0.12 + row * 0.025;
      context.beginPath();
      for (let x = -20; x <= width + 20; x += 20) {
        const worldX = x + offset;
        const y = yBase - Math.abs(Math.sin(worldX * 0.008 + row * 0.4)) *
          (80 - row * 3);
        if (x === -20) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const drawDataStream = (timestamp, colors) => {
    context.fillStyle = "rgba(0, 0, 0, 0.2)";
    context.fillRect(0, 0, width, height);
    const values = [
      `RPM ${Math.round(engineRpm)}`,
      `MAP ${Math.round(engineMapKpa)}`,
      `TPS ${Math.round(engineTps)}%`,
      `MPH ${Math.round(vehicleSpeedMph)}`
    ];
    context.font = "14px var(--dashboard-font), monospace";
    for (let row = 0; row < 18; row += 1) {
      const x = (width + 180 -
        (timestamp * (0.012 + row % 4 * 0.004) + row * 137) %
          (width + 360));
      context.fillStyle = colors[["low", "normal", "medium", "high"][row % 4]];
      context.globalAlpha = 0.16 + row % 3 * 0.12;
      context.fillText(values[row % values.length], x, 30 + row * 34);
    }
    context.globalAlpha = 1;
  };

  const drawPulseRings = (timestamp, colors) => {
    context.fillStyle = "rgba(0, 0, 0, 0.32)";
    context.fillRect(0, 0, width, height);
    const energy = 0.3 + Math.min(1, engineRpm / 6000) * 1.7;
    for (let ring = 0; ring < 10; ring += 1) {
      const progress = (timestamp * 0.00035 * energy + ring / 10) % 1;
      context.strokeStyle = colors[["low", "normal", "medium", "high"][ring % 4]];
      context.globalAlpha = (1 - progress) * 0.5;
      context.lineWidth = 1 + progress * 3;
      context.beginPath();
      context.arc(
        width / 2, height / 2,
        progress * Math.hypot(width, height) * 0.55,
        0, Math.PI * 2
      );
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const drawEngineOrbit = (timestamp, colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const values = [
      engineRpm / 6000,
      engineMapKpa / 220,
      engineTps / 100,
      vehicleSpeedMph / 100
    ];
    values.forEach((rawValue, index) => {
      const value = Math.max(0, Math.min(1, rawValue));
      const radius = 60 + index * 48;
      const angle = timestamp * (0.00025 + value * 0.0012) * (index % 2 ? -1 : 1);
      const color = colors[["low", "normal", "medium", "high"][index]];
      context.strokeStyle = color;
      context.globalAlpha = 0.2;
      context.beginPath();
      context.ellipse(cx, cy, radius, radius * 0.48, 0, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = color;
      context.globalAlpha = 0.8;
      context.beginPath();
      context.arc(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius * 0.48,
        4 + value * 7,
        0, Math.PI * 2
      );
      context.fill();
    });
    context.globalAlpha = 1;
  };

  const drawClock = (colors) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    const now = new Date();
    context.textAlign = "center";
    context.fillStyle = colors.accent;
    context.font = `700 ${Math.max(54, height * 0.16)}px var(--dashboard-font)`;
    context.globalAlpha = 0.78;
    context.fillText(
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      width / 2,
      height / 2
    );
    context.font = `600 ${Math.max(18, height * 0.045)}px var(--dashboard-font)`;
    context.fillStyle = colors.normal;
    context.fillText(now.toLocaleDateString(), width / 2, height / 2 + 55);
    context.textAlign = "start";
    context.globalAlpha = 1;
  };

  const resetStar = (star) => {
    Object.assign(star, randomStar(width, height, DEPTH));
  };

  const spawnPlanet = (timestamp) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.min(width, height) * (0.25 + Math.random() * 0.3);
    planets.push({
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      z: DEPTH,
      radius: 3 + Math.random() * 3,
      color: ["#6e8fb7", "#b78b62", "#7f9b73", "#9a789f"][
        Math.floor(Math.random() * 4)
      ],
      ringed: Math.random() < 0.25
    });
    nextPlanetTime =
      timestamp + PLANET_MIN_DELAY_MS + Math.random() * PLANET_DELAY_RANGE_MS;
  };

  const drawPlanet = (planet, centerX, centerY) => {
    const scale = 260 / planet.z;
    const x = centerX + planet.x * scale;
    const y = centerY + planet.y * scale;
    const radius = Math.min(10, Math.max(2, planet.radius * scale));
    if (planet.ringed) {
      context.strokeStyle = "rgba(220, 225, 235, 0.75)";
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(x, y, radius * 1.65, radius * 0.55, -0.35, 0, Math.PI * 2);
      context.stroke();
    }
    context.fillStyle = planet.color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.4)";
    context.beginPath();
    context.arc(
      x - radius * 0.3,
      y - radius * 0.3,
      Math.max(1, radius * 0.22),
      0,
      Math.PI * 2
    );
    context.fill();
    return x >= -20 && x <= width + 20 && y >= -20 && y <= height + 20;
  };

  const spawnShootingStar = (timestamp) => {
    const fromLeft = Math.random() < 0.5;
    shootingStar = {
      x: fromLeft ? -30 : width + 30,
      y: height * (0.08 + Math.random() * 0.35),
      vx: fromLeft ? 15 + Math.random() * 6 : -(15 + Math.random() * 6),
      vy: 5 + Math.random() * 4,
      bornAt: timestamp,
      lifetime: 900 + Math.random() * 500
    };
    nextShootingStarTime = timestamp +
      SHOOTING_STAR_MIN_DELAY_MS +
      Math.random() * SHOOTING_STAR_DELAY_RANGE_MS;
  };

  const drawShootingStar = (timestamp) => {
    if (!shootingStar) return;
    const age = timestamp - shootingStar.bornAt;
    if (age >= shootingStar.lifetime) {
      shootingStar = null;
      return;
    }
    shootingStar.x += shootingStar.vx;
    shootingStar.y += shootingStar.vy;
    const tailScale = 5;
    context.globalAlpha = Math.sin(age / shootingStar.lifetime * Math.PI);
    context.strokeStyle = "#d9efff";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(shootingStar.x, shootingStar.y);
    context.lineTo(
      shootingStar.x - shootingStar.vx * tailScale,
      shootingStar.y - shootingStar.vy * tailScale
    );
    context.stroke();
    context.globalAlpha = 1;
  };

  window.addEventListener("boost-mode-change", (event) => {
    if (!event.detail?.high || reducedMotion) return;
    warpStartedAt = performance.now();
    warpUntil = warpStartedAt + WARP_DURATION_MS;
  });
  const draw = (timestamp) => {
    if (document.hidden) {
      previousFrame = timestamp;
      requestAnimationFrame(draw);
      return;
    }
    if (timestamp - previousFrame < FRAME_INTERVAL_MS) {
      requestAnimationFrame(draw);
      return;
    }
    previousFrame = timestamp;
    let screenSaver = document.body.dataset.screenSaver || "starfield";
    if (screenSaver === "random") {
      if (timestamp >= randomModeUntil) {
        const randomModes = [
          "starfield", "aurora", "grid", "digital-rain", "embers",
          "topographic", "geometric-tunnel", "engine-particles",
          "oscilloscope", "radar", "plasma", "topographic-globe",
          "particle-vortex", "equalizer-skyline", "light-trails",
          "hex-grid", "constellations", "fireflies", "rain-glass",
          "vector-mountains", "data-stream", "pulse-rings", "engine-orbit"
        ];
        randomMode = randomModes[
          Math.floor(Math.random() * randomModes.length)
        ];
        randomModeUntil = timestamp + 30_000;
      }
      screenSaver = randomMode;
    }
    const colors = themeColors();
    if (screenSaver !== "starfield") {
      if (screenSaver === "aurora") drawAurora(timestamp, colors);
      else if (screenSaver === "grid") drawGrid(timestamp, colors);
      else if (screenSaver === "digital-rain") drawDigitalRain(colors);
      else if (screenSaver === "embers") drawEmbers(colors);
      else if (screenSaver === "topographic") {
        drawTopographic(timestamp, colors);
      } else if (screenSaver === "geometric-tunnel") {
        drawGeometricTunnel(timestamp, colors);
      } else if (screenSaver === "engine-particles") {
        drawEngineParticles(colors);
      } else if (screenSaver === "oscilloscope") {
        drawOscilloscope(timestamp, colors);
      } else if (screenSaver === "radar") {
        drawRadar(timestamp, colors);
      } else if (screenSaver === "plasma") {
        drawPlasma(timestamp, colors);
      } else if (screenSaver === "topographic-globe") {
        drawTopographicGlobe(timestamp, colors);
      } else if (screenSaver === "particle-vortex") {
        drawVortex(timestamp, colors);
      } else if (screenSaver === "equalizer-skyline") {
        drawEqualizer(timestamp, colors);
      } else if (screenSaver === "light-trails") {
        drawLightTrails(timestamp, colors);
      } else if (screenSaver === "hex-grid") {
        drawHexGrid(timestamp, colors);
      } else if (screenSaver === "constellations") {
        drawConstellations(timestamp, colors);
      } else if (screenSaver === "fireflies") {
        drawFireflies(timestamp, colors);
      } else if (screenSaver === "rain-glass") {
        drawRainGlass(timestamp, colors);
      } else if (screenSaver === "vector-mountains") {
        drawVectorMountains(timestamp, colors);
      } else if (screenSaver === "data-stream") {
        drawDataStream(timestamp, colors);
      } else if (screenSaver === "pulse-rings") {
        drawPulseRings(timestamp, colors);
      } else if (screenSaver === "engine-orbit") {
        drawEngineOrbit(timestamp, colors);
      } else if (screenSaver === "clock") {
        drawClock(colors);
      }
      else {
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
      }
      if (!reducedMotion) requestAnimationFrame(draw);
      return;
    }
    context.fillStyle = reducedMotion ? "#000" : "rgba(0, 0, 0, 0.55)";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#fff";
    context.fillStyle = "#fff";

    const centerX = width / 2;
    const centerY = height / 2;
    const warpProgress = timestamp < warpUntil
      ? (timestamp - warpStartedAt) / WARP_DURATION_MS
      : 1;
    const warpMultiplier = timestamp < warpUntil
      ? 1 + Math.sin(Math.max(0, warpProgress) * Math.PI) * 2.5
      : 1;
    const roadSpeedMultiplier = 0.6 + vehicleSpeedMph / 120 * 1.4;
    for (const star of stars) {
      const previousZ = star.z;
      if (!reducedMotion) {
        star.z -= SPEED * roadSpeedMultiplier * warpMultiplier;
      }
      const scale = 260 / star.z;
      const previousScale = 260 / previousZ;
      const x = centerX + star.x * scale;
      const y = centerY + star.y * scale;
      const previousX = centerX + star.x * previousScale;
      const previousY = centerY + star.y * previousScale;

      if (
        star.z <= 1 ||
        x < -10 ||
        x > width + 10 ||
        y < -10 ||
        y > height + 10
      ) {
        resetStar(star);
        continue;
      }

      const twinkle =
        0.72 + Math.sin(timestamp * star.twinkleSpeed + star.twinklePhase) * 0.28;
      context.globalAlpha =
        Math.max(0.25, 1 - star.z / DEPTH) * twinkle;
      context.lineWidth = Math.max(1.25, (1 - star.z / DEPTH) * 2.7);
      context.beginPath();
      context.moveTo(previousX, previousY);
      context.lineTo(x, y);
      context.stroke();
      context.fillRect(x, y, context.lineWidth, context.lineWidth);
    }
    context.globalAlpha = 1;
    if (!reducedMotion && planets.length === 0 && timestamp >= nextPlanetTime) {
      spawnPlanet(timestamp);
    }
    planets = planets.filter((planet) => {
      if (!reducedMotion) {
        planet.z -= SPEED * roadSpeedMultiplier * 0.65;
      }
      return planet.z > 1 && drawPlanet(planet, centerX, centerY);
    });
    if (
      !reducedMotion &&
      !shootingStar &&
      timestamp >= nextShootingStarTime
    ) {
      spawnShootingStar(timestamp);
    }
    drawShootingStar(timestamp);
    if (!reducedMotion) requestAnimationFrame(draw);
  };

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
}
