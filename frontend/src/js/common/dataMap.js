import RingBuffer from "./ringBuffer";

let key = 0;
const keygen = (reset = false) => {
  if (reset) key = 0;
  return key++;
};

// NOTE!!!!!!!!!!!!!!!
// IF YOU CHANGE ANYTHING HERE; MAKE SURE IT GETS COPIED OVER TO BACKEND DATAKEYS.JS AS WELL!!!


export const TYPES = {
  INT8: 1,
  INT16: 2,
  FLOAT: 3,
  BITFIELD: 4,
  SPECIAL_ARRAY: 5, // 100 bytes
  UINT8: 6,
  UINT16: 7,
  UINT32: 8,
}

/**
 * @typedef {{ id: number,byteType: number }} DataMapEntry
 * Data Keys are a hash of DataMapEntry objects
 * @typedef {Object.<string, DataMapEntry>} DataKeys
 */
export const DATA_MAP = {
  // -----------------------------
  // YOUR ORIGINAL FIELDS (UNCHANGED)
  // -----------------------------
  COM: { id: keygen(), byteType: TYPES.INT8 },
  RPM: { id: keygen(), byteType: TYPES.INT16 },
  SPEEDO: { id: keygen(), byteType: TYPES.INT16 },
  PW1: { id: keygen(), byteType: TYPES.FLOAT },
  ADV: { id: keygen(), byteType: TYPES.FLOAT },
  DUTY_CYCLE: { id: keygen(), byteType: TYPES.INT8 },
  AFR: { id: keygen(), byteType: TYPES.FLOAT },
  EGO: { id: keygen(), byteType: TYPES.FLOAT },
  MAP: { id: keygen(), byteType: TYPES.INT16 },
  MAT: { id: keygen(), byteType: TYPES.INT16 },
  TPS: { id: keygen(), byteType: TYPES.INT16 },
  CTS: { id: keygen(), byteType: TYPES.INT16 },
  ENGINE: { id: keygen(), byteType: TYPES.INT16 },
  STATUS1: { id: keygen(), byteType: TYPES.INT16 },
  STATUS2: { id: keygen(), byteType: TYPES.INT16 },
  STATUS3: { id: keygen(), byteType: TYPES.INT16 },
  STATUS4: { id: keygen(), byteType: TYPES.INT16 },
  STATUS5: { id: keygen(), byteType: TYPES.UINT16 },
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

  CURRENT_ODOMETER: { id: keygen(), byteType: TYPES.FLOAT },
  ODOMETER: { id: keygen(), byteType: TYPES.FLOAT },
  TRIP_ODOMETER: { id: keygen(), byteType: TYPES.FLOAT },

  WARNINGS: { id: keygen(), byteType: TYPES.BITFIELD },

  ECO: { id: keygen(), byteType: TYPES.INT8 }, // 0-100%
  
	FUEL_SENDER_CONNECTED: { id: keygen(), byteType: TYPES.INT8 }, // 0-100%
  FUEL_LEVEL: { id: keygen(), byteType: TYPES.INT16 },
  FUEL_GALLONS_USED: { id: keygen(), byteType: TYPES.FLOAT },
	FUEL_GALLONS_SINCE_REFILL: { id: keygen(), byteType: TYPES.FLOAT },

  CURRENT_MPG: { id: keygen(), byteType: TYPES.FLOAT },
  AVERAGE_MPG: { id: keygen(), byteType: TYPES.FLOAT },
  HISTORICAL_MPG: { id: keygen(), byteType: TYPES.FLOAT },
  LOW_LIGHT_DETECTED: { id: keygen(), byteType: TYPES.INT8 },

  PRESSURE_TYPE: { id: keygen(), byteType: TYPES.INT8 },
  TEMP_TYPE: { id: keygen(), byteType: TYPES.INT8 },

  HV_BATT_VOLTAGE: { id: keygen(), byteType: TYPES.FLOAT },
  SOME_NEW_VALUE: { id: keygen(), byteType: TYPES.UINT32 },

}; // END DATA_MAP








// iterate through each key and add the byteOffset to the object
let offset = 0;
Object.keys(DATA_MAP).forEach((key) => {
  const entry = DATA_MAP[key];
  entry.byteOffset = offset;
  switch (entry.byteType) {
    case TYPES.INT8:
      offset += 1;
      break;
    case TYPES.INT16:
      offset += 2;
      break;
    case TYPES.FLOAT:
      offset += 4;
      break;
    case TYPES.BITFIELD:
      offset += 1;
      break;
    case TYPES.SPECIAL_ARRAY:
      offset += 100;
      break;
    case TYPES.UINT8:
      offset += 1;
      break;
    case TYPES.UINT16:
      offset += 2;
      break;
    case TYPES.UINT32:
      offset += 4;
      break;
    default:
      throw new Error(`Unknown byteType: ${entry.byteType}`);
  }

});


Object.freeze(DATA_MAP);

// Keys for handling the WARNINGS Structure
//export const WARNING_KEYS = {
//  COMM_ERROR: keygen(),
//};
//Object.freeze(WARNING_KEYS);

/**
 * Once Source of truth - keyed by DATA_KEYS
 * @returns
 */
export const createDataStore = () => {
  let dataStore = [];
  let deserializer = [];
  for (const [_key, value] of Object.entries(DATA_MAP)) {
    dataStore[value.id] = 0;
    switch (value.byteType) {
      case TYPES.INT8:
        deserializer[value.id] = (data) => data.getInt8(value.byteOffset);
        break;
      case TYPES.INT16:
        deserializer[value.id] = (data) => data.getInt16(value.byteOffset);
        break;
      case TYPES.UINT8:
        deserializer[value.id] = (data) => data.getUint8(value.byteOffset);
        break;
      case TYPES.UINT16:
        deserializer[value.id] = (data) => data.getUint16(value.byteOffset);
        break;
      case TYPES.UINT32:
        deserializer[value.id] = (data) => data.getUint32(value.byteOffset);
        break;
      case TYPES.FLOAT:
        deserializer[value.id] = (data) => data.getFloat32(value.byteOffset);
        break;
      case TYPES.BITFIELD:
        deserializer[value.id] = (data) => data.getUint8(value.byteOffset);
        break;
      case TYPES.SPECIAL_ARRAY:
        deserializer[value.id] = (data) => new RingBuffer(data.buffer, value.byteOffset, 100, data.getInt8(value.byteOffset + 100));
        break;
      default:
        throw new Error(`Unknown type ${value.byteType}`);
    }
  }

  /**
   *
   * @param {DataMapEntry} dataMapKey - key from DATA_KEYS
   * @returns
   */
  const getData = (dataMapKey) => {
    return dataStore[dataMapKey.id];
  };

  /**
   *
   * @param {*} warningMask - value from WARNING_KEYS
   * @returns {Boolean}
   */
  //const getWarning = (warningMask) => {
  //  return !!(dataStore[DATA_MAP.WARNINGS.id] & (128 >> warningMask % 8));
  //};

  /**
   * 
   * @param {DataMapEntry} dataMapKey 
   * @param {*} data 
   */
  const setData = (dataMapKey, data) => {
    dataStore[dataMapKey.id] = data;
  };

  /**
   * 
   * @param {Number} bit 
   * @param {Boolean} value 
   */
/*  const setWarningBit = (bit, value) => {
    if (bit > 7) throw "I screwed up: error - bit field key cannot be > 7";
    if (value) {
      // set the bit
      dataStore[DATA_MAP.WARNINGS.id] =
        dataStore[DATA_MAP.WARNINGS.id] | (128 >> bit % 8);
    } else {
      // clear the bit
      dataStore[DATA_MAP.WARNINGS.id] =
        dataStore[DATA_MAP.WARNINGS.id] & ~(128 >> bit % 8);
    }
  };
*/


  return {
    get: getData,
    set: setData,
    deserialize: (/** @type {DataView} */ data) => {
      // this is dumb, and a waste of cpu cycles to do this everytime, will optimize later
      for (const [_key, dataMapKey] of Object.entries(DATA_MAP)) {
        dataStore[dataMapKey.id] = deserializer[dataMapKey.id](data);
      }
    },
    data: dataStore,
  };
};
