const DEFAULT_GAUGE_COLOR = "rgba(0, 250, 0, .75)";
const peakByGauge = new WeakMap();
const peakListenerGauges = new WeakSet();
const registeredGauges = new Set();

function peakNeedleColor() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--gauge-peak-color")
    .trim() || "#3388ff";
}

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
  context.strokeStyle = peakNeedleColor();
  context.lineWidth = Math.max(1, dimensions.pixelRatio || 1);
  context.shadowBlur = 0;

  if (isVertical) {
    const y = Y + length - barMargin - offset - position;
    const x = X + (width - barWidth) / 2;
    context.moveTo(x, y);
    context.lineTo(x + barWidth, y);
  } else {
    const x = X + barMargin + offset + position;
    const y = Y + (width - barWidth) / 2;
    context.moveTo(x, y);
    context.lineTo(x, y + barWidth);
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
  context.moveTo(0, radius * 0.68);
  context.lineTo(0, radius * 0.86);
  context.strokeStyle = peakNeedleColor();
  context.lineWidth = Math.max(1, gauge.canvas.constructor.pixelRatio || 1);
  context.shadowBlur = 0;
  context.stroke();
  context.closePath();
  context.restore();
}

function drawRadialCurrentMarker(gauge) {
  const context = gauge.canvas?.context;
  const value = Number(gauge.options.value);
  const ratio = normalizedGaugeValue(gauge, value);
  if (!context || context.barDimensions || ratio === null) return;

  const startAngle = Number(gauge.options.startAngle) || 0;
  const ticksAngle = Number(gauge.options.ticksAngle) || 0;
  const angle = ((startAngle + ratio * ticksAngle) * Math.PI) / 180;
  const radius = context.max;
  if (!Number.isFinite(radius)) return;

  context.save();
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, radius * 0.68);
  context.lineTo(0, radius * 0.86);
  context.strokeStyle = getComputedStyle(document.body)
    .getPropertyValue("--dash-value")
    .trim() || "#ffffff";
  context.lineWidth = Math.max(2, gauge.canvas.constructor.pixelRatio || 1);
  context.shadowBlur = 0;
  context.stroke();
  context.closePath();
  context.restore();
}

function drawPeakNeedle(gauge) {
  const peak = peakByGauge.get(gauge);
  if (!Number.isFinite(peak)) return;

  if (typeof gauge.setPeakValue === "function") {
    gauge.setPeakValue(peak);
    return;
  }

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
    drawRadialCurrentMarker(this);
  });
  peakListenerGauges.add(gauge);
}

function recordPeak(gauge, value) {
  registeredGauges.add(gauge);
  ensurePeakNeedleListener(gauge);
  if (!Number.isFinite(value)) return false;

  const previousPeak = peakByGauge.get(gauge);
  const heldPeak = Number.isFinite(previousPeak)
    ? Math.max(previousPeak, value)
    : value;
  peakByGauge.set(gauge, heldPeak);

  return previousPeak !== heldPeak;
}

export function clearGaugePeaks() {
  registeredGauges.forEach((gauge) => {
    peakByGauge.delete(gauge);
    if (typeof gauge.setPeakValue === "function") gauge.setPeakValue(null);
    if (typeof gauge.draw === "function") gauge.draw();
  });
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
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    return {
      red: parseInt(hexMatch[1].slice(0, 2), 16),
      green: parseInt(hexMatch[1].slice(2, 4), 16),
      blue: parseInt(hexMatch[1].slice(4, 6), 16),
      alpha: 1
    };
  }
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

function colorWithAlpha(color, alpha) {
  const parsed = parseRgba(color);
  if (!parsed) return color;
  return `rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${alpha})`;
}

function emphasizeColor(color) {
  return colorWithAlpha(color, 0.85);
}

export function dimGaugeHighlights(gauge) {
  const ranges = configuredHighlightRanges(gauge);
  if (ranges.length === 0) return false;
  const dimmedRanges = ranges.map((range) => ({
    ...range,
    color: colorWithAlpha(range.color, 0.28)
  }));
  const changed = dimmedRanges.some(
    (range, index) => range.color !== ranges[index].color
  );
  if (changed) gauge.options.highlights = dimmedRanges;
  return changed;
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

  if (matchingRange) return emphasizeColor(matchingRange.color);
  if (numericValue < Number(ranges[0].from)) {
    return emphasizeColor(ranges[0].color);
  }
  return emphasizeColor(ranges[ranges.length - 1].color);
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
      return emphasizeColor(
        blendColors(currentRange.color, nextRange.color, ratio)
      );
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

  if (dimGaugeHighlights(gauge)) needsDraw = true;

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

  const readingAvailable = valueText === undefined ||
    !["—", "--"].includes(String(valueText));
  if (
    readingAvailable &&
    Number.isFinite(displayValue) &&
    recordPeak(gauge, displayValue)
  ) {
    // Force a redraw whenever the held maximum advances.
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
