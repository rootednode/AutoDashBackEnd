const SVG_NS = "http://www.w3.org/2000/svg";
const RADIAL_SELECTOR = "[data-type='radial-gauge']";

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function numeric(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pointAt(angle, radius) {
  const radians = angle * Math.PI / 180;
  return {
    x: 75 - Math.sin(radians) * radius,
    y: 75 + Math.cos(radians) * radius
  };
}

function arcPath(startAngle, endAngle, radius) {
  const start = pointAt(startAngle, radius);
  const end = pointAt(endAngle, radius);
  const span = Math.max(0, endAngle - startAngle);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

function parseHighlights(value) {
  try {
    const highlights = JSON.parse(value || "[]");
    return Array.isArray(highlights) ? highlights : [];
  } catch {
    return [];
  }
}

class NativeRadialGauge {
  constructor(host) {
    const data = host.dataset;
    this.options = {
      renderTo: host,
      minValue: numeric(data.minValue, 0),
      maxValue: numeric(data.maxValue, 100),
      value: numeric(data.value, 0),
      valueText: data.valueText || "—",
      title: data.title || "",
      units: data.units || "",
      startAngle: numeric(data.startAngle, 50),
      ticksAngle: numeric(data.ticksAngle, 260),
      colorBar: data.colorBar || "#20242a",
      colorBarProgress: data.colorBarProgress || "#00fa00",
      highlights: parseHighlights(data.highlights)
    };
    this.canvas = { element: host };
    this.peakValue = null;
    this.listeners = new Map();
    this.build();
    this.draw();
  }

  build() {
    const host = this.options.renderTo;
    host.dataset.nativeRadialGauge = "true";
    host.setAttribute("role", "meter");
    host.setAttribute("aria-label", `${this.options.title} ${this.options.units}`.trim());
    host.setAttribute("aria-valuemin", String(this.options.minValue));
    host.setAttribute("aria-valuemax", String(this.options.maxValue));

    this.svg = svgElement("svg", {
      class: "native-radial-gauge",
      viewBox: "0 0 150 150",
      width: "150",
      height: "150",
      "aria-hidden": "true"
    });
    this.face = svgElement("circle", { class: "native-gauge-face", cx: 75, cy: 75, r: 69 });
    this.track = svgElement("path", { class: "native-gauge-track" });
    this.progress = svgElement("path", { class: "native-gauge-progress" });
    this.peakMarker = svgElement("line", { class: "native-gauge-peak" });
    this.currentMarker = svgElement("line", { class: "native-gauge-marker" });
    this.title = svgElement("text", { class: "native-gauge-title", x: 75, y: 52 });
    this.value = svgElement("text", { class: "native-gauge-value", x: 75, y: 88 });
    this.units = svgElement("text", { class: "native-gauge-units", x: 75, y: 109 });
    this.svg.append(
      this.face,
      this.track,
      this.progress,
      this.peakMarker,
      this.currentMarker,
      this.title,
      this.value,
      this.units
    );
    host.replaceChildren(this.svg);
  }

  normalized(value) {
    const range = this.options.maxValue - this.options.minValue;
    if (range <= 0) return 0;
    return Math.max(0, Math.min(1, (value - this.options.minValue) / range));
  }

  positionMarker(marker, value) {
    const angle = this.options.startAngle + this.normalized(value) * this.options.ticksAngle;
    const inner = pointAt(angle, 56);
    const outer = pointAt(angle, 66);
    marker.setAttribute("x1", inner.x);
    marker.setAttribute("y1", inner.y);
    marker.setAttribute("x2", outer.x);
    marker.setAttribute("y2", outer.y);
  }

  draw() {
    const value = numeric(this.options.value, this.options.minValue);
    (this.listeners.get("beforeNeedle") || []).forEach((listener) => {
      listener.call(this);
    });
    const endAngle = this.options.startAngle + this.normalized(value) * this.options.ticksAngle;
    this.track.setAttribute("d", arcPath(
      this.options.startAngle,
      this.options.startAngle + this.options.ticksAngle,
      61
    ));
    this.track.setAttribute("stroke", this.options.colorBar);
    this.progress.setAttribute("d", arcPath(this.options.startAngle, endAngle, 61));
    this.progress.setAttribute("stroke", this.options.colorBarProgress);
    this.positionMarker(this.currentMarker, value);
    this.peakMarker.style.display = Number.isFinite(this.peakValue) ? "" : "none";
    if (Number.isFinite(this.peakValue)) this.positionMarker(this.peakMarker, this.peakValue);
    this.title.textContent = this.options.title;
    this.value.textContent = this.options.valueText ?? String(Math.round(value));
    this.units.textContent = this.options.units;
    this.options.renderTo.setAttribute("aria-valuenow", String(value));
    this.options.renderTo.setAttribute("aria-valuetext", String(this.value.textContent));
    return this;
  }

  update(options = {}) {
    Object.assign(this.options, options);
    return this.draw();
  }

  setPeakValue(value) {
    this.peakValue = Number(value);
  }

  on(eventName, listener) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }
}

export function initializeNativeRadialGauges() {
  if (!document.gauges) return [];
  const gauges = [];
  document.querySelectorAll(RADIAL_SELECTOR).forEach((host) => {
    if (host.dataset.nativeRadialGauge === "true") return;
    const gauge = new NativeRadialGauge(host);
    document.gauges.push(gauge);
    gauges.push(gauge);
  });
  return gauges;
}
