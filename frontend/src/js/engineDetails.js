function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function setAeReadout(id, label, value) {
  const element = document.getElementById(id);
  if (!element) return;
  let labelElement = element.querySelector(".ae-readout-label");
  let valueElement = element.querySelector(".ae-readout-value");
  if (!labelElement || !valueElement) {
    labelElement = document.createElement("span");
    labelElement.className = "ae-readout-label";
    valueElement = document.createElement("strong");
    valueElement.className = "ae-readout-value";
    element.replaceChildren(labelElement, " ", valueElement);
  }
  labelElement.textContent = label;
  valueElement.textContent = value;
}

const AE_TPS_DOT_BINS = [20, 100, 300, 700];
const AE_TPS_DOT_BIN_ROLES = ["low", "normal", "medium", "high"];
const AE_HISTORY_SAMPLE_MS = 100;
const AE_HISTORY_LENGTH = 110;
const AE_HISTORY_MIN_SCALE = 10;
const TPS_DOT_HISTORY_LENGTH = 110;
const TPS_DOT_HISTORY_SAMPLE_MS = 100;
const TPS_DOT_HISTORY_MIN_SCALE = 100;
const AFR_HISTORY_LENGTH = 110;
const AFR_HISTORY_SAMPLE_MS = 100;
const AFR_HISTORY_MIN = 9;
const AFR_HISTORY_MAX = 20;
const AFR_REFERENCE = 14.7;
const AE_TPS_LOOKBACK_MS = 300;
const AE_AFR_BASELINE_MS = 750;
const AE_AFR_RESPONSE_MS = 1500;
const AE_AFR_RESPONSE_DELAY_MS = 100;
const AE_AFR_BASELINE_MIN_SAMPLES = 4;
const AE_AFR_BASELINE_MAX_RANGE = 1.0;
const AE_AFR_BASELINE_MAX = 18.0;
const AE_AFR_EVENT_MAX_DEVIATION = 1.0;
const AE_EVENT_RELEASE_MS = 250;
const AE_ACTIVE_MIN_PCT = 0.1;

let aeHistory = [];
let lastAeHistorySample = 0;
let afrHistory = [];
let lastAfrHistorySample = 0;
let tpsDotHistory = [];
let lastTpsDotHistorySample = 0;
const recentTpsDot = [];
const recentAfr = [];
const pendingAfrResponses = [];
const aeBinStats = AE_TPS_DOT_BINS.map(() => ({
  hits: 0,
  afrResponseWeight: 0,
  totalAfrDelta: 0,
  stableEvents: 0,
  timingWeight: 0,
  totalTriggerDelay: 0,
  initialResponseWeight: 0,
  totalInitialAfrDelta: 0,
  tailResponseWeight: 0,
  totalTailAfrDelta: 0
}));
let currentAeEvent = null;
let lastTpsRate = null;

function themeColor(role, fallback) {
  return getComputedStyle(document.body)
    .getPropertyValue(`--dash-${role}-color`)
    .trim() || fallback;
}

function hexToRgb(color, fallback) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return match
    ? match.slice(1).map((value) => parseInt(value, 16))
    : fallback;
}

function dashboardValueColor() {
  return getComputedStyle(document.body)
    .getPropertyValue("--dash-value")
    .trim() || "#ffffff";
}

function displayedCanvas(canvas) {
  const cssWidth = Math.round(canvas.clientWidth);
  const cssHeight = Math.round(canvas.clientHeight);
  const width = cssWidth > 0 ? cssWidth : canvas.width;
  const height = cssHeight > 0 ? cssHeight : canvas.height;
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { context, width, height };
}

function pruneSamples(samples, cutoff) {
  while (samples.length > 0 && samples[0].time < cutoff) samples.shift();
}

function median(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function drawAeHistogram() {
  const canvas = document.getElementById("aehistogram");
  if (!canvas) return;

  const { context, width, height } = displayedCanvas(canvas);
  const baselineY = height - 1;
  const barWidth = width / AE_HISTORY_LENGTH;
  const scale = Math.max(
    AE_HISTORY_MIN_SCALE,
    ...aeHistory.map((value) => Math.max(0, value))
  );

  context.clearRect(0, 0, width, height);
  const accent = getComputedStyle(document.body)
    .getPropertyValue("--dash-accent")
    .trim() || "#ffb000";
  context.fillStyle = `${accent}8c`;
  context.fillRect(0, baselineY, width, 1);

  const startX = width - aeHistory.length * barWidth;
  aeHistory.forEach((value, index) => {
    const magnitude = Math.min(Math.max(0, value) / scale, 1);
    const barHeight = magnitude * (height - 3);
    const x = startX + index * barWidth;

    context.fillStyle = accent;
    context.fillRect(
      x,
      baselineY - barHeight,
      Math.max(1, barWidth - 1),
      barHeight
    );
  });
}

function sampleAeHistory(aeAmount, now) {
  if (
    lastAeHistorySample &&
    now - lastAeHistorySample < AE_HISTORY_SAMPLE_MS
  ) {
    return;
  }

  lastAeHistorySample = now;
  aeHistory.push(aeAmount);
  if (aeHistory.length > AE_HISTORY_LENGTH) aeHistory.shift();
}

function sampleAfrHistory(afr, now) {
  if (
    !Number.isFinite(afr) ||
    (lastAfrHistorySample && now - lastAfrHistorySample < AFR_HISTORY_SAMPLE_MS)
  ) {
    return;
  }
  lastAfrHistorySample = now;
  afrHistory.push(afr);
  if (afrHistory.length > AFR_HISTORY_LENGTH) afrHistory.shift();
}

function drawAfrHistogram() {
  const canvas = document.getElementById("afrhistogram");
  if (!canvas) return;
  const { context, width, height } = displayedCanvas(canvas);
  const valueY = (value) => height -
    (Math.max(AFR_HISTORY_MIN, Math.min(AFR_HISTORY_MAX, value)) -
      AFR_HISTORY_MIN) /
      (AFR_HISTORY_MAX - AFR_HISTORY_MIN) * height;
  const referenceY = valueY(AFR_REFERENCE);
  const barWidth = width / AFR_HISTORY_LENGTH;
  const startX = width - afrHistory.length * barWidth;
  const leanColor = themeColor("high", "#ff3344");
  const richColor = themeColor("low", "#3388ff");
  const normalColor = themeColor("normal", "#22dd77");

  context.clearRect(0, 0, width, height);
  context.strokeStyle = normalColor;
  context.globalAlpha = 0.55;
  context.beginPath();
  context.moveTo(0, referenceY);
  context.lineTo(width, referenceY);
  context.stroke();

  afrHistory.forEach((afr, index) => {
    const y = valueY(afr);
    const delta = afr - AFR_REFERENCE;
    context.fillStyle = Math.abs(delta) <= 0.3
      ? normalColor
      : delta > 0 ? leanColor : richColor;
    context.globalAlpha = 0.78;
    context.fillRect(
      startX + index * barWidth,
      Math.min(y, referenceY),
      Math.max(1, barWidth - 1),
      Math.max(1, Math.abs(referenceY - y))
    );
  });
  context.globalAlpha = 1;
}

function sampleTpsDotHistory(tpsDot, now) {
  if (
    !Number.isFinite(tpsDot) ||
    (lastTpsDotHistorySample &&
      now - lastTpsDotHistorySample < TPS_DOT_HISTORY_SAMPLE_MS)
  ) {
    return;
  }
  lastTpsDotHistorySample = now;
  tpsDotHistory.push(tpsDot);
  if (tpsDotHistory.length > TPS_DOT_HISTORY_LENGTH) tpsDotHistory.shift();
}

function drawTpsDotHistogram() {
  const canvas = document.getElementById("tpsdothistogram");
  if (!canvas) return;
  const { context, width, height } = displayedCanvas(canvas);
  const baselineY = height / 2;
  const scale = Math.max(
    TPS_DOT_HISTORY_MIN_SCALE,
    ...tpsDotHistory.map((value) => Math.abs(value))
  );
  const barWidth = width / TPS_DOT_HISTORY_LENGTH;
  const startX = width - tpsDotHistory.length * barWidth;

  context.clearRect(0, 0, width, height);
  context.strokeStyle = themeColor("low", "#3388ff");
  context.globalAlpha = 0.5;
  context.beginPath();
  context.moveTo(0, baselineY);
  context.lineTo(width, baselineY);
  context.stroke();

  tpsDotHistory.forEach((value, index) => {
    const magnitude = Math.min(1, Math.abs(value) / scale);
    const barHeight = Math.max(1, magnitude * (height / 2 - 1));
    let color = themeColor("low", "#3388ff");
    if (value >= 300) color = themeColor("high", "#ff3344");
    else if (value >= 100) color = themeColor("medium", "#ffb020");
    else if (value >= 20) color = themeColor("normal", "#22dd77");
    context.fillStyle = color;
    context.globalAlpha = 0.8;
    context.fillRect(
      startX + index * barWidth,
      value >= 0 ? baselineY - barHeight : baselineY,
      Math.max(1, barWidth - 1),
      barHeight
    );
  });
  context.globalAlpha = 1;
}

function activeBinWeights(tpsDot) {
  if (!Number.isFinite(tpsDot) || tpsDot < AE_TPS_DOT_BINS[0]) return [];
  if (tpsDot >= AE_TPS_DOT_BINS[AE_TPS_DOT_BINS.length - 1]) {
    return [{ index: AE_TPS_DOT_BINS.length - 1, weight: 1 }];
  }

  for (let index = 0; index < AE_TPS_DOT_BINS.length - 1; index++) {
    const lower = AE_TPS_DOT_BINS[index];
    const upper = AE_TPS_DOT_BINS[index + 1];
    if (tpsDot > upper) continue;

    const upperWeight = (tpsDot - lower) / (upper - lower);
    return [
      { index, weight: 1 - upperWeight },
      { index: index + 1, weight: upperWeight }
    ].filter((entry) => entry.weight > 0);
  }

  return [];
}

function finishAfrResponses(now, afr) {
  for (let index = pendingAfrResponses.length - 1; index >= 0; index--) {
    const response = pendingAfrResponses[index];

    if (
      Number.isFinite(afr) &&
      now >= response.responseStartsAt &&
      now <= response.deadline
    ) {
      response.minAfr = Math.min(response.minAfr, afr);
      response.maxAfr = Math.max(response.maxAfr, afr);
      response.sampleCount += 1;
      const phase = now <= response.initialEndsAt ? "initial" : "tail";
      response[`${phase}MinAfr`] = Math.min(
        response[`${phase}MinAfr`],
        afr
      );
      response[`${phase}MaxAfr`] = Math.max(
        response[`${phase}MaxAfr`],
        afr
      );
      response[`${phase}SampleCount`] += 1;
    }

    if (now < response.deadline) continue;

    if (response.sampleCount === 0) {
      pendingAfrResponses.splice(index, 1);
      continue;
    }

    const leanDelta = response.maxAfr - response.baselineAfr;
    const richDelta = response.minAfr - response.baselineAfr;
    const dominantDelta = Math.abs(leanDelta) >= Math.abs(richDelta)
      ? leanDelta
      : richDelta;
    const phaseDelta = (phase) => {
      if (response[`${phase}SampleCount`] === 0) return null;
      const phaseLean =
        response[`${phase}MaxAfr`] - response.baselineAfr;
      const phaseRich =
        response[`${phase}MinAfr`] - response.baselineAfr;
      return Math.abs(phaseLean) >= Math.abs(phaseRich)
        ? phaseLean
        : phaseRich;
    };
    const initialDelta = phaseDelta("initial");
    const tailDelta = phaseDelta("tail");

    response.binWeights.forEach(({ index: binIndex, weight }) => {
      const stat = aeBinStats[binIndex];
      stat.afrResponseWeight += weight;
      stat.totalAfrDelta += dominantDelta * weight;
      stat.stableEvents += weight;
      stat.timingWeight += weight;
      stat.totalTriggerDelay += response.triggerDelay * weight;
      if (initialDelta !== null) {
        stat.initialResponseWeight += weight;
        stat.totalInitialAfrDelta += initialDelta * weight;
      }
      if (tailDelta !== null) {
        stat.tailResponseWeight += weight;
        stat.totalTailAfrDelta += tailDelta * weight;
      }
    });
    pendingAfrResponses.splice(index, 1);
  }
}

function updateAeTuningSummary(now, aeAmount, tpsDot, afr, source) {
  if (source === "tpsDot") {
    recentTpsDot.push({ time: now, value: tpsDot });
    pruneSamples(recentTpsDot, now - AE_TPS_LOOKBACK_MS);
  }

  const aeActive = aeAmount >= AE_ACTIVE_MIN_PCT;
  if (
    source === "afr" &&
    !aeActive &&
    !currentAeEvent &&
    Number.isFinite(afr)
  ) {
    recentAfr.push({ time: now, value: afr });
    pruneSamples(recentAfr, now - AE_AFR_BASELINE_MS);
  }

  finishAfrResponses(now, source === "afr" ? afr : null);

  if (source === "ae" && aeActive) {
    if (!currentAeEvent) {
      const peakTpsDotSample = recentTpsDot.reduce(
        (peak, sample) => sample.value > peak.value ? sample : peak,
        { value: tpsDot, time: now }
      );
      const peakTpsDot = peakTpsDotSample.value;
      const binWeights = activeBinWeights(peakTpsDot);

      binWeights.forEach(({ index: binIndex, weight }) => {
        aeBinStats[binIndex].hits += weight;
      });

      const baselineValues = recentAfr.map((sample) => sample.value);
      const baselineAfr = median(baselineValues);
      const baselineRange = baselineValues.length > 0
        ? Math.max(...baselineValues) - Math.min(...baselineValues)
        : Infinity;
      const baselineIsStable =
        baselineValues.length >= AE_AFR_BASELINE_MIN_SAMPLES &&
        baselineRange <= AE_AFR_BASELINE_MAX_RANGE &&
        Number.isFinite(baselineAfr) &&
        baselineAfr <= AE_AFR_BASELINE_MAX &&
        Number.isFinite(afr) &&
        Math.abs(afr - baselineAfr) <= AE_AFR_EVENT_MAX_DEVIATION;
      if (
        binWeights.length > 0 &&
        baselineIsStable
      ) {
        pendingAfrResponses.push({
          binWeights,
          baselineAfr,
          minAfr: Infinity,
          maxAfr: -Infinity,
          sampleCount: 0,
          initialMinAfr: Infinity,
          initialMaxAfr: -Infinity,
          initialSampleCount: 0,
          tailMinAfr: Infinity,
          tailMaxAfr: -Infinity,
          tailSampleCount: 0,
          triggerDelay: Math.max(0, now - peakTpsDotSample.time),
          responseStartsAt: now + AE_AFR_RESPONSE_DELAY_MS,
          initialEndsAt: now + 500,
          deadline: now + AE_AFR_RESPONSE_MS
        });
      }

      currentAeEvent = { lastActiveAt: now };
    } else {
      currentAeEvent.lastActiveAt = now;
    }
  } else if (
    currentAeEvent &&
    now - currentAeEvent.lastActiveAt >= AE_EVENT_RELEASE_MS
  ) {
    currentAeEvent = null;
  }
}

function drawAeBins(tpsDot = null) {
  const canvas = document.getElementById("aebindisplay");
  if (!canvas) return;

  const { context, width, height } = displayedCanvas(canvas);
  const labelHeight = 21;
  const plotHeight = height - labelHeight;
  const gap = 6;
  const barWidth = (width - gap * (AE_TPS_DOT_BINS.length + 1)) /
    AE_TPS_DOT_BINS.length;
  const weights = activeBinWeights(tpsDot);

  context.clearRect(0, 0, width, height);

  AE_TPS_DOT_BINS.forEach((bin, index) => {
    const x = gap + index * (barWidth + gap);
    const active = weights.find((entry) => entry.index === index);
    const role = AE_TPS_DOT_BIN_ROLES[index];
    const roleColor = themeColor(role, "#ffb000");
    const [red, green, blue] = hexToRgb(roleColor, [255, 176, 0]);

    context.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.12)`;
    context.fillRect(x, 1, barWidth, plotHeight - 2);

    if (active && active.weight > 0) {
      const activeHeight = Math.max(3, active.weight * (plotHeight - 2));
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${(
        0.4 + active.weight * 0.6
      ).toFixed(2)})`;
      context.fillRect(
        x,
        plotHeight - 1 - activeHeight,
        barWidth,
        activeHeight
      );
    }

    const stat = aeBinStats[index];
    const averageAfrDelta = stat.afrResponseWeight > 0
      ? stat.totalAfrDelta / stat.afrResponseWeight
      : null;

    context.textAlign = "center";
    context.textBaseline = "top";
    const dashboardFont = getComputedStyle(document.documentElement)
      .getPropertyValue("--dashboard-font")
      .trim() || "Orbitron, sans-serif";
    context.font = `16px ${dashboardFont}`;
    context.fillStyle = dashboardValueColor();
    const hitCount = Number.isInteger(stat.hits)
      ? String(stat.hits)
      : stat.hits.toFixed(1);
    context.fillText(`${hitCount}x`, x + barWidth / 2, 3);

    if (averageAfrDelta === null) {
      context.fillStyle = `${roleColor}80`;
      context.fillText("--", x + barWidth / 2, 23);
    } else {
      let afrColor = themeColor("normal", "#55ff55");
      if (averageAfrDelta > 0.5) {
        afrColor = themeColor("high", "#ff5555");
      }
      if (averageAfrDelta < -0.5) {
        afrColor = themeColor("low", "#55aaff");
      }
      context.fillStyle = afrColor;
      const sign = averageAfrDelta >= 0 ? "+" : "";
      context.fillText(
        `${sign}${averageAfrDelta.toFixed(1)}`,
        x + barWidth / 2,
        23
      );
    }

    context.fillStyle = active ? dashboardValueColor() : `${roleColor}99`;
    context.font = `17px ${dashboardFont}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(String(bin), x + barWidth / 2, height);
  });
}

function reset() {
  setText("idledisplay", "--");
  setAeReadout("aedisplay", "AE", "--");
  setAeReadout("eaedisplay", "EAE1", "--");
  aeHistory = [];
  lastAeHistorySample = 0;
  afrHistory = [];
  lastAfrHistorySample = 0;
  tpsDotHistory = [];
  lastTpsDotHistorySample = 0;
  recentTpsDot.length = 0;
  recentAfr.length = 0;
  pendingAfrResponses.length = 0;
  currentAeEvent = null;
  lastTpsRate = null;
  drawAeHistogram();
  drawAfrHistogram();
  drawTpsDotHistogram();
  drawAeBins();
}

function clearSessionStats() {
  aeBinStats.forEach((stat) => {
    stat.hits = 0;
    stat.afrResponseWeight = 0;
    stat.totalAfrDelta = 0;
    stat.stableEvents = 0;
    stat.timingWeight = 0;
    stat.totalTriggerDelay = 0;
    stat.initialResponseWeight = 0;
    stat.totalInitialAfrDelta = 0;
    stat.tailResponseWeight = 0;
    stat.totalTailAfrDelta = 0;
  });
  reset();
}

export default {
  initialize: reset,
  startSession: clearSessionStats,
  applyTheme: function () {
    drawAeHistogram();
    drawAfrHistogram();
    drawTpsDotHistogram();
    drawAeBins(lastTpsRate);
  },
  getSessionSummary: function () {
    return AE_TPS_DOT_BINS.map((bin, index) => {
      const stat = aeBinStats[index];
      return {
        bin,
        hits: stat.hits,
        stableEvents: stat.stableEvents,
        averageTriggerDelay: stat.timingWeight > 0
          ? stat.totalTriggerDelay / stat.timingWeight
          : null,
        averageInitialAfrDelta: stat.initialResponseWeight > 0
          ? stat.totalInitialAfrDelta / stat.initialResponseWeight
          : null,
        averageTailAfrDelta: stat.tailResponseWeight > 0
          ? stat.totalTailAfrDelta / stat.tailResponseWeight
          : null,
        averageAfrDelta: stat.afrResponseWeight > 0
          ? stat.totalAfrDelta / stat.afrResponseWeight
          : null
      };
    });
  },

  sample: function (
    aeAmount,
    eae1,
    tpsDot,
    afrRaw,
    noComm,
    source,
    timestampMs
  ) {
    const ae = Number(aeAmount);
    const eaeCorrection = Number(eae1);
    const tpsRate = Number(tpsDot);
    const decodedAfr = Number(afrRaw) / 10;
    const afr = Number.isFinite(decodedAfr) && decodedAfr >= 7 && decodedAfr <= 30
      ? decodedAfr
      : null;

    if (
      noComm ||
      !Number.isFinite(ae) ||
      !Number.isFinite(eaeCorrection) ||
      !Number.isFinite(tpsRate)
    ) return;

    const sampleTime = Number(timestampMs);
    const now = Number.isFinite(sampleTime) ? sampleTime : performance.now();
    if (source === "ae") sampleAeHistory(ae, now);
    if (source === "afr") sampleAfrHistory(afr, now);
    if (source === "tpsDot") sampleTpsDotHistory(tpsRate, now);
    updateAeTuningSummary(
      now,
      ae,
      tpsRate,
      afr,
      source
    );
  },

  update: function (idlePosition, aeAmount, eae1, tpsDot, afrRaw, noComm) {
    const idle = Number(idlePosition);
    const ae = Number(aeAmount);
    const eaeCorrection = Number(eae1);
    const tpsRate = Number(tpsDot);
    const decodedAfr = Number(afrRaw) / 10;
    const afr = Number.isFinite(decodedAfr) && decodedAfr >= 7 && decodedAfr <= 30
      ? decodedAfr
      : null;

    if (
      noComm ||
      !Number.isFinite(idle) ||
      !Number.isFinite(ae) ||
      !Number.isFinite(eaeCorrection) ||
      !Number.isFinite(tpsRate)
    ) {
      reset();
      return;
    }

    setText("idledisplay", `${Math.round(idle)}`);
    setAeReadout("aedisplay", "AE", `${ae.toFixed(1)}%`);
    setAeReadout("eaedisplay", "EAE1", `${eaeCorrection.toFixed(1)}%`);
    lastTpsRate = tpsRate;
    const tuningPage = document.querySelector(
      '[data-controller-page="ae-tuning"]'
    );
    if (tuningPage?.classList.contains("active")) {
      drawAeHistogram();
      drawAfrHistogram();
      drawTpsDotHistogram();
      drawAeBins(tpsRate);
    }
  },
};
