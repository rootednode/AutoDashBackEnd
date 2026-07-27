import fs from "fs";
import path from "path";

const DEFAULT_STATE_FILE = path.join(
  process.cwd(),
  "data",
  "controllerState.json"
);
export const COLOR_SCHEMES = [
  "amber",
  "ice",
  "emerald",
  "violet",
  "crimson",
  "solar",
  "monochrome",
  "high-contrast",
  "catppuccin",
  "dracula",
  "nord",
  "gruvbox",
  "solarized",
  "fiery-ocean",
  "summer-breeze",
  "ocean-sunset",
  "summer-fun",
  "vibrant-tones",
  "sunny-beach",
  "fiery-palette",
  "pastel-rainbow",
  "color-fiesta",
  "watermelon",
  "daybreak",
  "neutral-harmony",
  "olive-garden",
  "deep-sea",
  "fiery-red-sunset",
  "bold-berry",
  "rustic-charm",
  "golden-twilight",
  "light-steel",
  "vivid-nightfall",
  "bold-hues",
  "ocean-rose",
  "bright-green",
  "gothic-romance",
  "firelight",
  "cherry-blossom",
  "deep-sea-blue",
  "cyberpunk",
  "ice-fire",
  "copper-teal",
  "acid-violet",
  "racing-stripe"
];
export const DASHBOARD_FONTS = [
  "orbitron",
  "sans",
  "system",
  "condensed",
  "rounded",
  "serif",
  "mono",
  "quicksand",
  "gothic",
  "bookman",
  "charter",
  "nimbus-sans",
  "liberation",
  "noto-mono",
  "dejavu-sans",
  "dejavu-serif",
  "dejavu-mono",
  "liberation-serif",
  "liberation-mono",
  "liberation-narrow",
  "nimbus-roman",
  "nimbus-mono",
  "nimbus-narrow",
  "p052"
];
export const SCREEN_SAVERS = Object.freeze([
  Object.freeze({ id: "starfield", label: "Starfield" }),
  Object.freeze({ id: "aurora", label: "Aurora" }),
  Object.freeze({ id: "grid", label: "Grid Horizon" }),
  Object.freeze({ id: "digital-rain", label: "Digital Rain" }),
  Object.freeze({ id: "embers", label: "Embers" }),
  Object.freeze({ id: "topographic", label: "Topographic Contours" }),
  Object.freeze({ id: "geometric-tunnel", label: "Geometric Tunnel" }),
  Object.freeze({ id: "engine-particles", label: "Engine Data Particles" }),
  Object.freeze({ id: "oscilloscope", label: "Oscilloscope" }),
  Object.freeze({ id: "radar", label: "Radar Sweep" }),
  Object.freeze({ id: "plasma", label: "Plasma" }),
  Object.freeze({ id: "topographic-globe", label: "Topographic Globe" }),
  Object.freeze({ id: "particle-vortex", label: "Particle Vortex" }),
  Object.freeze({ id: "equalizer-skyline", label: "Equalizer Skyline" }),
  Object.freeze({ id: "light-trails", label: "Light Trails" }),
  Object.freeze({ id: "hex-grid", label: "Hex Grid" }),
  Object.freeze({ id: "constellations", label: "Constellations" }),
  Object.freeze({ id: "fireflies", label: "Fireflies" }),
  Object.freeze({ id: "rain-glass", label: "Rain on Glass" }),
  Object.freeze({ id: "vector-mountains", label: "Retro Vector Mountains" }),
  Object.freeze({ id: "data-stream", label: "Data Stream" }),
  Object.freeze({ id: "pulse-rings", label: "Pulse Rings" }),
  Object.freeze({ id: "engine-orbit", label: "Engine Orbit" }),
  Object.freeze({ id: "clock", label: "Clock" }),
  Object.freeze({ id: "random", label: "Random Mode" }),
  Object.freeze({ id: "black", label: "Black Screen" })
]);
const SCREEN_SAVER_IDS = SCREEN_SAVERS.map((screenSaver) => screenSaver.id);
const GAUGE_COLOR_ROLES = ["low", "normal", "medium", "high"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const GAUGE_COLOR_THEMES = Object.freeze({
  classic: Object.freeze({
    low: "#3388ff",
    normal: "#22dd77",
    medium: "#ffb020",
    high: "#ff3344"
  }),
  motorsport: Object.freeze({
    low: "#00a6ff",
    normal: "#00f000",
    medium: "#ffe100",
    high: "#ff2020"
  }),
  colorblind: Object.freeze({
    low: "#0072b2",
    normal: "#009e73",
    medium: "#e69f00",
    high: "#d55e00"
  }),
  ice: Object.freeze({
    low: "#315cfe",
    normal: "#38d6ff",
    medium: "#c58aff",
    high: "#ff4f87"
  }),
  neon: Object.freeze({
    low: "#00bbff",
    normal: "#39ff88",
    medium: "#fff01f",
    high: "#ff2d55"
  }),
  ocean: Object.freeze({
    low: "#173f8a",
    normal: "#00a8cc",
    medium: "#72efdd",
    high: "#ff6b6b"
  }),
  forest: Object.freeze({
    low: "#4361a8",
    normal: "#2dc653",
    medium: "#b5e48c",
    high: "#e85d04"
  }),
  sunset: Object.freeze({
    low: "#5a4fcf",
    normal: "#f15bb5",
    medium: "#ff9f1c",
    high: "#ef233c"
  }),
  purple: Object.freeze({
    low: "#4361ee",
    normal: "#9d4edd",
    medium: "#e0aaff",
    high: "#ff477e"
  }),
  monochrome: Object.freeze({
    low: "#64748b",
    normal: "#cbd5e1",
    medium: "#f1f5f9",
    high: "#ffffff"
  }),
  pastel: Object.freeze({
    low: "#89b4fa",
    normal: "#a6e3a1",
    medium: "#f9e2af",
    high: "#f38ba8"
  }),
  inferno: Object.freeze({
    low: "#3b0f70",
    normal: "#bc3754",
    medium: "#f98e09",
    high: "#fcffa4"
  })
});

export const COLOR_SCHEME_GAUGE_COLORS = Object.freeze({
  amber: GAUGE_COLOR_THEMES.classic,
  ice: GAUGE_COLOR_THEMES.ice,
  emerald: GAUGE_COLOR_THEMES.forest,
  violet: GAUGE_COLOR_THEMES.purple,
  crimson: Object.freeze({
    low: "#457b9d",
    normal: "#80ed99",
    medium: "#ffb703",
    high: "#ff405c"
  }),
  solar: GAUGE_COLOR_THEMES.inferno,
  monochrome: GAUGE_COLOR_THEMES.monochrome,
  "high-contrast": GAUGE_COLOR_THEMES.colorblind,
  catppuccin: Object.freeze({
    low: "#74c7ec",
    normal: "#a6e3a1",
    medium: "#f9e2af",
    high: "#f38ba8"
  }),
  dracula: Object.freeze({
    low: "#8be9fd",
    normal: "#50fa7b",
    medium: "#ffb86c",
    high: "#ff5555"
  }),
  nord: Object.freeze({
    low: "#5e81ac",
    normal: "#a3be8c",
    medium: "#ebcb8b",
    high: "#bf616a"
  }),
  gruvbox: Object.freeze({
    low: "#83a598",
    normal: "#b8bb26",
    medium: "#fabd2f",
    high: "#fb4934"
  }),
  solarized: Object.freeze({
    low: "#268bd2",
    normal: "#859900",
    medium: "#b58900",
    high: "#dc322f"
  }),
  "fiery-ocean": Object.freeze({
    low: "#669bbc",
    normal: "#003049",
    medium: "#fdf0d5",
    high: "#c1121f"
  }),
  "summer-breeze": Object.freeze({
    low: "#457b9d",
    normal: "#a8dadc",
    medium: "#f1faee",
    high: "#e63946"
  }),
  "ocean-sunset": Object.freeze({
    low: "#005f73",
    normal: "#0a9396",
    medium: "#ee9b00",
    high: "#ae2012"
  }),
  "summer-fun": Object.freeze({
    low: "#219ebc",
    normal: "#8ecae6",
    medium: "#ffb703",
    high: "#fb8500"
  }),
  "vibrant-tones": Object.freeze({
    low: "#277da1",
    normal: "#43aa8b",
    medium: "#f9c74f",
    high: "#f94144"
  }),
  "sunny-beach": Object.freeze({
    low: "#264653",
    normal: "#2a9d8f",
    medium: "#e9c46a",
    high: "#e76f51"
  }),
  "fiery-palette": Object.freeze({
    low: "#0f4c5c",
    normal: "#fb8b24",
    medium: "#e36414",
    high: "#9a031e"
  }),
  "pastel-rainbow": Object.freeze({
    low: "#70d6ff",
    normal: "#e9ff70",
    medium: "#ffd670",
    high: "#ff70a6"
  }),
  "color-fiesta": Object.freeze({
    low: "#3a86ff",
    normal: "#8338ec",
    medium: "#ffbe0b",
    high: "#ff006e"
  }),
  watermelon: Object.freeze({
    low: "#118ab2",
    normal: "#06d6a0",
    medium: "#ffd166",
    high: "#ef476f"
  }),
  daybreak: Object.freeze({
    low: "#7678ed",
    normal: "#3d348b",
    medium: "#f7b801",
    high: "#f35b04"
  }),
  "neutral-harmony": Object.freeze({
    low: "#3d405b",
    normal: "#81b29a",
    medium: "#f2cc8f",
    high: "#e07a5f"
  }),
  "olive-garden": Object.freeze({
    low: "#283618",
    normal: "#606c38",
    medium: "#dda15e",
    high: "#bc6c25"
  }),
  "golden-summer": Object.freeze({
    low: "#ccd5ae",
    normal: "#e9edc9",
    medium: "#faedcd",
    high: "#d4a373"
  }),
  "pastel-dreamland": Object.freeze({
    low: "#a2d2ff",
    normal: "#bde0fe",
    medium: "#ffc8dd",
    high: "#ffafcc"
  }),
  "ocean-serenity": Object.freeze({
    low: "#0077b6",
    normal: "#00b4d8",
    medium: "#90e0ef",
    high: "#caf0f8"
  }),
  "leafy-garden": Object.freeze({
    low: "#31572c",
    normal: "#4f772d",
    medium: "#90a955",
    high: "#ecf39e"
  }),
  "deep-sea": Object.freeze({
    low: "#415a77",
    normal: "#778da9",
    medium: "#e0e1dd",
    high: "#669bbc"
  }),
  "fiery-red-sunset": Object.freeze({
    low: "#6a040f",
    normal: "#e85d04",
    medium: "#faa307",
    high: "#d00000"
  }),
  "autumn-harvest": Object.freeze({
    low: "#432818",
    normal: "#bb9457",
    medium: "#ffe6a7",
    high: "#6f1d1b"
  }),
  "pastel-dreams": Object.freeze({
    low: "#a9def9",
    normal: "#d0f4de",
    medium: "#fcf6bd",
    high: "#ff99c8"
  }),
  "soft-sand": Object.freeze({
    low: "#d5bdaf",
    normal: "#d6ccc2",
    medium: "#f5ebe0",
    high: "#d4a373"
  }),
  "bold-berry": Object.freeze({
    low: "#a53860",
    normal: "#da627d",
    medium: "#f9dbbd",
    high: "#ffa5ab"
  }),
  "rustic-charm": Object.freeze({
    low: "#403d39",
    normal: "#ccc5b9",
    medium: "#fffcf2",
    high: "#eb5e28"
  }),
  "earthy-tones": Object.freeze({
    low: "#a3a380",
    normal: "#d6ce93",
    medium: "#efebce",
    high: "#bb8588"
  }),
  "golden-twilight": Object.freeze({
    low: "#003566",
    normal: "#001d3d",
    medium: "#ffc300",
    high: "#ffd60a"
  }),
  "light-steel": Object.freeze({
    low: "#495057",
    normal: "#6c757d",
    medium: "#adb5bd",
    high: "#dee2e6"
  }),
  "soft-lavender": Object.freeze({
    low: "#4a4e69",
    normal: "#9a8c98",
    medium: "#c9ada7",
    high: "#f2e9e4"
  }),
  "vivid-nightfall": Object.freeze({
    low: "#5a189a",
    normal: "#9d4edd",
    medium: "#c77dff",
    high: "#e0aaff"
  }),
  "bold-hues": Object.freeze({
    low: "#4361ee",
    normal: "#4cc9f0",
    medium: "#7209b7",
    high: "#f72585"
  }),
  "ocean-rose": Object.freeze({
    low: "#355070",
    normal: "#6d597a",
    medium: "#eaac8b",
    high: "#e56b6f"
  }),
  "warm-autumn": Object.freeze({
    low: "#003049",
    normal: "#eae2b7",
    medium: "#fcbf49",
    high: "#d62828"
  }),
  "dark-sunset": Object.freeze({
    low: "#335c67",
    normal: "#e09f3e",
    medium: "#fff3b0",
    high: "#9e2a2b"
  }),
  "golden-forest": Object.freeze({
    low: "#aba361",
    normal: "#bad9b5",
    medium: "#eff7cf",
    high: "#732c2c"
  }),
  "bright-green": Object.freeze({
    low: "#007200",
    normal: "#38b000",
    medium: "#9ef01a",
    high: "#ccff33"
  }),
  "ocean-pearl": Object.freeze({
    low: "#006d77",
    normal: "#83c5be",
    medium: "#ffddd2",
    high: "#e29578"
  }),
  "gothic-romance": Object.freeze({
    low: "#5e503f",
    normal: "#a9927d",
    medium: "#f2f4f3",
    high: "#49111c"
  }),
  "golden-fields": Object.freeze({
    low: "#ccd5ae",
    normal: "#e9edc9",
    medium: "#faedcd",
    high: "#d4a373"
  }),
  "ocean-breeze": Object.freeze({
    low: "#0077b6",
    normal: "#00b4d8",
    medium: "#90e0ef",
    high: "#caf0f8"
  }),
  firelight: Object.freeze({
    low: "#15616d",
    normal: "#ffecd1",
    medium: "#ff7d00",
    high: "#78290f"
  }),
  "desert-earth": Object.freeze({
    low: "#2b2118",
    normal: "#af9164",
    medium: "#f7f3e3",
    high: "#6f1a07"
  }),
  "soft-rainbow": Object.freeze({
    low: "#61734e",
    normal: "#b0bc94",
    medium: "#e0eabe",
    high: "#404c21"
  }),
  "warm-rustic": Object.freeze({
    low: "#585123",
    normal: "#eec170",
    medium: "#f2a65a",
    high: "#772f1a"
  }),
  "cozy-cabin": Object.freeze({
    low: "#433e3f",
    normal: "#8e6e53",
    medium: "#c69c72",
    high: "#7a7265"
  }),
  "cherry-blossom": Object.freeze({
    low: "#7e2fff",
    normal: "#a4c78a",
    medium: "#cbea34",
    high: "#344620"
  }),
  "deep-sea-blue": Object.freeze({
    low: "#0466c8",
    normal: "#5c677d",
    medium: "#7d8597",
    high: "#979dac"
  }),
  cyberpunk: Object.freeze({
    low: "#00e5ff",
    normal: "#39ff14",
    medium: "#ffe600",
    high: "#ff00a8"
  }),
  "ice-fire": Object.freeze({
    low: "#00b4d8",
    normal: "#90e0ef",
    medium: "#ff9f1c",
    high: "#e71d36"
  }),
  "copper-teal": Object.freeze({
    low: "#0f4c5c",
    normal: "#2a9d8f",
    medium: "#d4a373",
    high: "#b23a48"
  }),
  "acid-violet": Object.freeze({
    low: "#7209b7",
    normal: "#b8f500",
    medium: "#e0aaff",
    high: "#ff006e"
  }),
  "racing-stripe": Object.freeze({
    low: "#0057b8",
    normal: "#f5f5f5",
    medium: "#ffcc00",
    high: "#d90429"
  })
});

function validGaugeColors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const colors = Object.fromEntries(
    GAUGE_COLOR_ROLES.flatMap((role) =>
      typeof value[role] === "string" && HEX_COLOR.test(value[role])
        ? [[role, value[role].toLowerCase()]]
        : []
    )
  );
  return Object.keys(colors).length === GAUGE_COLOR_ROLES.length
    ? colors
    : null;
}

function migratedGaugeColors(value) {
  const directColors = validGaugeColors(value);
  if (directColors) return directColors;
  if (!value || typeof value !== "object") return null;
  return validGaugeColors(value.tachometer) ||
    Object.values(value).map(validGaugeColors).find(Boolean) ||
    null;
}

function migratedGaugeTheme(saved) {
  if (
    saved.gaugeTheme === "custom" ||
    Object.prototype.hasOwnProperty.call(
      COLOR_SCHEME_GAUGE_COLORS,
      saved.gaugeTheme
    ) ||
    Object.prototype.hasOwnProperty.call(
      GAUGE_COLOR_THEMES,
      saved.gaugeTheme
    )
  ) {
    return saved.gaugeTheme;
  }
  const legacyThemes = saved.gaugeColorThemes;
  if (legacyThemes && typeof legacyThemes === "object") {
    const legacyTheme = legacyThemes.tachometer ||
      Object.values(legacyThemes)[0];
    if (
      legacyTheme === "custom" ||
      Object.prototype.hasOwnProperty.call(GAUGE_COLOR_THEMES, legacyTheme)
    ) {
      return legacyTheme;
    }
  }
  return "classic";
}

function validOdometer(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? numericValue
    : 0;
}

function validBrightness(value, fallback = 100) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(20, Math.min(100, Math.round(numericValue)))
    : fallback;
}

export function controllerStateManager({
  readOdometer,
  readDashboardPages = () => [{
    id: "main",
    label: "Main Dashboard",
    icon: "layout-dashboard"
  }],
  onChange = () => {},
  shouldPersist = () => true,
  stateFile = DEFAULT_STATE_FILE
}) {
  const dashboardPages = () => {
    const pages = readDashboardPages();
    return Array.isArray(pages) && pages.length
      ? pages.filter((page) => page && typeof page.id === "string")
      : [{
        id: "main",
        label: "Main Dashboard",
        icon: "layout-dashboard"
      }];
  };
  const dashboardPageIds = () => dashboardPages().map((page) => page.id);

  let state = {
    displayMode: "day",
    displayInverted: false,
    screenSaver: "starfield",
    peakResetSequence: 0,
    colorScheme: "amber",
    dayColorScheme: "amber",
    nightColorScheme: "deep-sea-blue",
    dashboardFont: "orbitron",
    gaugeTheme: "amber",
    gaugeColors: { ...COLOR_SCHEME_GAUGE_COLORS.amber },
    dayBrightness: 100,
    nightBrightness: 70,
    dashboardPage: "main",
    oilChangeMiles: 0,
    oilChangeOdometer: 0,
    serviceItems: {
      transmission: { miles: 0, odometer: 0 },
      transferCase: { miles: 0, odometer: 0 },
      frontDifferential: { miles: 0, odometer: 0 },
      rearDifferential: { miles: 0, odometer: 0 }
    }
  };

  const snapshot = () => {
    const odometer = validOdometer(readOdometer());
    const brightness = state.displayMode === "night"
      ? state.nightBrightness
      : state.dayBrightness;
    const milesSinceCheckpoint = Math.max(
      0,
      odometer - state.oilChangeOdometer
    );
    const serviceItems = Object.fromEntries(
      Object.entries(state.serviceItems).map(([id, item]) => [
        id,
        {
          miles: item.miles + Math.max(0, odometer - item.odometer),
          odometer: item.odometer
        }
      ])
    );
    return {
      displayMode: state.displayMode,
      displayInverted: state.displayInverted,
      screenSaver: state.screenSaver,
      screenSavers: SCREEN_SAVERS,
      peakResetSequence: state.peakResetSequence,
      colorScheme: state.colorScheme,
      dayColorScheme: state.dayColorScheme,
      nightColorScheme: state.nightColorScheme,
      dashboardFont: state.dashboardFont,
      gaugeTheme: state.gaugeTheme,
      gaugeColors: state.gaugeColors,
      brightness,
      dayBrightness: state.dayBrightness,
      nightBrightness: state.nightBrightness,
      dashboardPage: state.dashboardPage,
      dashboardPages: dashboardPages(),
      odometer,
      oilChangeOdometer: state.oilChangeOdometer,
      oilChangeMiles: state.oilChangeMiles + milesSinceCheckpoint,
      serviceItems,
      persistenceEnabled: Boolean(shouldPersist())
    };
  };

  const save = () => {
    if (!shouldPersist()) return false;
    const directory = path.dirname(stateFile);
    const temporaryFile = `${stateFile}.tmp`;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryFile, JSON.stringify({
      displayMode: state.displayMode,
      displayInverted: state.displayInverted,
      screenSaver: state.screenSaver,
      colorScheme: state.colorScheme,
      dayColorScheme: state.dayColorScheme,
      nightColorScheme: state.nightColorScheme,
      dashboardFont: state.dashboardFont,
      gaugeTheme: state.gaugeTheme,
      gaugeColors: state.gaugeColors,
      dayBrightness: state.dayBrightness,
      nightBrightness: state.nightBrightness,
      oilChangeMiles: state.oilChangeMiles,
      oilChangeOdometer: state.oilChangeOdometer,
      serviceItems: state.serviceItems
    }, null, 2));
    fs.renameSync(temporaryFile, stateFile);
    return true;
  };

  const saveAppearance = () => {
    if (shouldPersist()) return save();
    const directory = path.dirname(stateFile);
    const temporaryFile = `${stateFile}.tmp`;
    let saved = {};
    try {
      saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(
          "[CONTROLLER] Unable to merge saved appearance:",
          error.message
        );
      }
    }
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryFile, JSON.stringify({
      ...saved,
      screenSaver: state.screenSaver,
      colorScheme: state.colorScheme,
      dayColorScheme: state.dayColorScheme,
      nightColorScheme: state.nightColorScheme,
      gaugeTheme: state.gaugeTheme,
      gaugeColors: state.gaugeColors
    }, null, 2));
    fs.renameSync(temporaryFile, stateFile);
    return true;
  };

  const publish = () => {
    const currentState = snapshot();
    onChange(currentState);
    return currentState;
  };

  const init = () => {
    const currentOdometer = validOdometer(readOdometer());
    const persistenceEnabled = Boolean(shouldPersist());
    try {
      const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      state.displayMode = saved.displayMode === "night" ? "night" : "day";
      state.displayInverted = saved.displayInverted === true;
      state.screenSaver = SCREEN_SAVER_IDS.includes(saved.screenSaver)
        ? saved.screenSaver
        : "starfield";
      const legacyColorScheme = COLOR_SCHEMES.includes(saved.colorScheme)
        ? saved.colorScheme
        : "amber";
      state.dayColorScheme = COLOR_SCHEMES.includes(saved.dayColorScheme)
        ? saved.dayColorScheme
        : legacyColorScheme;
      state.nightColorScheme = COLOR_SCHEMES.includes(saved.nightColorScheme)
        ? saved.nightColorScheme
        : legacyColorScheme;
      state.colorScheme = state.displayMode === "night"
        ? state.nightColorScheme
        : state.dayColorScheme;
      state.dashboardFont = DASHBOARD_FONTS.includes(saved.dashboardFont)
        ? saved.dashboardFont
        : "orbitron";
      state.gaugeTheme = migratedGaugeTheme(saved);
      if (state.gaugeTheme === "custom") {
        state.gaugeColors = migratedGaugeColors(saved.gaugeColors) ||
          { ...COLOR_SCHEME_GAUGE_COLORS[state.colorScheme] };
      } else {
        state.gaugeTheme = state.colorScheme;
        state.gaugeColors = {
          ...COLOR_SCHEME_GAUGE_COLORS[state.colorScheme]
        };
      }
      const legacyBrightness = Number(saved.brightness);
      state.dayBrightness = validBrightness(
        saved.dayBrightness,
        Number.isFinite(legacyBrightness)
          ? validBrightness(legacyBrightness)
          : 100
      );
      state.nightBrightness = validBrightness(
        saved.nightBrightness,
        Number.isFinite(legacyBrightness)
          ? validBrightness(legacyBrightness)
          : 70
      );
      const savedMiles = Number(saved.oilChangeMiles);
      const savedOdometer = validOdometer(saved.oilChangeOdometer);
      if (Number.isFinite(savedMiles) && savedMiles >= 0) {
        state.oilChangeMiles = savedMiles;
        state.oilChangeOdometer = persistenceEnabled
          ? savedOdometer
          : currentOdometer;
      } else {
        // Migrate the original baseline-only state format.
        state.oilChangeMiles = Math.max(
          0,
          currentOdometer - savedOdometer
        );
        state.oilChangeOdometer = currentOdometer;
        save();
      }
      Object.keys(state.serviceItems).forEach((id) => {
        const savedItem = saved.serviceItems?.[id];
        const savedItemMiles = Number(savedItem?.miles);
        state.serviceItems[id] = {
          miles: Number.isFinite(savedItemMiles) && savedItemMiles >= 0
            ? savedItemMiles
            : 0,
          odometer: persistenceEnabled
            ? validOdometer(savedItem?.odometer)
            : currentOdometer
        };
      });
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn("[CONTROLLER] Unable to load saved state:", error.message);
      }
      state.oilChangeMiles = 0;
      state.oilChangeOdometer = currentOdometer;
      Object.keys(state.serviceItems).forEach((id) => {
        state.serviceItems[id] = { miles: 0, odometer: currentOdometer };
      });
      save();
    }
    return snapshot();
  };

  const setDisplayMode = (requestedMode) => {
    const nextMode = requestedMode === "toggle"
      ? state.displayMode === "night" ? "day" : "night"
      : requestedMode;
    if (nextMode !== "day" && nextMode !== "night") {
      throw new Error('Display mode must be "day", "night", or "toggle"');
    }
    state.displayMode = nextMode;
    state.colorScheme = nextMode === "night"
      ? state.nightColorScheme
      : state.dayColorScheme;
    state.gaugeTheme = state.colorScheme;
    state.gaugeColors = { ...COLOR_SCHEME_GAUGE_COLORS[state.colorScheme] };
    save();
    return publish();
  };

  const setDisplayInverted = (requestedValue = "toggle") => {
    if (requestedValue === "toggle") {
      state.displayInverted = !state.displayInverted;
    } else if (typeof requestedValue === "boolean") {
      state.displayInverted = requestedValue;
    } else {
      throw new Error('Display inversion must be true, false, or "toggle"');
    }
    save();
    return publish();
  };

  const setScreenSaver = (requestedScreenSaver) => {
    const currentIndex = SCREEN_SAVER_IDS.indexOf(state.screenSaver);
    let nextScreenSaver = requestedScreenSaver;
    if (requestedScreenSaver === "next") {
      nextScreenSaver = SCREEN_SAVER_IDS[
        (currentIndex + 1) % SCREEN_SAVER_IDS.length
      ];
    } else if (requestedScreenSaver === "previous") {
      nextScreenSaver = SCREEN_SAVER_IDS[
        (currentIndex - 1 + SCREEN_SAVER_IDS.length) %
          SCREEN_SAVER_IDS.length
      ];
    }
    if (!SCREEN_SAVER_IDS.includes(nextScreenSaver)) {
      throw new Error(
        `Screen saver must be ${SCREEN_SAVER_IDS.join(", ")}, next, or previous`
      );
    }
    state.screenSaver = nextScreenSaver;
    saveAppearance();
    return publish();
  };

  const setBrightness = ({ value, action, mode } = {}) => {
    const selectedMode = mode === undefined ? state.displayMode : mode;
    if (selectedMode !== "day" && selectedMode !== "night") {
      throw new Error('Brightness mode must be "day" or "night"');
    }
    const stateKey = selectedMode === "night"
      ? "nightBrightness"
      : "dayBrightness";
    let nextBrightness;
    if (action === "up") {
      nextBrightness = state[stateKey] + 10;
    } else if (action === "down") {
      nextBrightness = state[stateKey] - 10;
    } else if (value !== undefined) {
      nextBrightness = Number(value);
    } else {
      throw new Error('Brightness requires a numeric "value" or "up"/"down" action');
    }
    if (!Number.isFinite(nextBrightness)) {
      throw new Error("Brightness value must be numeric");
    }
    state[stateKey] = validBrightness(nextBrightness);
    save();
    return publish();
  };

  const setColorScheme = (requestedScheme, requestedMode) => {
    const selectedMode = requestedMode === undefined
      ? state.displayMode
      : requestedMode;
    if (selectedMode !== "day" && selectedMode !== "night") {
      throw new Error('Color scheme mode must be "day" or "night"');
    }
    const stateKey = selectedMode === "night"
      ? "nightColorScheme"
      : "dayColorScheme";
    const currentIndex = COLOR_SCHEMES.indexOf(state[stateKey]);
    let nextScheme = requestedScheme;
    if (requestedScheme === "next") {
      nextScheme = COLOR_SCHEMES[
        (currentIndex + 1) % COLOR_SCHEMES.length
      ];
    } else if (requestedScheme === "previous") {
      nextScheme = COLOR_SCHEMES[
        (currentIndex - 1 + COLOR_SCHEMES.length) % COLOR_SCHEMES.length
      ];
    }
    if (!COLOR_SCHEMES.includes(nextScheme)) {
      throw new Error(
        `Color scheme must be ${COLOR_SCHEMES.join(", ")}, next, or previous`
      );
    }
    state[stateKey] = nextScheme;
    if (selectedMode === state.displayMode) {
      state.colorScheme = nextScheme;
      state.gaugeTheme = nextScheme;
      state.gaugeColors = { ...COLOR_SCHEME_GAUGE_COLORS[nextScheme] };
    }
    saveAppearance();
    return publish();
  };

  const setDashboardFont = (requestedFont) => {
    if (!DASHBOARD_FONTS.includes(requestedFont)) {
      throw new Error(`Font must be ${DASHBOARD_FONTS.join(", ")}`);
    }
    state.dashboardFont = requestedFont;
    save();
    return publish();
  };

  const setGaugeColors = (requestedColors, requestedTheme) => {
    const hasTheme = requestedTheme !== undefined;
    const isColorScheme = hasTheme &&
      Object.prototype.hasOwnProperty.call(
        COLOR_SCHEME_GAUGE_COLORS,
        requestedTheme
      );
    if (
      hasTheme &&
      !isColorScheme &&
      !Object.prototype.hasOwnProperty.call(
        GAUGE_COLOR_THEMES,
        requestedTheme
      )
    ) {
      throw new Error(
        `Gauge theme must be ${Object.keys(GAUGE_COLOR_THEMES).join(", ")}`
      );
    }
    let sourceColors = requestedColors;
    if (isColorScheme) {
      sourceColors = COLOR_SCHEME_GAUGE_COLORS[requestedTheme];
    } else if (hasTheme) {
      sourceColors = GAUGE_COLOR_THEMES[requestedTheme];
    }
    const colors = validGaugeColors(sourceColors);
    if (!colors) {
      throw new Error(
        `Gauge colors require six-digit hex values for ${GAUGE_COLOR_ROLES.join(", ")}`
      );
    }
    state.gaugeColors = { ...colors };
    state.gaugeTheme = isColorScheme ? requestedTheme : "custom";
    if (isColorScheme) {
      state.colorScheme = requestedTheme;
      if (state.displayMode === "night") {
        state.nightColorScheme = requestedTheme;
      } else {
        state.dayColorScheme = requestedTheme;
      }
    }
    saveAppearance();
    return publish();
  };

  const setDashboardPage = (requestedPage) => {
    const availablePages = dashboardPageIds();
    const currentIndex = Math.max(0, availablePages.indexOf(state.dashboardPage));
    let nextPage = requestedPage;
    if (requestedPage === "next") {
      nextPage = availablePages[
        (currentIndex + 1) % availablePages.length
      ];
    } else if (requestedPage === "previous") {
      nextPage = availablePages[
        (currentIndex - 1 + availablePages.length) %
          availablePages.length
      ];
    }
    if (!availablePages.includes(nextPage)) {
      throw new Error(
        `Dashboard page must be ${availablePages.join(", ")}, next, or previous`
      );
    }
    state.dashboardPage = nextPage;
    return publish();
  };

  const clearGaugePeaks = () => {
    state.peakResetSequence += 1;
    return publish();
  };

  const resetOilChangeMileage = () => {
    state.oilChangeMiles = 0;
    state.oilChangeOdometer = validOdometer(readOdometer());
    save();
    return publish();
  };

  const resetServiceMileage = (requestedItem) => {
    const item = String(requestedItem || "");
    if (!Object.prototype.hasOwnProperty.call(state.serviceItems, item)) {
      throw new Error(`Unknown maintenance item: ${item}`);
    }
    state.serviceItems[item] = {
      miles: 0,
      odometer: validOdometer(readOdometer())
    };
    save();
    return publish();
  };

  const checkpointOilChangeMileage = () => {
    const currentState = snapshot();
    state.oilChangeMiles = currentState.oilChangeMiles;
    state.oilChangeOdometer = currentState.odometer;
    save();
    return snapshot();
  };

  return {
    init,
    snapshot,
    setDisplayMode,
    setDisplayInverted,
    setScreenSaver,
    setColorScheme,
    setDashboardFont,
    setGaugeColors,
    setBrightness,
    setDashboardPage,
    clearGaugePeaks,
    resetOilChangeMileage,
    resetServiceMileage,
    checkpointOilChangeMileage
  };
}
