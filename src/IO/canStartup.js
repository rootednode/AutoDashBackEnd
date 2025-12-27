import { execSync } from "child_process";
import fs from "fs";

function ifaceExists(name) {
  try {
    execSync(`ip link show ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  execSync(cmd, { stdio: "ignore" });
}

function eth0HasLink() {
  try {
    return fs.readFileSync("/sys/class/net/eth0/carrier", "utf8").trim() === "1";
  } catch {
    return false;
  }
}

export function initCan() {
  // Bench/dev environment → vcan
  if (eth0HasLink()) {
    console.warn("[CAN] eth0 link detected — using vcan0 (bench mode)");

    try {
      run("sudo modprobe can");
      run("sudo modprobe can_raw");
      run("sudo modprobe vcan");
    } catch {}

    if (!ifaceExists("vcan0")) {
      run("sudo ip link add dev vcan0 type vcan");
    }

    run("sudo ip link set up vcan0");

    return {
      iface: "vcan0",
      simulated: true,
      reason: "eth0_link"
    };
  }

  // Vehicle environment → real CAN
  if (ifaceExists("can0")) {
    console.log("[CAN] eth0 down — using real can0");

    return {
      iface: "can0",
      simulated: false,
      reason: "vehicle"
    };
  }

  // Safety fallback (should be rare)
  console.warn("[CAN] no can0 found — falling back to vcan0");

  try {
    run("modprobe vcan");
  } catch {}

  if (!ifaceExists("vcan0")) {
    run("ip link add dev vcan0 type vcan");
  }

  run("ip link set up vcan0");

  return {
    iface: "vcan0",
    simulated: true,
    reason: "no_can0"
  };
}




