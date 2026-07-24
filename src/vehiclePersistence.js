export function isRealVehicleCan() {
  return (
    global.CAN?.simulated === false &&
    global.CAN?.iface === "can0" &&
    global.CAN?.realTrafficSeen === true &&
    process.env.STARTUP_MODE !== "replay_logs"
  );
}
