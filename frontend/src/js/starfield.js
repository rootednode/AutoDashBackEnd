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

export function setStarfieldVehicleSpeed(speedMph) {
  const numericSpeed = Number(speedMph);
  vehicleSpeedMph = Number.isFinite(numericSpeed)
    ? Math.max(0, Math.min(120, numericSpeed))
    : 0;
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
  let previousFrame = 0;
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
    planets = [];
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
