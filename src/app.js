import DashSocketComms from './dashSocketComms.js'
import CanbusManager from './CAN/canbusManager.js'
//import GPSManager from './GPS/gpsManager.js'
import ecuManager from './ecuManager.js'
import { appSettingsManager } from './appSettingsManager.js'
import DashContentWebServer from './webserver.js'
import { DATA_MAP } from './dataKeys.js'
import { vehicleTimeMs } from './CAN/canTime.js'
import { isRealVehicleCan } from './vehiclePersistence.js'
import { controllerStateManager } from './controllerState.js'
import { discoverDashboardPages } from './dashboardPages.js'
import { spawn } from 'child_process'

import fs from 'fs';
import path from 'path';


// ensure logs dir exists
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
  console.log('[CAN-LOG] created logs/ directory');
}


const UPDATE_MS = 33; //frequency  sent up to the dash  30fps (about 60hz)
const SAVE_FREQ = 60000; // save interval - when to persist data
let stopping = false;

// websockets config
const WS_PORT = 3333;
const WS_URL = 'raspberrypi'

export default function (canChannel, settings) {
  const dashboardHtml = path.join(process.cwd(), 'dist', 'index.html');
  const readDashboardPages = () => discoverDashboardPages(dashboardHtml);
  const canComms = new CanbusManager(canChannel);
  const dashComms = new DashSocketComms(WS_URL, WS_PORT);
//  const gps = new GPSManager(settings.gps);
  const ecu = ecuManager(settings.ecu, canChannel);
  const appSettings = appSettingsManager();
  const controllerState = controllerStateManager({
    readOdometer: () => ecu.readValue(DATA_MAP.CURRENT_ODOMETER),
    readDashboardPages,
    shouldPersist: () =>
      process.env.STARTUP_MODE !== 'replay_logs' &&
      process.env.NODE_ENV !== 'development' &&
      process.env.TYPE !== 'development' &&
      global.CAN?.simulated === false &&
      global.CAN?.iface === 'can0',
    onChange: (state) => dashComms.controllerStateUpdate(state)
  });
  const webserver = new DashContentWebServer(
    'dist',
    'index.html',
    controllerState,
    {
      health: () => {
        const canStatus = ecu.canStatus();
        const controllerSnapshot = controllerState.snapshot();
        const simulated = global.CAN?.simulated !== false;
        const replay = process.env.STARTUP_MODE === 'replay_logs';
        const development =
          process.env.NODE_ENV === 'development' ||
          process.env.TYPE === 'development';
        return {
          status: canStatus.fresh ? 'ok' : 'degraded',
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.floor(process.uptime()),
          mode: replay ? 'replay' : development ? 'development' : 'live',
          can: {
            interface: global.CAN?.iface || canChannel,
            simulated,
            realTrafficSeen: global.CAN?.realTrafficSeen === true,
            ...canStatus
          },
          dashboard: dashComms.health(),
          controller: {
            persistenceEnabled: controllerSnapshot.persistenceEnabled,
            displayMode: controllerSnapshot.displayMode,
            colorScheme: controllerSnapshot.colorScheme,
            dashboardFont: controllerSnapshot.dashboardFont,
            gaugeTheme: controllerSnapshot.gaugeTheme,
            gaugeColors: controllerSnapshot.gaugeColors,
            brightness: controllerSnapshot.brightness,
            dayBrightness: controllerSnapshot.dayBrightness,
            nightBrightness: controllerSnapshot.nightBrightness,
            dashboardPage: controllerSnapshot.dashboardPage
          }
        };
      },
      values: () => {
        const canStatus = ecu.canStatus();
        const values = {};

        for (const [name, dataKey] of Object.entries(DATA_MAP)) {
          try {
            const value = ecu.readValue(dataKey);
            values[name] = Number.isFinite(value) ? value : null;
          } catch (error) {
            // Keep the polling response stable if a future packet type cannot
            // be represented as a scalar JSON value.
            values[name] = null;
          }
        }

        return {
          timestamp: new Date().toISOString(),
          fresh: canStatus.fresh,
          lastUpdateAgeMs: canStatus.lastUpdateAgeMs,
          values
        };
      },
      dashboardPages: readDashboardPages,
      resetTrip: () => {
        const tripState = ecu.resetTrip();
        dashComms.controllerEvent('trip_reset', tripState);
        return tripState;
      },
      resetTripMpg: () => {
        const tripMpgState = ecu.resetTripMpg();
        dashComms.controllerEvent('trip_mpg_reset', tripMpgState);
        return tripMpgState;
      },
      reboot: () => {
        console.warn('[CONTROLLER] Reboot requested; scheduling system reboot');
        setTimeout(() => {
          const rebootProcess = spawn(
            'sudo',
            ['-n', 'systemctl', 'reboot'],
            { stdio: 'ignore' }
          );
          rebootProcess.once('error', (error) => {
            console.error('[CONTROLLER] Unable to start reboot:', error);
          });
          rebootProcess.once('exit', (code) => {
            if (code !== 0) {
              console.error(`[CONTROLLER] Reboot command exited with ${code}`);
            }
          });
        }, 750);
        return {
          scheduled: true,
          delayMs: 750
        };
      }
    }
  );
  let updateInterval = null;
  let savingUpdateInterval = null;
  const analysisCanIds = new Set([0x5F5, 0x5F7, 0x601, 0x60F]);

  const updateFromCan = (message) => {
    ecu.updateFromCanBus(message);
    if (!message || !analysisCanIds.has(message.id & 0x7FF)) return;
    const canId = message.id & 0x7FF;
    dashComms.analysisUpdate({
      source: canId === 0x5F5
        ? 'ae'
        : canId === 0x5F7
          ? 'tpsDot'
          : canId === 0x601
            ? 'boost'
            : 'afr',
      timestampMs: vehicleTimeMs(message),
      aeAmount: ecu.readValue(DATA_MAP.AE_AMOUNT),
      eae1: ecu.readValue(DATA_MAP.EAE1),
      tpsDot: ecu.readValue(DATA_MAP.TPS_DOT),
      afr: ecu.readValue(DATA_MAP.AFR),
      afrTarget: ecu.readValue(DATA_MAP.AFR_TARGET),
      rpm: ecu.readValue(DATA_MAP.RPM),
      map: ecu.readValue(DATA_MAP.MAP),
      boostDuty: ecu.readValue(DATA_MAP.BOOST_CONTROLLER_DUTY)
    });
  };

  const startApp = () => {
    try {
      // start conosole message
      console.log("AutoDash:-----------STARTING AUTODASH-------------")
      const persistantData = appSettings.init();
      ecu.init(persistantData);
      controllerState.init();
      dashComms.start();
      canComms.start(updateFromCan);
      
//      if (settings.gps.enabled) {
//        gps.start(ecu.updateFromGPS);
//      } else {
//        console.log('AutoDash: GPS disabled');
//      }

      webserver.start();
      
      // Frontend update 
      //updateInterval = setInterval(() => {
      //  dashComms.dashUpdate(ecu.latestPacket())
      //}, UPDATE_MS);

updateInterval = setInterval(() => {
  const packet = ecu.latestPacket();
  if (packet) {
    dashComms.dashUpdate(packet);
  }
}, UPDATE_MS);




      //file saving
      if (settings.ecu.persist) {
        savingUpdateInterval = setInterval(() => {
          if (!isRealVehicleCan()) return;
          console.log('saving persistant data');
          appSettings.saveSettings(ecu.persistantData());
          controllerState.checkpointOilChangeMileage();
        }, SAVE_FREQ);

      } else {
        console.log('AutoDash: Persistent data disabled by settings');
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
    onDashboardConnected: (callback) => dashComms.onNextConnection(callback),
  }

  return app;
}
