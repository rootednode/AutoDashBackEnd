function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

const AE_TPS_DOT_BINS = [20, 100, 300, 700];
const AE_TPS_DOT_BIN_COLORS = [
  [0, 250, 0],
  [250, 250, 0],
  [255, 176, 0],
  [250, 0, 0]
];
const AE_HISTORY_SAMPLE_MS = 100;
const AE_HISTORY_LENGTH = 55;
const AE_HISTORY_MIN_SCALE = 10;
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
const recentTpsDot = [];
const recentAfr = [];
const pendingAfrResponses = [];
const aeBinStats = AE_TPS_DOT_BINS.map(() => ({
  hits: 0,
  afrResponseWeight: 0,
  totalAfrDelta: 0
}));
let currentAeEvent = null;

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

  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const baselineY = height - 1;
  const barWidth = width / AE_HISTORY_LENGTH;
  const scale = Math.max(
    AE_HISTORY_MIN_SCALE,
    ...aeHistory.map((value) => Math.max(0, value))
  );

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(120, 120, 120, 0.55)";
  context.fillRect(0, baselineY, width, 1);

  const startX = width - aeHistory.length * barWidth;
  aeHistory.forEach((value, index) => {
    const magnitude = Math.min(Math.max(0, value) / scale, 1);
    const barHeight = magnitude * (height - 3);
    const x = startX + index * barWidth;

    context.fillStyle = "#ffb000";
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

    response.binWeights.forEach(({ index: binIndex, weight }) => {
      const stat = aeBinStats[binIndex];
      stat.afrResponseWeight += weight;
      stat.totalAfrDelta += dominantDelta * weight;
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
      const peakTpsDot = recentTpsDot.reduce(
        (peak, sample) => Math.max(peak, sample.value),
        tpsDot
      );
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
          responseStartsAt: now + AE_AFR_RESPONSE_DELAY_MS,
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

  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
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
    const [red, green, blue] = AE_TPS_DOT_BIN_COLORS[index];

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
    context.font = "16px Orbitron, sans-serif";
    context.fillStyle = "#ffffff";
    const hitCount = Number.isInteger(stat.hits)
      ? String(stat.hits)
      : stat.hits.toFixed(1);
    context.fillText(`${hitCount}x`, x + barWidth / 2, 3);

    if (averageAfrDelta === null) {
      context.fillStyle = "#777777";
      context.fillText("--", x + barWidth / 2, 23);
    } else {
      let afrColor = "#55ff55";
      if (averageAfrDelta > 0.5) afrColor = "#ff5555";
      if (averageAfrDelta < -0.5) afrColor = "#55aaff";
      context.fillStyle = afrColor;
      const sign = averageAfrDelta >= 0 ? "+" : "";
      context.fillText(
        `${sign}${averageAfrDelta.toFixed(1)}`,
        x + barWidth / 2,
        23
      );
    }

    context.fillStyle = active ? "#ffffff" : "#777777";
    context.font = "17px Orbitron, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(String(bin), x + barWidth / 2, height);
  });
}

function reset() {
  setText("idledisplay", "--");
  setText("aedisplay", "AE --");
  setText("eaedisplay", "EAE1 --");
  aeHistory = [];
  lastAeHistorySample = 0;
  recentTpsDot.length = 0;
  recentAfr.length = 0;
  pendingAfrResponses.length = 0;
  currentAeEvent = null;
  drawAeHistogram();
  drawAeBins();
}

function clearSessionStats() {
  aeBinStats.forEach((stat) => {
    stat.hits = 0;
    stat.afrResponseWeight = 0;
    stat.totalAfrDelta = 0;
  });
  reset();
}

export default {
  initialize: reset,
  startSession: clearSessionStats,
  getSessionSummary: function () {
    return AE_TPS_DOT_BINS.map((bin, index) => {
      const stat = aeBinStats[index];
      return {
        bin,
        hits: stat.hits,
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
    setText("aedisplay", `AE ${ae.toFixed(1)}%`);
    setText("eaedisplay", `EAE1 ${eaeCorrection.toFixed(1)}%`);
    drawAeHistogram();
    drawAeBins(tpsRate);
  },
};
