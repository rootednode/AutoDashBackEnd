const SVG_NS = "http://www.w3.org/2000/svg";
const LINEAR_SELECTOR = "[data-type='linear-gauge']";
const TRACK_TOP = 58;
const TRACK_BOTTOM = 226;
const TRACK_HEIGHT = TRACK_BOTTOM - TRACK_TOP;

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

function parseHighlights(value) {
  try {
    const highlights = JSON.parse(value || "[]");
    return Array.isArray(highlights) ? highlights : [];
  } catch {
    return [];
  }
}

class NativeLinearGauge {
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
      colorBar: data.colorBar || "rgba(35, 35, 35, .75)",
      colorBarProgress: data.colorBarProgress || "#00f000",
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
    host.dataset.nativeLinearGauge = "true";
    host.setAttribute("role", "meter");
    host.setAttribute("aria-label", `${this.options.title} ${this.options.units}`.trim());
    host.setAttribute("aria-valuemin", String(this.options.minValue));
    host.setAttribute("aria-valuemax", String(this.options.maxValue));

    this.svg = svgElement("svg", {
      class: "native-linear-gauge",
      viewBox: "0 0 96 320",
      width: 96,
      height: 320,
      "aria-hidden": "true"
    });
    this.track = svgElement("rect", {
      class: "native-linear-track",
      x: 27,
      y: TRACK_TOP,
      width: 42,
      height: TRACK_HEIGHT,
      rx: 5
    });
    this.fill = svgElement("rect", {
      class: "native-linear-fill",
      x: 27,
      width: 42,
      rx: 5
    });
    this.peakMarker = svgElement("line", { class: "native-linear-peak", x1: 27, x2: 69 });
    this.currentMarker = svgElement("line", { class: "native-linear-marker", x1: 27, x2: 69 });
    this.value = svgElement("text", { class: "native-linear-value", x: 48, y: 254 });
    this.units = svgElement("text", { class: "native-linear-units", x: 48, y: 281 });
    this.svg.append(
      this.track,
      this.fill,
      this.peakMarker,
      this.currentMarker,
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

  yFor(value) {
    return TRACK_BOTTOM - this.normalized(value) * TRACK_HEIGHT;
  }

  draw() {
    const value = numeric(this.options.value, this.options.minValue);
    (this.listeners.get("beforeNeedle") || []).forEach((listener) => {
      listener.call(this);
    });
    const valueY = this.yFor(value);
    this.track.setAttribute("fill", this.options.colorBar);
    this.fill.setAttribute("y", valueY);
    this.fill.setAttribute("height", Math.max(0, TRACK_BOTTOM - valueY));
    this.fill.setAttribute("fill", this.options.colorBarProgress);
    this.currentMarker.setAttribute("y1", valueY);
    this.currentMarker.setAttribute("y2", valueY);
    this.peakMarker.style.display = Number.isFinite(this.peakValue) ? "" : "none";
    if (Number.isFinite(this.peakValue)) {
      const peakY = this.yFor(this.peakValue);
      this.peakMarker.setAttribute("y1", peakY);
      this.peakMarker.setAttribute("y2", peakY);
    }
    this.value.textContent = this.options.valueText === ""
      ? String(Math.round(value))
      : this.options.valueText ?? String(Math.round(value));
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

export function initializeNativeLinearGauges() {
  if (!document.gauges) return [];
  const gauges = [];
  document.querySelectorAll(LINEAR_SELECTOR).forEach((host) => {
    if (host.dataset.nativeLinearGauge === "true") return;
    const gauge = new NativeLinearGauge(host);
    document.gauges.push(gauge);
    gauges.push(gauge);
  });
  return gauges;
}
