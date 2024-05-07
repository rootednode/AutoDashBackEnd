(()=>{var e={115:function(e,t,n){var i,r;r="undefined"!=typeof window?window:void 0!==n.g?n.g:this,i=function(){return function(e,t){var n=function(i,r,o){var s,a,c={close:function(){}},y=this,f=0,d=-1,u=!1,p=!1,b=Object.assign({},n.defaultOptions,"function"==typeof o?{shouldReconnect:o}:o);if("number"!=typeof b.timeout)throw new Error("timeout must be the number of milliseconds to timeout a connection attempt");if("function"!=typeof b.shouldReconnect)throw new Error("shouldReconnect must be a function that returns the number of milliseconds to wait for a reconnect attempt, or null or undefined to not reconnect.");function T(){a&&(clearTimeout(a),a=null)}["bufferedAmount","url","readyState","protocol","extensions"].forEach((function(e){Object.defineProperty(y,e,{get:function(){return c[e]}})}));var l=function(e){u&&(T(),R(e))},E=function(){u=!0,c.close(1e3)},O=!1;function h(){O&&(e.removeEventListener("online",l),e.removeEventListener("offline",E),O=!1)}function R(e){if(!b.shouldReconnect.handle1000&&1e3===e.code||p)f=0;else if(!1!==t.onLine){var n=b.shouldReconnect(e,y);"number"==typeof n&&(a=setTimeout(v,n))}else u=!0}function v(){var t="function"==typeof i?i(y):i;a=null,(c=new WebSocket(t,r||void 0)).binaryType=y.binaryType,f++,y.dispatchEvent(Object.assign(new CustomEvent("connecting"),{attempts:f,reconnects:d})),s=setTimeout((function(){s=null,h(),y.dispatchEvent(Object.assign(new CustomEvent("timeout"),{attempts:f,reconnects:d}))}),b.timeout),["open","close","message","error"].forEach((function(e){c.addEventListener(e,(function(t){y.dispatchEvent(t);var n=y["on"+e];if("function"==typeof n)return n.apply(y,arguments)}))})),b.ignoreConnectivityEvents||O||(e.addEventListener("online",l),e.addEventListener("offline",E),O=!0)}y.send=function(){return c.send.apply(c,arguments)},y.close=function(e,t){return"number"!=typeof e&&(t=e,e=1e3),T(),u=!1,p=!0,h(),c.close(e,t)},y.open=function(){c.readyState!==WebSocket.OPEN&&c.readyState!==WebSocket.CONNECTING&&(T(),u=!1,p=!1,v())},Object.defineProperty(y,"listeners",{value:{open:[function(e){s&&(clearTimeout(s),s=null),e.reconnects=++d,e.attempts=f,f=0,u=!1}],close:[R]}}),Object.defineProperty(y,"attempts",{get:function(){return f},enumerable:!0}),Object.defineProperty(y,"reconnects",{get:function(){return d},enumerable:!0}),b.automaticOpen&&v()};return n.defaultOptions={timeout:4e3,shouldReconnect:function(e,t){if(1008!==e.code&&1011!==e.code)return[0,3e3,1e4][t.attempts]},ignoreConnectivityEvents:!1,automaticOpen:!0},n.prototype.binaryType="blob",n.prototype.addEventListener=function(e,t){e in this.listeners||(this.listeners[e]=[]),this.listeners[e].push(t)},n.prototype.removeEventListener=function(e,t){if(e in this.listeners)for(var n=this.listeners[e],i=0,r=n.length;i<r;i++)if(n[i]===t)return void n.splice(i,1)},n.prototype.dispatchEvent=function(e){if(e.type in this.listeners)for(var t=this.listeners[e.type],n=0,i=t.length;n<i;n++)t[n].call(this,e)},n}(r,navigator)}.call(t,n,t,e),void 0===i||(e.exports=i)}},t={};function n(i){var r=t[i];if(void 0!==r)return r.exports;var o=t[i]={exports:{}};return e[i].call(o.exports,o,o.exports,n),o.exports}n.n=e=>{var t=e&&e.__esModule?()=>e.default:()=>e;return n.d(t,{a:t}),t},n.d=(e,t)=>{for(var i in t)n.o(t,i)&&!n.o(e,i)&&Object.defineProperty(e,i,{enumerable:!0,get:t[i]})},n.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(e){if("object"==typeof window)return window}}(),n.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),(()=>{"use strict";var e=n(115),t=n.n(e);const i=class{constructor(e,t,n,i){this.buffer=new Uint8Array(e,t,n),this.frontOffset=i,this.buffer=new Uint8Array([...this.buffer.subarray(this.frontOffset),...this.buffer.subarray(0,this.frontOffset)])}get front(){return this.buffer[this.frontOffset]}};let r=0;const o=(e=!1)=>(e&&(r=0),r++),s={RPM:{id:o(),byteType:2},SPEEDO:{id:o(),byteType:2},PW1:{id:o(),byteType:3},ADV:{id:o(),byteType:3},DUTY_CYCLE:{id:o(),byteType:1},AFR:{id:o(),byteType:3},IGNITION_TIMING:{id:o(),byteType:3},MAP:{id:o(),byteType:2},MAT:{id:o(),byteType:2},TPS:{id:o(),byteType:2},EGO:{id:o(),byteType:2},CTS:{id:o(),byteType:2},STATUS1:{id:o(),byteType:2},STATUS2:{id:o(),byteType:2},STATUS3:{id:o(),byteType:2},STATUS4:{id:o(),byteType:2},STATUS5:{id:o(),byteType:2},STATUS6:{id:o(),byteType:2},STATUS7:{id:o(),byteType:2},STATUS8:{id:o(),byteType:2},CURRENT_ODOMETER:{id:o(),byteType:2},ODOMETER:{id:o(),byteType:2},TRIP_ODOMETER:{id:o(),byteType:2},GPS_SPEEED:{id:o(),byteType:2},WARNINGS:{id:o(),byteType:4},FUEL_LEVEL:{id:o(),byteType:1},CURRENT_MPG:{id:o(),byteType:3},AVERAGE_MPG:{id:o(),byteType:3},AVERAGE_MPG_POINTS:{id:o(),byteType:5},AVERAGE_MPG_POINT_INDEX:{id:o(),byteType:1},LOW_LIGHT_DETECTED:{id:o(),byteType:1},PRESSURE_TYPE:{id:o(),byteType:1},TEMP_TYPE:{id:o(),byteType:1},SOME_NEW_VALUE:{id:o(),byteType:8}};let a=0;Object.keys(s).forEach((e=>{const t=s[e];switch(t.byteOffset=a,t.byteType){case 1:case 4:case 6:a+=1;break;case 2:case 7:a+=2;break;case 3:case 8:a+=4;break;case 5:a+=100;break;default:throw new Error(`Unknown byteType: ${t.byteType}`)}})),Object.freeze(s);const c={BATT_VOLTAGE:o(!0),OIL_PRESSURE:o(),LOW_FUEL:o(),ENGINE_TEMPERATURE:o(),ECU_COMM:o(),GPS_NOT_ACQUIRED:o(),GPS_ERROR:o(),COMM_ERROR:o()};Object.freeze(c);const y=(()=>{let e=[],t=[];for(const[n,r]of Object.entries(s))switch(e[r.id]=0,r.byteType){case 1:t[r.id]=e=>e.getInt8(r.byteOffset);break;case 2:t[r.id]=e=>e.getInt16(r.byteOffset);break;case 6:case 4:t[r.id]=e=>e.getUint8(r.byteOffset);break;case 7:t[r.id]=e=>e.getUint16(r.byteOffset);break;case 8:t[r.id]=e=>e.getUint32(r.byteOffset);break;case 3:t[r.id]=e=>e.getFloat32(r.byteOffset);break;case 5:t[r.id]=e=>new i(e.buffer,r.byteOffset,100,e.getInt8(r.byteOffset+100));break;default:throw new Error(`Unknown type ${r.byteType}`)}return{get:t=>e[t.id],getWarning:t=>!!(e[s.WARNINGS.id]&128>>t%8),set:(t,n)=>{e[t.id]=n},setWarning:(t,n)=>{if(t>7)throw"I screwed up: error - bit field key cannot be > 7";e[s.WARNINGS.id]=n?e[s.WARNINGS.id]|128>>t%8:e[s.WARNINGS.id]&~(128>>t%8)},deserialize:n=>{for(const[i,r]of Object.entries(s))e[r.id]=t[r.id](n)},data:e}})();t().prototype.binaryType="arraybuffer";let f=null;onmessage=e=>{switch(e.data.msg){case"start":f=(()=>{y.setWarning(c.COMM_ERROR,!0);let e=new(t())("ws://raspberrypi:3333",null,{timeout:15e3,shouldReconnect:()=>1,ignoreConnectivityEvents:!1});return e.addEventListener("open",(function(e){y.setWarning(c.COMM_ERROR,!1)})),e.addEventListener("close",(e=>{y.setWarning(c.COMM_ERROR,!0)})),e.addEventListener("error",(e=>{y.setWarning(c.COMM_ERROR,!0)})),e.addEventListener("message",(e=>{(e=>{try{y.deserialize(e)}catch(e){console.error(e)}})(new DataView(e.data))})),e})();break;case"process_update_data":postMessage({msg:"update_data_ready",updateData:y.data})}}})()})();