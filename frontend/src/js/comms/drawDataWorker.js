import RobustWebSocket from "robust-websocket";
import { createDataStore } from "../common/dataMap";

const dataStore = createDataStore();
RobustWebSocket.prototype.binaryType = "arraybuffer";

let ws = null;

function ensureWS() {
  if (ws) return;

  postMessage({ msg: "comm_error", value: true });

  ws = new RobustWebSocket("ws://raspberrypi:3333", null, {
    timeout: 8000,
    shouldReconnect: () => 2000,
    ignoreConnectivityEvents: false,
  });

  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    postMessage({ msg: "comm_error", value: false });
    postMessage({ msg: "comm_reconnected" });
    ws.send("Hello");
  };

  ws.onclose = () => {
    postMessage({ msg: "comm_error", value: true });
  };

  ws.onerror = () => {
			//ws = null;
    postMessage({ msg: "comm_error", value: true });
  };

  ws.onmessage = (evt) => {
    try {
      if (typeof evt.data === "string") {
        const message = JSON.parse(evt.data);
        if (message.type === "analysis_sample") {
          postMessage({ msg: "analysis_sample", sample: message });
        }
        if (message.type === "controller_state") {
          postMessage({ msg: "controller_state", state: message.state });
        }
        if (message.type === "controller_event") {
          postMessage({
            msg: "controller_event",
            event: message.event,
            detail: message.detail
          });
        }
        return;
      }
      const view = new DataView(evt.data);
      dataStore.deserialize(view);

      postMessage({
        msg: "update_data_ready",
        updateData: dataStore.data
      });

    } catch (err) {
      console.error("[worker] parse error:", err);
    }
  };
}

onmessage = (evt) => {
  if (evt.data.msg === "start") {
    ensureWS();
  }
};
