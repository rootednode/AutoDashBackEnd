import { TYPES } from "./lib/PacketEntry.js";

let key = 0;
const keygen = (reset = false) => {
  if (reset) key = 0;
  return key++;
};

// ADDING ANOTHER DATA KEY:
/**
 * 1. add this anywhere in DATA_MAP:
 *     YOUR_NEW_KEY: { id: keygen(), byteType: TYPES.XXX },
 * 2. Copy DATA_MAP, and replace the DATA_MAP on front end: in DataMap.js
 * 3. Rebuild!
 */


/**
 * @typedef {{ id: number, byteType: number; }} DataMapEntry
 */


export const DATA_MAP = {
  // Data From CAN BUS
  COM: { id: keygen(), byteType: TYPES.INT8 },
  RPM: { id: keygen(), byteType: TYPES.INT16 }, // units 1 === 1 RPM,  xx,xxx
  SPEEDO: { id: keygen(), byteType: TYPES.INT16 }, // Holley Speed = units 1 === 1 mph
  PW1: { id: keygen(), byteType: TYPES.FLOAT },
  ADV: { id: keygen(), byteType: TYPES.FLOAT },
  DUTY_CYCLE: { id: keygen(), byteType: TYPES.INT8 },
  AFR: { id: keygen(), byteType: TYPES.FLOAT },
  EGO: { id: keygen(), byteType: TYPES.FLOAT },
  MAP: { id: keygen(), byteType: TYPES.INT16 }, // units 1 === 1 (PRESSURE_TYPE) (defaults to kpa if not set)
  MAT: { id: keygen(), byteType: TYPES.INT16 }, //manifold temp 
  TPS: { id: keygen(), byteType: TYPES.INT16 },
  CTS: { id: keygen(), byteType: TYPES.INT16 },  // coolant (defaults to F if TEMP_TYPE isnt set )
  ENGINE: { id: keygen(), byteType: TYPES.INT16 },
  STATUS1: { id: keygen(), byteType: TYPES.INT16 },
  STATUS2: { id: keygen(), byteType: TYPES.INT16 },
  STATUS3: { id: keygen(), byteType: TYPES.INT16 },
  STATUS4: { id: keygen(), byteType: TYPES.INT16 },
  STATUS5: { id: keygen(), byteType: TYPES.INT16 },
  STATUS6: { id: keygen(), byteType: TYPES.INT16 },
  STATUS7: { id: keygen(), byteType: TYPES.INT16 },
  STATUS8: { id: keygen(), byteType: TYPES.INT16 },
  SENSOR1: { id: keygen(), byteType: TYPES.FLOAT },
  SENSOR2: { id: keygen(), byteType: TYPES.FLOAT },
  SENSOR3: { id: keygen(), byteType: TYPES.FLOAT },
  SENSOR4: { id: keygen(), byteType: TYPES.FLOAT },
  VOLT: { id: keygen(), byteType: TYPES.FLOAT },

  ADC1: { id: keygen(), byteType: TYPES.FLOAT },
  ADC2: { id: keygen(), byteType: TYPES.FLOAT },
  ADC3: { id: keygen(), byteType: TYPES.FLOAT },
  ADC4: { id: keygen(), byteType: TYPES.FLOAT },

  // Data from GPS
  CURRENT_ODOMETER:{ id: keygen(), byteType: TYPES.FLOAT },// Current Miles Odometer
  ODOMETER:{ id: keygen(), byteType: TYPES.FLOAT },// Current Miles Odometer
  TRIP_ODOMETER: { id: keygen(), byteType: TYPES.FLOAT }, //

  WARNINGS: { id: keygen(), byteType: TYPES.BITFIELD }, // see warning keys

  ECO: { id: keygen(), byteType: TYPES.INT8 }, // 0-100%

  FUEL_SENDER_CONNECTED: { id: keygen(), byteType: TYPES.INT8 }, // 0-100%
  FUEL_LEVEL: { id: keygen(), byteType: TYPES.INT16 }, // 0-100%
  FUEL_GALLONS_USED: { id: keygen(), byteType: TYPES.FLOAT },
  FUEL_GALLONS_SINCE_REFILL: { id: keygen(), byteType: TYPES.FLOAT },

  CURRENT_MPG: { id: keygen(), byteType: TYPES.FLOAT },
  AVERAGE_MPG: { id: keygen(), byteType: TYPES.FLOAT },
  HISTORICAL_MPG: { id: keygen(), byteType: TYPES.FLOAT },

  LOW_LIGHT_DETECTED: { id: keygen(), byteType: TYPES.INT8 },

  // TODO: ;just make a single bitfield for these types of things
  PRESSURE_TYPE: { id: keygen(), byteType: TYPES.INT8 }, // 0 for PSI, 1 for kpa
  TEMP_TYPE: { id: keygen(), byteType: TYPES.INT8 }, // 0 for F, 1 for C

  ///
  HV_BATT_VOLTAGE: { id: keygen(), byteType: TYPES.FLOAT }, // xx.x volts
  SOME_NEW_VALUE: { id: keygen(), byteType: TYPES.UINT32 },
};
Object.freeze(DATA_MAP);

// Keys for handling the WARNINGS Structure
const firstWarningKey = keygen();
export const WARNING_KEYS = {
  FIRST: firstWarningKey,
  BATT_VOLTAGE: firstWarningKey, // voltage too low
  OIL_PRESSURE: keygen(), // pressure too low
  LOW_FUEL: keygen(),
  ENGINE_TEMPERATURE: keygen(), // temp too high
  ECU_COMM: keygen(), // trouble communicating with ECU via CAN
  GPS_NOT_ACQUIRED: keygen(), // GPS working / or no 2d/3d fix aqcuired yet
  GPS_ERROR: keygen(), // some sort of untracked error occurred
  COMM_ERROR: keygen(),
};
Object.freeze(WARNING_KEYS);


// // simplify DATA_KEYS to ids from [{key: { id: number; byte?: number; }}] to [{key: id}]
// // @type {Record<string, number>}
// export const DATA_KEYS = Object.entries(DATA_KEY_MAP).reduce((acc, [k, v]) => {
//   acc[k] = v.id;
//   return acc;
// }, {});
