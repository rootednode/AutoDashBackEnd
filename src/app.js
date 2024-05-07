import DashSocketComms from './dashSocketComms.js'
import CanbusManager from './CAN/canbusManager.js'
//import GPSManager from './GPS/gpsManager.js'
import ecuManager from './ecuManager.js'
import { appSettingsManager } from './appSettingsManager.js'
import DashContentWebServer from './webserver.js'

const UPDATE_MS = 33; //frequency  sent up to the dash  30fps (about 60hz)
const SAVE_FREQ = 60000; // save interval - when to persist data
let stopping = false;

// websockets config
const WS_PORT = 3333;
const WS_URL = 'raspberrypi'

export default function (canChannel, settings) {
  const canComms = new CanbusManager(canChannel);
  const dashComms = new DashSocketComms(WS_URL, WS_PORT);
//  const gps = new GPSManager(settings.gps);
  const ecu = ecuManager(settings.ecu, canChannel);
  const appSettings = appSettingsManager();
  const webserver = new DashContentWebServer('dist', 'index.html');
  let updateInterval = null;
  let savingUpdateInterval = null;

  const startApp = () => {
    try {
      // start conosole message
      console.log("AutoDash:-----------STARTING AUTODASH-------------")
      const persistantData = appSettings.init();
      ecu.init(persistantData);
      dashComms.start();
      canComms.start(ecu.updateFromCanBus);
      
//      if (settings.gps.enabled) {
//        gps.start(ecu.updateFromGPS);
//      } else {
//        console.log('AutoDash: GPS disabled');
//      }

      webserver.start();
      
      // Frontend update 
      updateInterval = setInterval(() => {
        dashComms.dashUpdate(ecu.latestPacket())
      }, UPDATE_MS);

      //file saving
      if (settings.ecu.persist) {
        savingUpdateInterval = setInterval(() => {
          console.log('saving persistant data');
          appSettings.saveSettings(ecu.persistantData());
        }, SAVE_FREQ);

      } else {
        console.log('AutoDash: No persisting data');
      }
    } catch (error) {
      onError(error);
    }
  }

  const onError = (error) => {
    console.error(error);
    // if catchable error occurred, attempt to gracefully stop everything first
    if(dashComms && dashComms.started) {
      dashComms.notifyError();
    }
    stopApp();
  }

  const stopApp = () => {
    if (stopping) return;
    stopping = true;
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = null;

    if(savingUpdateInterval) {
      clearInterval(savingUpdateInterval);
    }
    savingUpdateInterval = null;

    console.log(" -------- Stopping Dash Server   -------------");
    if (dashComms && dashComms.started) dashComms.stop();
    if (canComms && canComms.started) canComms.stop();
//    if (gps && gps.started) gps.stop();
    ecu.stop();
    webserver.stop();
    console.log("AutoDash: -------- STOPPED   -------------");
  }
  
  const app =  {
    TYPES: {
      DEVELOPMENT: 'development',
      LIVE: 'live'
    },

    /**
     * Starts the all comms (listening to the car CAN, talking to the dash client)
     * @param {string} type 
     */
    start: startApp,
    stop: stopApp,
  }

  return app;
}
