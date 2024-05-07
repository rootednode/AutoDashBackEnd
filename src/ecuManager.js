import { performance } from "perf_hooks";
import msDecoder from "./CAN/msDecoder.js";
import { DATA_MAP, WARNING_KEYS } from "./dataKeys.js";
import DataStore from "./DataStore.js";
import RingBuffer from "./lib/ringBuffer.js";
import ButtonManager from "./IO/Buttons.js";
import piShutdown from "./IO/piShutdown.js";


var traveled = 0;

export default (carSettings, canChannel) => {
  let buttons = new ButtonManager([
    // fuel reset button
    {
      onReleased: () => {
        gallonsLeft = carSettings.tank_size
        ecuDataStore.write(DATA_MAP.FUEL_LEVEL, 100)
      },
      holdNeeded: true,
    },
    {
      // light / dark theme toggle
      onPressed: () =>
        ecuDataStore.write(
          DATA_MAP.LOW_LIGHT_DETECTED,
          ecuDataStore.read(DATA_MAP.LOW_LIGHT_DETECTED) ? 0 : 1
        ),
      holdNeeded: false,
    },
    {
      // Manual Power Toggle
      onReleased: () => {
        piShutdown.now();
      },
      holdNeeded: true,
    },
    {
      // relay toggle - n
      onPressed: () => {
      },
      onReleased: () => {
      },
      holdNeeded: false,
    },
  ]);
  let getSpeed = () => 0;
  let msSample = 0;
  let lastMpgSampleTime = 0;
  let distance = 0;
  let lastFuelSample = 0; // Last Gal / Millisecond sample
  let baseOdometerReading = 0; // odometer reading when app started
  const ecuDataStore = new DataStore(); // just assign a big ass buffer
  const mpgSampler = new RingBuffer(Buffer.alloc(1024));
  let gallonsLeft = 0;

  // assign decoder - currently this was designed for racepak but we have LOOSE support for openInverter stuff
  const decoder = carSettings.can_type === "OI" ? openInverterDecoder : msDecoder;

  /**
   * Initialize Fuel Readings - get the last known gallons left
   * @param {Number} persistedGallonsLeft
   */
  const initializeFuel = (persistedGallonsLeft) => {
    gallonsLeft = persistedGallonsLeft;
    ecuDataStore.write(DATA_MAP.FUEL_LEVEL, 0);
    ecuDataStore.write(DATA_MAP.AVERAGE_MPG, 0);
    ecuDataStore.write(DATA_MAP.CURRENT_MPG, 0);
    msSample = performance.now();
    lastMpgSampleTime = performance.now();
    updateFuelLeft();
  };

  /**
   * Initialize the Odometer reading with the last known saved readout
   * @param {Number} lastSavedReading - last saved odometer reading
   */
  const initializeOdometer = (lastSavedReading) => {
    baseOdometerReading = lastSavedReading || carSettings.odometer;
    ecuDataStore.write(DATA_MAP.CURRENT_ODOMETER, baseOdometerReading);
//    ecuDataStore.write(DATA_MAP.ODOMETER, baseOdometerReading);
  };

  const initializeSpeedo = () => {
    //if (carSettings.speedo === "GPS") {
    //  getSpeed = () => ecuDataStore.read(DATA_MAP.GPS_SPEEED);
    //} else if (carSettings.speedo === "CAN") {
    getSpeed = () => ecuDataStore.read(DATA_MAP.SPEEDO);
    //getSpeed = () => 45;
    //} else {
    //  getSpeed = () => 0;
    //}
  }

  const init = ({ gallonsLeft, odometer }) => {
    if (carSettings.buttons_enabled) {
      buttons.start(); // start listening for button presses
    }
    initializeFuel(gallonsLeft || carSettings.tank_size);
    initializeSpeedo();
    ecuDataStore.updateWarning(WARNING_KEYS.ECU_COMM, true);
    ecuDataStore.write(DATA_MAP.TEMP_TYPE, 0); // default to F
    ecuDataStore.write(DATA_MAP.PRESSURE_TYPE, 1); // default to kpa (used for MAP) / /make sure you front end gets what it expects!
    console.log("init odo", odometer);
    initializeOdometer(odometer);
  };

  
  const updateFuelLeft = () => {
    if (carSettings.fuel_level_enabled) {
      ecuDataStore.write(
        DATA_MAP.FUEL_LEVEL,
        Math.max(0, Math.ceil((gallonsLeft / carSettings.tank_size) * 100))
      );
    }
  }

  const updateMPG = (data) => {
    if (getSpeed() < 0) {
      return;
    }

    const newMsSample = performance.now();
    const msDelta = newMsSample - msSample; // ms since last sample

    //  calculate fuel consumption based on the last sample
    // GPH = (Injector Flow Rate in lbs/hr x Injector Duty Cycle x Fuel Pressure) / (6 x 2.04 x Pulse Width in milliseconds)
   // (Pulsewidth * RPM) / 1200 = % Duty Cycle  ??
    //const gpMs = (data * 0.1621) / 3600000; // convert from pounds/hour to gal/hour, then to to gal/millisecond
    //const pMin = Math.min(lastFuelSample, gpMs);
    //const gallonsConsumed = (msDelta * (Math.max(lastFuelSample, gpMs) - pMin)) / 2 +  msDelta * pMin;
	//injector flow rate = 34.28571
	//duty cycle
	//fuel pressure = 43
	//Cycle Time = 1 / (3,000 RPM / 2 x 4)
	//Cycle Time = 1 / 3,000
	
	//         cc in lbs * dc * 43
	//Injector Flow Rate (lbs/hr) = (500 cc/min x 6 lbs/gal x 60) / 454.6
	//Injector Flow Rate (lbs/hr) = 37.9 lbs/hr 
	// GPH = (Injector Flow Rate (lbs/hr) x Duty Cycle x 60) / (Fuel Density (lbs/gal) x Injector Cycle Time (milliseconds))
	//var GPH = 34.286 / 6;

	
	//    Calculate the cycle time using: Cycle Time = 60000 / Engine Speed
	//    Calculate the duty cycle using: Duty Cycle = (Pulse Width / Cycle Time) x 100
	//    Calculate the fuel flow rate in GPH using: Fuel Flow Rate (GPH) = (Injector Flow Rate x Engine Speed x Duty Cycle x Cycle Time) / 3600

	//var cycletime = (60 / (ecuDataStore.read(DATA_MAP.RPM) / 720 ));

	var cycletime = (720 / (ecuDataStore.read(DATA_MAP.RPM)) /2 ) * 100;
	var dutycycle = (data / cycletime) * 100
	var GPH = (34.286 * ecuDataStore.read(DATA_MAP.RPM) * dutycycle) / 3600;

//	if (cycletime)
//	{
//		var cycletime = 0;
//	};

	const gpMs = GPH / 3600000; // convert to gal/millisecond
    const pMin = Math.min(lastFuelSample, gpMs);
    const gallonsConsumed = (msDelta * (Math.max(lastFuelSample, gpMs) - pMin)) / 2 +  msDelta * pMin;
    // update the fuel level
    gallonsLeft -= gallonsConsumed;

/*
	console.log('rpm', ecuDataStore.read(DATA_MAP.RPM));
	console.log('pw ms', data);
	console.log('cycletime ms', cycletime, ecuDataStore.read(DATA_MAP.RPM));
	console.log('dutycycle %', dutycycle);
	console.log('gph', GPH);
	console.log('gpms', gpMs);
	console.log('gal consumed', gallonsConsumed);
	console.log('gal left', gallonsLeft);
*/

    // SPEED BASED DISTANCE - distance (m) = speed (m/millisecond) * time (ms)
    // calculate distance since last sample
    // we do this because the odometer is in mile denom; where as can get tiny slices of a mile traveled based on the speed and time
    //distance = (getSpeed() / 3600000) * msDelta;

    //distance = (getSpeed() / 3600) * msDelta;

	// distance traveled 
	distance = ((getSpeed() / 3600) * 5280) / 1000;

	//console.log('speed', getSpeed());
	//console.log('distance per ms in feet', ((getSpeed() / 3600) * 5280) / 1000);

    // calc average MPGs
    var currentMpg = Math.floor(distance / gallonsConsumed);

	if (currentMpg < 0)
	{
		//console.log('0!');
//		let currentMpg = 0;
	}
	if (currentMpg > 100) {
		//console.log('100!');
		currentMpg = 100;
	}
	if (currentMpg == Infinity) {
		//console.log('nan!');
		currentMpg = 100;
	}

	if (isNaN(currentMpg)) {
		var currentMpg = 0;
		//console.log('infinity!', currentMpg);
	}

	//console.log('current mpg', currentMpg, mpgSampler.average);
	//console.log('');

    // add a new sample every 10 seconds
    if (newMsSample - lastMpgSampleTime > 10000) {
      lastMpgSampleTime = newMsSample;
      ecuDataStore.averageMPGPoints.push(mpgSampler.average);
      ecuDataStore.write(
        DATA_MAP.AVERAGE_MPG_POINT_INDEX,
        ecuDataStore.averageMPGPoints.frontOffset
      );
      ecuDataStore.write(
        DATA_MAP.AVERAGE_MPG,
        ecuDataStore.averageMPGPoints.average
      );
      mpgSampler.reset();
    } else {
      mpgSampler.push(currentMpg);
    }

    ecuDataStore.write(DATA_MAP.CURRENT_MPG, currentMpg);
    msSample = newMsSample;
    lastFuelSample = gpMs;
  }


  const updateValue = ({ dataKey, data }) => {
    // do any special handling depending on the new updated value
    switch (dataKey) {
      case DATA_MAP.PW1:
        updateMPG(data);
        //updateFuelLeft();
        break;
      case DATA_MAP.CTS:
        ecuDataStore.updateWarning(
          WARNING_KEYS.ENGINE_TEMPERATURE,
          data > carSettings.engine_temp_high
        );
        break;
      case DATA_MAP.OIL_PRESSURE:
        ecuDataStore.updateWarning(
          WARNING_KEYS.OIL_PRESSURE,
          data < carSettings.oil_low_limit
        );
        break;
      case DATA_MAP.BATT_VOLTAGE:
        ecuDataStore.updateWarning(
          WARNING_KEYS.BATT_VOLTAGE,
          data < carSettings.voltage_low_limit
        );
        break;
      case DATA_MAP.ODOMETER:
        //console.log("updating odometer", data, baseOdometerReading, traveled);

        traveled = traveled + (data / 10);

        // the data represents the offset from our base odometer reading
        // if data is zero, that means the odometer reading has been reset to zero
        //if (data === 0) {
          //update our base reading to be whatever we have stored in the current odometer
          //baseOdometerReading = ecuDataStore.read(DATA_MAP.ODOMETER);
          //console.log("odometer zero", data, baseOdometerReading);
        //}
        
        //baseOdometerReading = ecuDataStore.read(DATA_MAP.ODOMETER);
        data += baseOdometerReading;
        ecuDataStore.write(DATA_MAP.CURRENT_ODOMETER, (traveled+baseOdometerReading));
        ecuDataStore.write(DATA_MAP.TRIP_ODOMETER, (traveled));
        
        //console.log("updating odometer2", data, baseOdometerReading, traveled);
        


        break;
//      case WARNING_KEYS.GPS_NOT_ACQUIRED:
//        if (data) ecuDataStore.write(DATA_MAP.GPS_SPEEED, -1);
      default:
        break;
    }

    ecuDataStore.update(dataKey, data);
  };

  /**
   * if error, turns GPS error flag on
   * else updates GPS data
   * Returns updater callback to be on next update
   * @returns {Function}
   */
  /*const gpsUpdate = (msg) => {
    if (!msg) {
      // canparsing failure, shutdown
      return gpsUpdateStateToBroked(msg);
    }
    msg.forEach((gpsData) => updateValue({dataKey: gpsData.id, data: gpsData.data}));
    return gpsUpdate;
  };*/

  /**
   * turns off GPS error; updates GPS data
   * RReturns updater callback to be on next update
   * @returns {Function}
   */
  /*const gpsUpdateStateToWorking = (msg) => {
    if (msg) {
      ecuDataStore.updateWarning(WARNING_KEYS.GPS_ERROR, false);
      return gpsUpdate(msg);
    }
    return gpsUpdateStateToWorking;
  };*/

  /**
   * Turns GPS error on
   * Returns updater callback to be on next update
   * @returns {Function}
   */
  /*const gpsUpdateStateToBroked = (msg) => {
    ecuDataStore.write(DATA_MAP.GPS_SPEEED, -1);
    ecuDataStore.updateWarning(WARNING_KEYS.GPS_ERROR, true);
    return gpsUpdateStateToWorking;
  };*/

  /** @type {Function} */
  //let gpsUpdater = gpsUpdateStateToBroked;




  const canUpdate = (msg) => {
    if (msg === false) {
      // canparsing failure, shutdown
      return canUpdateToError();
    } else {
      decoder.do(msg).forEach((canData) => updateValue({dataKey: canData.id, data: canData.data}));
      return canUpdate;
    }
  };

  // turns on CAN error, initiate shutdown
  const canUpdateToError = () => {
    if (canChannel == 'can0' && carSettings.shutdown_when_can_stops) {
      piShutdown.start();  // dont shutdown if we are stesting stuff
    }
    ecuDataStore.updateWarning(WARNING_KEYS.ECU_COMM, true);
    return canUpdateErrorState;
  };

  // check if we have can message, if so, return back to normal state
  const canUpdateErrorState = (msg) => {
    if (msg) {
      piShutdown.stop();
      ecuDataStore.updateWarning(WARNING_KEYS.ECU_COMM, false);
      return canUpdate(msg);
    }
    return canUpdateErrorState;
  }

  /** 
   * Called when there is an update from the Can Manager (msg or can failure)
   * start out in error state - so it doesnt trigger shutdown right off that bat (useful when testing)
   * @type {Function} 
   * @returns {Function} - the updater function to call next (state machine)
  */
  let canUpdater = canUpdateErrorState;

  const ecu = {
    init,
    stop: () => {
      try {
        buttons.stop();
      } catch (error) {}
    },
    /**
     *
     * @returns {Buffer}
     */
    latestPacket: () => ecuDataStore.buffer, // see todo in DataStore.js:write
    persistantData: () => {
      return {
        odometer: ecuDataStore.read(DATA_MAP.CURRENT_ODOMETER),
        gallonsLeft: gallonsLeft,
      };
    },

    /**
     * @param {{ ts: number; id: number; data: Uint8Array; ext: boolean; } | false} msg
     */
    updateFromCanBus: (msg) => {
      canUpdater = canUpdater(msg);
    },

    // Updates GPS data, if error, will turn error off on next successful update
    //updateFromGPS: (msg) => {
    //  gpsUpdater = gpsUpdater(msg);
    //},
  };
  return ecu;
};
