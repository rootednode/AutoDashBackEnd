import express from 'express';
import http from 'http';
import {
  COLOR_SCHEMES,
  COLOR_SCHEME_GAUGE_COLORS,
  DASHBOARD_FONTS,
  SCREEN_SAVERS
} from './controllerState.js';

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

class DashContentWebServer {
  constructor (frontEndUrl, entryPointName, controllerState, controllerActions = {}) {
    this.started = false;
    this.entryPointName = entryPointName;
    this.frontEndUrl = frontEndUrl;
    this.webserver = express();
    this.webserver.use(express.json({ limit: '2kb' }));

    const authorizeController = (req, res, next) => {
      const configuredKey = process.env.CONTROLLER_API_KEY;
      if (!configuredKey || req.get('x-controller-key') === configuredKey) {
        next();
        return;
      }
      res.status(401).json({ ok: false, error: 'Unauthorized controller' });
    };
    const authorizeReboot = (req, res, next) => {
      const configuredKey = process.env.CONTROLLER_API_KEY;
      if (!configuredKey) {
        res.status(503).json({
          ok: false,
          error: 'Reboot requires CONTROLLER_API_KEY to be configured'
        });
        return;
      }
      authorizeController(req, res, next);
    };

    this.webserver.get('/api/controller/state', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, ...controllerState.snapshot() });
    });
    this.webserver.get('/api/controller/health', (req, res) => {
      const health = typeof controllerActions.health === 'function'
        ? controllerActions.health()
        : {};
      res.json({ ok: true, ...health });
    });
    this.webserver.get('/api/controller/values', (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (typeof controllerActions.values !== 'function') {
        res.status(503).json({
          ok: false,
          error: 'Dashboard values unavailable'
        });
        return;
      }
      res.json({ ok: true, ...controllerActions.values() });
    });
    this.webserver.get('/api/controller/gauge-color-themes', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        themes: COLOR_SCHEME_GAUGE_COLORS
      });
    });
    this.webserver.get('/api/controller/appearance-options', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        colorSchemes: COLOR_SCHEMES,
        colorSchemeGaugeColors: COLOR_SCHEME_GAUGE_COLORS,
        fonts: DASHBOARD_FONTS,
        screenSavers: SCREEN_SAVERS,
        gaugeColorThemes: COLOR_SCHEME_GAUGE_COLORS,
        dashboardPages: typeof controllerActions.dashboardPages === 'function'
          ? controllerActions.dashboardPages()
          : []
      });
    });
    this.webserver.get('/api/controller/dashboard-pages', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        pages: typeof controllerActions.dashboardPages === 'function'
          ? controllerActions.dashboardPages()
          : []
      });
    });
    this.webserver.get('/api/controller/screensavers', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        selected: controllerState.snapshot().screenSaver,
        options: SCREEN_SAVERS
      });
    });
    this.webserver.post('/api/controller/display-mode', authorizeController, (req, res) => {
      try {
        const mode = req.body?.mode || 'toggle';
        res.json({ ok: true, ...controllerState.setDisplayMode(mode) });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/display-invert', authorizeController, (req, res) => {
      try {
        const inverted = req.body?.inverted ?? req.body?.value ?? 'toggle';
        res.json({
          ok: true,
          ...controllerState.setDisplayInverted(inverted)
        });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/screensaver', authorizeController, (req, res) => {
      try {
        const screenSaver = req.body?.screenSaver ??
          req.body?.screensaver ??
          req.body?.value ??
          'next';
        res.json({
          ok: true,
          ...controllerState.setScreenSaver(screenSaver)
        });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/gauge-peaks/clear', authorizeController, (req, res) => {
      res.json({
        ok: true,
        ...controllerState.clearGaugePeaks()
      });
    });
    this.webserver.post('/api/controller/color-scheme', authorizeController, (req, res) => {
      try {
        const scheme = req.body?.scheme || 'next';
        res.json({
          ok: true,
          ...controllerState.setColorScheme(scheme, req.body?.mode)
        });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/gauge-colors', authorizeController, (req, res) => {
      try {
        res.json({
          ok: true,
          ...controllerState.setGaugeColors(
            req.body?.colors,
            req.body?.theme
          )
        });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/font', authorizeController, (req, res) => {
      try {
        res.json({
          ok: true,
          ...controllerState.setDashboardFont(req.body?.font)
        });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/brightness', authorizeController, (req, res) => {
      try {
        res.json({
          ok: true,
          ...controllerState.setBrightness(req.body)
        });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/dashboard-page', authorizeController, (req, res) => {
      try {
        const page = req.body?.page || 'next';
        res.json({ ok: true, ...controllerState.setDashboardPage(page) });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/trip/reset', authorizeController, (req, res) => {
      if (typeof controllerActions.resetTrip !== 'function') {
        res.status(503).json({ ok: false, error: 'Trip reset unavailable' });
        return;
      }
      res.json({ ok: true, ...controllerActions.resetTrip() });
    });
    this.webserver.post('/api/controller/trip-mpg/reset', authorizeController, (req, res) => {
      if (typeof controllerActions.resetTripMpg !== 'function') {
        res.status(503).json({ ok: false, error: 'Trip MPG reset unavailable' });
        return;
      }
      res.json({ ok: true, ...controllerActions.resetTripMpg() });
    });
    this.webserver.post('/api/controller/oil-change/reset', authorizeController, (req, res) => {
      res.json({
        ok: true,
        ...controllerState.resetOilChangeMileage()
      });
    });
    this.webserver.post('/api/controller/maintenance/:item/reset', authorizeController, (req, res) => {
      try {
        res.json({
          ok: true,
          ...controllerState.resetServiceMileage(req.params.item)
        });
      } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
      }
    });
    this.webserver.post('/api/controller/system/reboot', authorizeReboot, (req, res) => {
      if (req.body?.confirm !== 'REBOOT') {
        res.status(400).json({
          ok: false,
          error: 'Reboot requires {"confirm":"REBOOT"}'
        });
        return;
      }
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.TYPE === 'development' ||
        process.env.STARTUP_MODE === 'replay_logs'
      ) {
        res.status(409).json({
          ok: false,
          error: 'Reboot is disabled in development and replay modes'
        });
        return;
      }
      if (typeof controllerActions.reboot !== 'function') {
        res.status(503).json({ ok: false, error: 'Reboot unavailable' });
        return;
      }
      res.json({ ok: true, ...controllerActions.reboot() });
    });

    this.webserver.use(express.static("/home/pi/AutoDashBackEnd/dist")); //  "public" off of current is root
    this.webserver.get('*', function(req, res) {
      res.sendFile('/home/pi/AutoDashBackEnd/dist/index.html'); // load the single view file (angular will handle the page changes on the front-end)
    });
  }

  start() {
    let port = normalizePort(process.env.PORT || '3000');
    this.webserver.set('port', port);
    this.server = http.createServer(this.webserver);
    this.server.listen(port);
    this.server.on('listening', () => {
      let addr = this.server.address();
      let bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
        console.log('AutoDash: Webserver is listening on ' + bind);
        console.log('AutoDash: !! ----------- WEB-SERVER Ready ----------- !!');
    });
  }

  // stop and cleanup
  stop() {
    if (!this.server) return;
    this.server.removeAllListeners();
    this.server.close();
    this.server = null;
    console.log("Webserver closed")
  }
}

export default DashContentWebServer;
