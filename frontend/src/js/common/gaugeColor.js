const DEFAULT_GAUGE_COLOR = "rgba(0, 250, 0, .75)";
const PEAK_NEEDLE_COLOR = "#00ffff";
const PEAK_WINDOW_MS = 10_000;
const peakByGauge = new WeakMap();
const peakSamplesByGauge = new WeakMap();
const peakListenerGauges = new WeakSet();
const EFFICIENT_WALLPAPER_TINT = "rgba(0, 130, 0, 0.42)";
const INEFFICIENT_WALLPAPER_TINT = "rgba(155, 0, 0, 0.42)";
const EFFICIENT_ECO_SCORE = 70;
const MIN_DRIVING_SPEED_MPH = 5;

function normalizedGaugeValue(gauge, value) {
  const minValue = Number(gauge.options.minValue);
  const maxValue = Number(gauge.options.maxValue);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null;
  if (maxValue <= minValue) return null;

  const clampedValue = Math.max(minValue, Math.min(maxValue, value));
  return (clampedValue - minValue) / (maxValue - minValue);
}

function drawLinearPeakNeedle(gauge, peakValue) {
  const context = gauge.canvas?.context;
  const dimensions = context?.barDimensions;
  const ratio = normalizedGaugeValue(gauge, peakValue);
  if (!context || !dimensions || ratio === null) return;

  const {
    isVertical,
    width,
    length,
    barWidth,
    barOffset,
    barMargin,
    ticksLength,
    X,
    Y
  } = dimensions;
  const offset = Number(barOffset) || 0;
  const position = ticksLength * ratio;

  context.save();
  context.beginPath();
  context.strokeStyle = PEAK_NEEDLE_COLOR;
  context.lineWidth = Math.max(2, dimensions.pixelRatio || 1);
  context.shadowColor = "rgba(0, 255, 255, .8)";
  context.shadowBlur = 4;

  if (isVertical) {
    const y = Y + length - barMargin - offset - position;
    const x = X + (width - barWidth) / 2;
    context.moveTo(x - 4, y);
    context.lineTo(x + barWidth + 4, y);
  } else {
    const x = X + barMargin + offset + position;
    const y = Y + (width - barWidth) / 2;
    context.moveTo(x, y - 4);
    context.lineTo(x, y + barWidth + 4);
  }

  context.stroke();
  context.closePath();
  context.restore();
}

function drawRadialPeakNeedle(gauge, peakValue) {
  const context = gauge.canvas?.context;
  const ratio = normalizedGaugeValue(gauge, peakValue);
  if (!context || ratio === null) return;

  const startAngle = Number(gauge.options.startAngle) || 0;
  const ticksAngle = Number(gauge.options.ticksAngle) || 0;
  const angle = ((startAngle + ratio * ticksAngle) * Math.PI) / 180;
  const radius = context.max;
  if (!Number.isFinite(radius)) return;

  context.save();
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, radius * 0.18);
  context.lineTo(0, radius * 0.82);
  context.strokeStyle = PEAK_NEEDLE_COLOR;
  context.lineWidth = Math.max(2, gauge.canvas.constructor.pixelRatio || 1);
  context.shadowColor = "rgba(0, 255, 255, .8)";
  context.shadowBlur = 4;
  context.stroke();
  context.closePath();
  context.restore();
}

function drawPeakNeedle(gauge) {
  const peak = peakByGauge.get(gauge);
  if (!Number.isFinite(peak)) return;

  if (gauge.canvas?.context?.barDimensions) {
    drawLinearPeakNeedle(gauge, peak);
  } else {
    drawRadialPeakNeedle(gauge, peak);
  }
}

function ensurePeakNeedleListener(gauge) {
  if (peakListenerGauges.has(gauge)) return;
  if (typeof gauge.on !== "function") return;

  gauge.on("beforeNeedle", function drawRecordedPeak() {
    drawPeakNeedle(this);
  });
  peakListenerGauges.add(gauge);
}

function recordPeak(gauge, value) {
  ensurePeakNeedleListener(gauge);
  if (!Number.isFinite(value)) return false;

  const now = performance.now();
  const cutoff = now - PEAK_WINDOW_MS;
  let samples = peakSamplesByGauge.get(gauge);
  if (!samples) {
    samples = [];
    peakSamplesByGauge.set(gauge, samples);
  }

  samples.push({ time: now, value });
  while (samples.length > 0 && samples[0].time < cutoff) samples.shift();

  const previousPeak = peakByGauge.get(gauge);
  const rollingPeak = samples.reduce(
    (highest, sample) => Math.max(highest, sample.value),
    -Infinity
  );
  peakByGauge.set(gauge, rollingPeak);

  return previousPeak !== rollingPeak;
}

function configuredHighlightRanges(gauge) {
  const highlights = gauge?.options?.highlights;
  if (!Array.isArray(highlights)) return [];

  return highlights.filter(
    (range) =>
      Number.isFinite(Number(range.from)) &&
      Number.isFinite(Number(range.to)) &&
      typeof range.color === "string"
  );
}

function parseRgba(color) {
  const match = color.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d*(?:\.\d+)?))?\s*\)$/i
  );
  if (!match) return null;

  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4])
  };
}

function blendColors(fromColor, toColor, ratio) {
  const from = parseRgba(fromColor);
  const to = parseRgba(toColor);
  if (!from || !to) return ratio < 0.5 ? fromColor : toColor;

  const mix = (start, end) => start + (end - start) * ratio;
  return `rgba(${Math.round(mix(from.red, to.red))}, ${Math.round(
    mix(from.green, to.green)
  )}, ${Math.round(mix(from.blue, to.blue))}, ${mix(
    from.alpha,
    to.alpha
  ).toFixed(3)})`;
}

export function colorForGaugeValue(gauge, value) {
  const numericValue = Number(value);
  const ranges = configuredHighlightRanges(gauge);

  if (!Number.isFinite(numericValue) || ranges.length === 0) {
    return gauge?.options?.colorBarProgress || DEFAULT_GAUGE_COLOR;
  }

  const matchingRange = ranges.find(
    (range, index) =>
      numericValue >= Number(range.from) &&
      (numericValue < Number(range.to) ||
        (index === ranges.length - 1 && numericValue <= Number(range.to)))
  );

  if (matchingRange) return matchingRange.color;
  if (numericValue < Number(ranges[0].from)) return ranges[0].color;
  return ranges[ranges.length - 1].color;
}

export function blendedColorForGaugeValue(gauge, value, maxBlendWidth = 300) {
  const numericValue = Number(value);
  const ranges = configuredHighlightRanges(gauge);

  if (!Number.isFinite(numericValue) || ranges.length < 2) {
    return colorForGaugeValue(gauge, value);
  }

  for (let index = 0; index < ranges.length - 1; index++) {
    const currentRange = ranges[index];
    const nextRange = ranges[index + 1];
    const boundary = Number(nextRange.from);
    const currentRangeWidth = Number(currentRange.to) - Number(currentRange.from);
    const blendWidth = Math.min(maxBlendWidth, currentRangeWidth / 2);
    if (blendWidth <= 0) continue;
    const blendStart = boundary - blendWidth;

    if (numericValue >= blendStart && numericValue < boundary) {
      const ratio = (numericValue - blendStart) / blendWidth;
      return blendColors(currentRange.color, nextRange.color, ratio);
    }
  }

  return colorForGaugeValue(gauge, numericValue);
}

export function setGaugeReading(
  gauge,
  { value, valueText, colorBarProgress }
) {
  if (!gauge) return;

  let needsDraw = false;

  if (
    valueText !== undefined &&
    gauge.options.valueText !== valueText
  ) {
    gauge.options.valueText = valueText;
    needsDraw = true;
  }

  if (
    colorBarProgress !== undefined &&
    gauge.options.colorBarProgress !== colorBarProgress
  ) {
    gauge.options.colorBarProgress = colorBarProgress;
    needsDraw = true;
  }

  let displayValue = value;
  if (value !== undefined && Number.isFinite(Number(value))) {
    const numericValue = Number(value);
    const minValue = Number(gauge.options.minValue);
    const maxValue = Number(gauge.options.maxValue);

    displayValue = numericValue;
    if (Number.isFinite(minValue)) displayValue = Math.max(minValue, displayValue);
    if (Number.isFinite(maxValue)) displayValue = Math.min(maxValue, displayValue);
  }

  if (Number.isFinite(displayValue) && recordPeak(gauge, displayValue)) {
    // A previous high may have just aged out even when the live value did not
    // change, so force a redraw to move the cyan rolling-maximum marker.
    needsDraw = true;
  }

  if (displayValue !== undefined && gauge.options.value !== displayValue) {
    // Writing the live value directly avoids starting a new gauge animation
    // before the previous high-frequency reading has finished animating.
    gauge.options.value = displayValue;
    needsDraw = true;
  }

  if (needsDraw) gauge.draw();
}

export function setEfficiencyWallpaperTint({ eco, speed, rpm, noComm }) {
  const ecoScore = Number(eco);
  const vehicleSpeed = Number(speed);
  const engineRpm = Number(rpm);
  const driving =
    !noComm &&
    Number.isFinite(ecoScore) &&
    Number.isFinite(vehicleSpeed) &&
    Number.isFinite(engineRpm) &&
    vehicleSpeed >= MIN_DRIVING_SPEED_MPH &&
    engineRpm > 0;
  const tint = !driving
    ? "rgba(0, 0, 0, 0)"
    : ecoScore >= EFFICIENT_ECO_SCORE
      ? EFFICIENT_WALLPAPER_TINT
      : INEFFICIENT_WALLPAPER_TINT;

  document.body.style.setProperty("--efficiency-wallpaper-tint", tint);
}
