import uWS from 'uWebSockets.js';

class DashSocketComms {
  constructor(url, port) {
    this.listenSocket = null;
    this.url = url;
    this.port = port;
    this.started = false;

    // ⭐ Use a Set instead of an array (fixes stale/dead sockets)
    this.sockets = new Set();

    // --------------------------
    //  WebSocket Event Handlers
    // --------------------------

    this.open = (ws) => {
      console.log("AutoDash: WebSocket connected from a dashboard!");
      this.sockets.add(ws);
    };

    this.message = (ws, message, isBinary) => {
      // No need to echo, but could log or process messages here
      // console.log("WS MESSAGE:", new Uint8Array(message));
    };

    this.drain = (ws) => {
      // Optional debugging
      // console.log("WS drain", ws.getBufferedAmount());
    };

    this.close = (ws, code, msg) => {
      console.log("AutoDash: Dashboard disconnected");
      this.sockets.delete(ws);
    };

    // --------------------------
    // Create uWS App with CORRECT bindings
    // --------------------------
    this.uWSApp = uWS.App({}).ws("/*", {
      compression: uWS.DISABLED,
      idleTimeout: 8,

      // ⭐ Correct binding using arrow functions
      open: (ws) => this.open(ws),
      message: (ws, message, isBinary) => this.message(ws, message, isBinary),
      drain: (ws) => this.drain(ws),
      close: (ws, code, msg) => this.close(ws, code, msg),
    });
  }

  // ------------------------------------------------------------
  //  Send CAN frames to all connected dashboards
  // ------------------------------------------------------------
  /**
   * @param {Buffer} packet - buffer of CAN data
   */
  dashUpdate(packet) {
    const data = new Uint8Array(packet.buffer, packet.byteOffset, packet.length);

    for (const ws of this.sockets) {
      try {
        ws.send(data, true);  // binary = true
      } catch (e) {
        console.warn("Removing dead WebSocket:", e);
        this.sockets.delete(ws);
      }
    }
  }

  notifyError() {
    this.uWSApp.publish('error', 'onno');
  }

  // ------------------------------------------------------------
  // Start listening for frontend dashboards
  // ------------------------------------------------------------
  start() {
    this.started = true;
    this.uWSApp.listen(this.port, (token) => {
      if (token) {
        this.listenSocket = token;
        console.log(`AutoDash: Listening on WebSocket port ${this.port}`);
      } else {
        console.error("AutoDash: FAILED to bind WebSocket port");
      }
    });
  }

  // ------------------------------------------------------------
  // Stop server cleanly on process shutdown / restart
  // ------------------------------------------------------------
  stop() {
    this.started = false;
    if (this.listenSocket) {
      console.log("AutoDash: Closing WebSocket server");
      uWS.us_listen_socket_close(this.listenSocket);
      this.listenSocket = null;
    }
  }
}

export default DashSocketComms;

