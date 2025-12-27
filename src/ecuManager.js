import { performance } from "perf_hooks";
import msDecoder from "./CAN/msDecoder.js";
import fuelLevelUpdater from "./fuelLevelReader.js";
import { computeEcoBar } from "./ecoBar.js";
import { DATA_MAP, WARNING_KEYS } from "./dataKeys.js";
import DataStore from "./DataStore.js";
import RingBuffer from "./lib/ringBuffer.js";
//import ButtonManager from "./IO/Buttons.js";
//import piShutdown from "./IO/piShutdown.js";

var traveled = 0;

export default (carSettings, canChannel) => {
	const STALE_CAN_MS = 500; // how long before CAN data is considered stale

	let getSpeed = () => 0;
	let msSample = 0;
	let lastMpgSampleTime = 0;
	let distance = 0;
	let lastFuelSample = 0; // Last Gal / Millisecond sample
	let baseOdometerReading = 0; // odometer reading when app started
	const ecuDataStore = new DataStore(); // backing buffer
	//const mpgSampler = new RingBuffer(Buffer.alloc(1024));
	//let gallonsLeft = 0;

	// track last time CAN data was updated
	let lastCanUpdateTime = 0;

	// assign decoder - currently this was designed for racepak but we have LOOSE support for openInverter stuff
	const decoder = carSettings.can_type === "OI" ? openInverterDecoder : msDecoder;

	/**
	 * Initialize the Odometer reading with the last known saved readout
	 * @param {Number} lastSavedReading - last saved odometer reading
	 */
	const initializeOdometer = (lastSavedReading) => {
		baseOdometerReading = lastSavedReading || carSettings.odometer;
		ecuDataStore.write(DATA_MAP.CURRENT_ODOMETER, baseOdometerReading);
		// ecuDataStore.write(DATA_MAP.ODOMETER, baseOdometerReading);
	};

	const initializeSpeedo = () => {
		getSpeed = () => ecuDataStore.read(DATA_MAP.SPEEDO);
	};

//	const init = ({ gallonsLeft, odometer }) => {
	const init = ({ odometer }) => {
		initializeSpeedo();
		ecuDataStore.updateWarning(WARNING_KEYS.ECU_COMM, true);
		ecuDataStore.write(DATA_MAP.TEMP_TYPE, 0); // default to F
		ecuDataStore.write(DATA_MAP.PRESSURE_TYPE, 1); // default to kpa (used for MAP)
		console.log("init odo", odometer);
		initializeOdometer(odometer);

fuelLevelUpdater(ecuDataStore, () => {
  // intentionally empty
  // fuel updates must NOT mark CAN as fresh
});



	};

	const updateValue = ({ dataKey, data }) => {
		// do any special handling depending on the new updated value
		switch (dataKey) {
			case DATA_MAP.PW1:
				//updateMPG(data);
				// updateFuelLeft();
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

			case DATA_MAP.ODOMETER: {
				// data from CAN = miles increment since last tick
				const tripIncrement = data;

				// Trip odometer increases directly
				traveled += tripIncrement;

				// Store Trip
				ecuDataStore.write(DATA_MAP.TRIP_ODOMETER, traveled);

				// Current ODO = base + trip
				const currentOdo = baseOdometerReading + traveled;
				ecuDataStore.write(DATA_MAP.CURRENT_ODOMETER, currentOdo);


/*console.log(
	"increment", data,
	"traveled", traveled,
	"currentOdo", currentOdo
);*/



				break;




			}
		}

		ecuDataStore.update(dataKey, data);
	};

	const canUpdate = (msg) => {
		if (msg === false) {
			// canparsing failure, shutdown
			return canUpdateToError();
		} else {
			decoder
				.do(msg)
				.forEach((canData) =>
					updateValue({ dataKey: canData.id, data: canData.data })
				);


    const eco = computeEcoBar(ecuDataStore);

    if (eco) {
      ecuDataStore.write(DATA_MAP.ECO, eco.eco_pct);
    }

			return canUpdate;
		}
	};

	// turns on CAN error, initiate shutdown
	const canUpdateToError = () => {
//		if (canChannel === "can0" && carSettings.shutdown_when_can_stops) {
//			piShutdown.start(); // dont shutdown if we are testing stuff
//		}
		ecuDataStore.updateWarning(WARNING_KEYS.ECU_COMM, true);
		return canUpdateErrorState;
	};

	// check if we have can message, if so, return back to normal state
	const canUpdateErrorState = (msg) => {
		if (msg) {
//			piShutdown.stop();
			ecuDataStore.updateWarning(WARNING_KEYS.ECU_COMM, false);
			return canUpdate(msg);
		}
		return canUpdateErrorState;
	};

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
		 * Return latest packet ONLY if CAN data is fresh.
		 * @returns {Buffer|null}
		 */
		latestPacket: () => {
			const now = performance.now();

			// never seen a good CAN update
			if (lastCanUpdateTime === 0) return null;

			// if CAN hasn't updated recently, treat as stale
			if (now - lastCanUpdateTime > STALE_CAN_MS) {
				return null;
			}

			// fresh enough - safe to send
			return ecuDataStore.buffer; // see todo in DataStore.js:write
		},

		persistantData: () => {
			return {
				odometer: ecuDataStore.read(DATA_MAP.CURRENT_ODOMETER),
				//gallonsLeft: gallonsLeft,
			};
		},

		/**
		 * @param {{ ts: number; id: number; data: Uint8Array; ext: boolean; } | false} msg
		 */
		updateFromCanBus: (msg) => {
			// only mark as fresh when a real CAN message arrived
			if (msg) {
				lastCanUpdateTime = performance.now();
			}
			canUpdater = canUpdater(msg);
		},

	};

	return ecu;
};

