import { DATA_MAP } from "../dataKeys.js";

let pw1 = 0;
let adv = 0;
let rpm = 0;
let clt = 0;
let map = 0;
let mat = 0;
let ego = 0;
let tps = 0;
let speed = 0;
let status1 = 0;
let status2 = 0;
let status3 = 0;
let status4 = 0;
let status5 = 0;
let status6 = 0;
let status7 = 0;
let status8 = 0;

const RACEPACK_CAN_MAP = {

	0x5F0: (data) => {
//    		console.log('rpm', data, data.readInt16BE(0), data.readInt16BE(2), data.readInt16BE(4), data.readInt16BE(6));


		pw1 = 0;
		if ((data.readInt16BE(2) > 0) && (data.readInt16BE(2) < 6000 ))
		{
//			console.log('pw1 in range');
			pw1 = data.readInt16BE(2) / 1000;
//			pw1 = pw1.toFixed(1);
		}
//		console.log('pw1', pw1);

		rpm = 0;
		if ((data.readInt16BE(6) > 0) && (data.readInt16BE(6) < 6000 ))
		{
//			console.log('rpm in range');
			rpm = data.readInt16BE(6);
		}
//		console.log('rpm', rpm);




		return [
			{ id: DATA_MAP.PW1, data: pw1},
			{ id: DATA_MAP.RPM, data: rpm},
		];
	},

	0x5F1: (data) => {

		adv = 0;
		if ((data.readInt16BE(0) > 0) && (data.readInt16BE(0) < 6000 ))
		{
			adv = data.readInt16BE(0) / 10;
		}

		return [
			{ id: DATA_MAP.ADV, data: adv},
		];
	},

	0x5F2: (data) => {
//		console.log('clt', data, data.readInt16BE(0), data.readInt16BE(2), data.readInt16BE(4), data.readInt16BE(6));


		map = 0;
		if ((data.readInt16BE(2) > 0) && (data.readInt16BE(2) < 10000 ))
		{
			map = data.readInt16BE(2);
			map = (map / 10);
		}

		mat = 0;
		if ((data.readInt16BE(4) > 0) && (data.readInt16BE(4) < 10000 ))
		{
			mat = data.readInt16BE(4);
			mat = (mat / 10);
		}

		clt = 0;
		if ((data.readInt16BE(6) > 0) && (data.readInt16BE(6) < 10000 ))
		{
			clt = data.readInt16BE(6);
			clt = (clt / 10);
		}

//		clt = Math.floor(Math.random() * 10000); 

    	return [
      		{ id: DATA_MAP.CTS, data: clt },
      		{ id: DATA_MAP.MAT, data: mat },
      		{ id: DATA_MAP.MAP, data: map },

    	];
	},

  	0x5F3: (data) => {
//   		console.log('tps', data, data.readInt16BE(0), data.readInt16BE(2), data.readInt16BE(4), data.readInt16BE(6));

		tps = 0;
		if ((data.readInt16BE(0) > 0) && (data.readInt16BE(0) < 10000 ))
		{
			tps = data.readInt16BE(0);
			tps = (tps / 10);
		}

//		tps = Math.floor(Math.random() * 10000); 

		ego = 0;
		if ((data.readInt16BE(4) > 0) && (data.readInt16BE(4) < 10000 ))
		{
			ego = data.readInt16BE(4);
			ego = (ego / 10);
		}


    	return [
      		{ id: DATA_MAP.TPS, data: tps },
      		{ id: DATA_MAP.EGO, data: ego },
    	];
  	},

  	0x5FA: (data) => {
//   		console.log('tps', data, data.readInt16BE(0), data.readInt16BE(2), data.readInt16BE(4), data.readInt16BE(6));

		//status12 = data.readInt16BE(0);
		//status23 = data.readInt16BE(2);
		//status45 = data.readInt16BE(4);
		status1 = (data.readInt16BE(0) >> 8) & 0xFF;
		status2 = (data.readInt16BE(0) & 0xFF);



		status5 = (data.readInt16BE(5) >> 8) & 0xFF;
		status6 = (data.readInt16BE(5) & 0xFF);

		status7 = (data.readInt16BE(6) >> 8) & 0xFF;
		status8 = (data.readInt16BE(6) & 0xFF);
		
		console.log('s5', status5);
		console.log('s6', status6);
		console.log('s7', status7);
		console.log('s8', status8);
    	
		return [
      		{ id: DATA_MAP.STATUS1, data: status1 },
      		{ id: DATA_MAP.STATUS2, data: status2 },
      		{ id: DATA_MAP.STATUS3, data: status3 },
      		{ id: DATA_MAP.STATUS4, data: status4 },
      		{ id: DATA_MAP.STATUS5, data: status5 },
      		{ id: DATA_MAP.STATUS6, data: status6 },
      		{ id: DATA_MAP.STATUS7, data: status7 },
      		{ id: DATA_MAP.STATUS8, data: status8 },
    	];
  	},

  	0x61A: (data) => {
//    	console.log('vss', data, data.readInt16BE(0), data.readInt16BE(2), data.readInt16BE(4), data.readInt16BE(6));

		speed = 0;
		if ((data.readInt16BE(0) > 0) && (data.readInt16BE(0) < 10000 ))
		{
			speed = data.readInt16BE(0);
		}

		
		// convert from 10ths
		speed = (speed / 10);

		// convert feet per sec to mph
		//var speedmph = speed * 0.681818
		//speedmph = speedmph + (speedmph / 10)

		// convert meters per sec to mph
		var speedmph = speed * 2.23694;

		//var speedmph = speed / 4
		//speedmph = speedmph + (speedmph / 10)
		//speedmph= (speedmph * 2)

    	return [
      		{ id: DATA_MAP.SPEEDO, data: speedmph },
        	{ id: DATA_MAP.ODOMETER, data: (speedmph / 3600) },
    	];	
  	},

}

// BIG NOTE:  (note for OpenINverter that uses LE)
// Double check your ECU stores data Big Endian or Little Endian
// and use the appropriate method to read the data
// ex: data.readInt32BE(0) or data.readInt32LE(0)
const msDecoder = {
  /**
   * @param {{ ts: number; id: number; data: Uint8Array; ext: boolean; }} canMsg
   * @returns {[{id:import("../dataKeys.js").DataMapEntry, data:Number}] | []}
   */
  do: (canMsg) => {
    //const decodedId = canMsg.id & 0xfffff800;
    const decodedId = canMsg.id;
    if (!!RACEPACK_CAN_MAP[decodedId]) {
      return RACEPACK_CAN_MAP[decodedId](Buffer.from(canMsg.data.buffer));
    } else {
      return [];
    }
  },
};

export default msDecoder;

// TODO: figure out way of not having to access key each time, (bake it in on init, reduce cycles)
