let rawBaseMs = null;
let vehicleBaseMs = null;

export function canTimeScale() {
  if (process.env.STARTUP_MODE !== "replay_logs") return 1;
  const requested = Number(process.env.REPLAY_SPEED || 10);
  return Number.isFinite(requested) && requested > 0 ? requested : 10;
}

export function vehicleTimeMs(message) {
  const seconds = Number(message?.ts_sec);
  const microseconds = Number(message?.ts_usec);
  if (!Number.isFinite(seconds) || !Number.isFinite(microseconds)) {
    return Date.now();
  }

  const rawMs = seconds * 1000 + microseconds / 1000;
  if (rawBaseMs === null || rawMs < rawBaseMs) {
    rawBaseMs = rawMs;
    vehicleBaseMs = rawMs;
  }
  return vehicleBaseMs + (rawMs - rawBaseMs) * canTimeScale();
}
