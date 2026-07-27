import { performance } from "perf_hooks";
import msDecoder, {
	resetCanTrip,
	resetCanTripMpg
} from "./CAN/msDecoder.js";
import fuelLevelUpdater, {
	resetTripFuelUsed,
	seedPersistedFuelState
} from "./fuelLevelReader.js";
import { computeEcoBar } from "./ecoBar.js";
import { DATA_MAP, WARNING_KEYS } from "./dataKeys.js";
import DataStore from "./DataStore.js";
import RingBuffer from "./lib/ringBuffer.js";
import { vehicleTimeMs } from "./CAN/canTime.js";
import { TANK_CAPACITY_GALLONS } from "../settings/vehicleConfig.js";
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

	// Only the MegaSquirt/Racepak decoder is present in this build. Keep the
	// server operational if an old OI setting is encountered instead of
	// referencing a decoder that does not exist.
	if (carSettings.can_type === "OI") {
		console.warn("[ECU] OI decoder is unavailable; falling back to the MegaSquirt decoder");
	}
	const decoder = msDecoder;
	let stopFuelLevelUpdater = null;
	let replayFuelState = null;

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

		if (stopFuelLevelUpdater) stopFuelLevelUpdater();
			if (process.env.STARTUP_MODE !== "replay_logs") {
			stopFuelLevelUpdater = fuelLevelUpdater(
				ecuDataStore,
				() => lastCanUpdateTime !== 0 &&
					performance.now() - lastCanUpdateTime <= STALE_CAN_MS
			);
			} else {
				replayFuelState = seedPersistedFuelState(ecuDataStore);
			}



	};

	const updateValue = ({ dataKey, data }) => {
		// do any special handling depending on the new updated value
		switch (dataKey) {
			case DATA_MAP.PW1:
				//updateMPG(data);
				// updateFuelLeft();
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

		if (
			process.env.STARTUP_MODE === "replay_logs" &&
			replayFuelState &&
			dataKey === DATA_MAP.FUEL_GALLONS_USED
		) {
			const replayGallonsUsed = Math.max(0, Number(data) || 0);
			const startingPercent = Number(replayFuelState.fuelPercent);
			const persistedRemaining = Number(replayFuelState.gallonsRemaining);
			const startingGallons = Number.isFinite(persistedRemaining) &&
				persistedRemaining >= 0
				? persistedRemaining
				: Number.isFinite(startingPercent)
					? Math.max(0, Math.min(100, startingPercent)) / 100 *
						TANK_CAPACITY_GALLONS
					: null;
			if (startingGallons !== null) {
				const remainingGallons = Math.max(
					0,
					startingGallons - replayGallonsUsed
				);
				ecuDataStore.write(
					DATA_MAP.FUEL_LEVEL,
					remainingGallons / TANK_CAPACITY_GALLONS * 100
				);
				ecuDataStore.write(
					DATA_MAP.FUEL_GALLONS_REMAINING,
					remainingGallons
				);
			}
			ecuDataStore.write(
				DATA_MAP.FUEL_GALLONS_SINCE_REFILL,
				Math.max(0, replayFuelState.gallonsSinceRefill) + replayGallonsUsed
			);
		}
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


    const eco = computeEcoBar(ecuDataStore, vehicleTimeMs(msg));

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
			if (stopFuelLevelUpdater) {
				stopFuelLevelUpdater();
				stopFuelLevelUpdater = null;
			}
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

		readValue: (dataKey) => ecuDataStore.read(dataKey),

		canStatus: () => {
			const ageMs = lastCanUpdateTime === 0
				? null
				: Math.max(0, performance.now() - lastCanUpdateTime);
			return {
				fresh: ageMs !== null && ageMs <= STALE_CAN_MS,
				lastUpdateAgeMs: ageMs === null ? null : Math.round(ageMs)
			};
		},

		resetTrip: () => {
			const currentOdometer =
				ecuDataStore.read(DATA_MAP.CURRENT_ODOMETER);
			baseOdometerReading = currentOdometer;
			traveled = 0;
			resetCanTrip();
			resetTripFuelUsed();
			ecuDataStore.write(DATA_MAP.TRIP_ODOMETER, 0);
			ecuDataStore.write(DATA_MAP.FUEL_GALLONS_USED, 0);
			ecuDataStore.write(DATA_MAP.AVERAGE_MPG, 0);
			return {
				odometer: currentOdometer,
				tripOdometer: 0,
				tripFuelUsed: 0,
				averageMpg: 0
			};
		},

		resetTripMpg: () => {
			resetCanTripMpg();
			ecuDataStore.write(DATA_MAP.AVERAGE_MPG, 0);
			return {
				averageMpg: 0,
				tripOdometer: ecuDataStore.read(DATA_MAP.TRIP_ODOMETER),
				tripFuelUsed: ecuDataStore.read(DATA_MAP.FUEL_GALLONS_USED)
			};
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
