const INJECTOR_RATED_CC_MIN = 360;
const INJECTOR_RATED_PSI = 43.5;
const NUM_INJECTORS = 4;
const SQUIRTS_PER_CYCLE = 2;
const CC_PER_GALLON = 3785.41;

const DEADTIME_CURVE = [
  [8.0, 1.467],
  [10.0, 1.070],
  [12.0, 0.846],
  [14.0, 0.694],
  [15.0, 0.643],
  [16.0, 0.595],
];

function injectorDeadtimeMs(volts) {
  if (!Number.isFinite(volts)) return 0.694;
  if (volts <= DEADTIME_CURVE[0][0]) return DEADTIME_CURVE[0][1];

  for (let i = 0; i < DEADTIME_CURVE.length - 1; i++) {
    const [v1, dt1] = DEADTIME_CURVE[i];
    const [v2, dt2] = DEADTIME_CURVE[i + 1];

    if (volts >= v1 && volts <= v2) {
      const ratio = (volts - v1) / (v2 - v1);
      return dt1 + ratio * (dt2 - dt1);
    }
  }

  return DEADTIME_CURVE[DEADTIME_CURVE.length - 1][1];
}

function injectorDifferentialPsi(fuelRailPsi, mapKpa) {
  if (!Number.isFinite(fuelRailPsi) || fuelRailPsi < 10) {
    return INJECTOR_RATED_PSI;
  }

  const manifoldGaugePsi = (mapKpa - 101.325) * 0.145038;
  return Math.max(20, Math.min(80, fuelRailPsi - manifoldGaugePsi));
}

function injectorFlowCcMin(differentialPsi) {
  const psi = Math.max(20, Math.min(80, differentialPsi));
  return INJECTOR_RATED_CC_MIN * Math.sqrt(psi / INJECTOR_RATED_PSI);
}

export function computeFuelGPH(pulseWidthMs, rpm, fuelRailPsi, mapKpa, volts) {
  if (!Number.isFinite(pulseWidthMs) || !Number.isFinite(rpm) || rpm <= 0) {
    return 0;
  }

  const effectivePulseWidthMs = Math.max(
    0,
    pulseWidthMs - injectorDeadtimeMs(volts)
  );
  if (effectivePulseWidthMs <= 0) return 0;

  const differentialPsi = injectorDifferentialPsi(fuelRailPsi, mapKpa);
  const injectorCcMin = injectorFlowCcMin(differentialPsi);
  const dutyCycle =
    (effectivePulseWidthMs * rpm * SQUIRTS_PER_CYCLE) / 120000;
  const totalCcMin = injectorCcMin * dutyCycle * NUM_INJECTORS;
  const gallonsPerHour = (totalCcMin * 60) / CC_PER_GALLON;

  return Number.isFinite(gallonsPerHour) && gallonsPerHour > 0
    ? gallonsPerHour
    : 0;
}
