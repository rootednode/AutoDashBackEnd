import can from 'socketcan'
import { logCAN } from './logger.js';   // <── ADD THIS

let timeout = null

class CanbusManager {

  constructor(channel) {
    this.started = false;
    this.channelName = channel;
  }

  start(onUpdateCallback) {
    this.onUpdateCallback = onUpdateCallback;

    try {
      this.channel = can.createRawChannel(this.channelName, true);
      if (this.channel) {
        this.resetTimeout();
        this.channel.start();

        this.channel.addListener('onMessage', (msg) => {
          this.resetTimeout();

          // 🔥 LOG CAN FRAME HERE
          logCAN(msg);

          // continue your existing data pipeline
          this.onUpdateCallback(msg);
        });

        this.started = true;
      } else {
        throw new Error('Cannot create channel - Did you properly raise the interface?');
      }
    } catch (error) {
      this.stop();
      console.error("CAN INTERFACE ERROR: ", error);
    }
    return this.started;
  }

  stop() {
    clearTimeout(timeout);
    this.onUpdateCallback(false);
    this.started = false;
    if(this.channel) this.channel.stop();
    this.channel = null;
  }

  resetTimeout() {
    if (this.onUpdateCallback) {
      clearTimeout(timeout);
      timeout = setTimeout(() => { this.onUpdateCallback(false) }, 3000);
    }
  }
}

export default CanbusManager;

