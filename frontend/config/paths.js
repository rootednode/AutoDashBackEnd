const path = require('path')

module.exports = {
  // Source files
  src: path.resolve(__dirname, '../src'),

  // Production build files
  // Match the directory served by src/webserver.js.
  build: path.resolve(__dirname, '../../dist'),
}
