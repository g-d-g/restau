'use strict';

const configurator = require('./config');
const {isFunction, isObject, isString} = require('core-util-is');
const knex = require('knex');
const mapObject = require('map-obj');
const meddleware = require('meddleware');

const {CONNECTORS_KEY, MIDDLEWARES_KEY, SERVICES_KEY} = configurator;
const VIEW_CONFIG_KEYS = ['views', 'view engine', 'view cache'];

module.exports = bootstrap;

function bootstrap(options) {
  options = options || {};
  // options.onconfig = options.onconfig || noop; // OUI
  options.mountpath = options.mountpath || null; // OUI
  options.inheritViews = !!options.inheritViews;
  // options.uncaughtException

  const {basedir, configFolder} = options;
  const config = configurator(basedir, configFolder);

  // TODO utiliser endgame
  // endgame(options.uncaughtException);

  function setObject(app, obj) {
    Object.keys(obj).forEach(key => {
      const value = obj[key];

      if (key === 'express') {
        setObject(app, value);
        return;
      }

      app.set(key, value);
    });

    return app;
  }

  function mount(app) {
    var settings, defaults, handler;

    // Get configured settings and express defaults.
    settings = config.express;
    defaults = Object.keys(app.settings);

    if (options.inheritViews) {
      // If the mounted app SHOULD inherit views, delete from local
      // kraken settings so the app settings aren't updated later.
      handler = function (name) {
        console.log('inheriting express config setting', '\'' + name + '\'', 'from parent');
        delete settings[name];
      };

    } else {
      // If the views SHOULD NOT be inherited, remove from list
      // of default settings such that they are NOT deleted below.
      handler = function (name) {
        var idx = defaults.indexOf(name);
        if (idx >= 0) {
          defaults.splice(idx, 1);
        }
      };
    }

    // Update our configuration (provided settings or app defaults)
    VIEW_CONFIG_KEYS.forEach(handler);

    // Now delete the default app settings so they may be inherited
    // from the parent app. Any remaining kraken config will be set
    // during setting initialization.
    defaults.forEach(function (name) {
      delete app.settings[name];
    });
  }

  function initSettings(app) {
    // If this application is mounted on a parent app we need to make sure
    // the two work together cleanly and appropriate settings are inherited.
    if (isFunction(app.parent)) {
      // If it has already been mounted do all the work to update settings.
      mount(app);
    } else {
      // ...if it hasn't been mounted, register a handler for the `mount`
      // event to apply them as necessary.
      app.once('mount', function () {
        mount(this);
      });
    }

    var settings = config.express;

    // Allow configuration of custom View impl. This really can be
    // accomplished using shortstop, but maintain for compatibility.
    if (isString(settings.view)) {
      settings.view = require(settings.view);
    }

    // Override default settings, leaving the settings object
    // intact to maintain express' setting inheritance.
    Object.keys(settings).forEach(function (name) {
      app.set(name, settings[name]);
    });

    if (options.inheritViews) {
      // Update kraken config to reflect express settings
      // for view options. Previously, the view settings
      // were removed from config so only the appropriate
      // settings were copied into express. At this point
      // the app has been mounted and configures, so parent
      // values are available to update kraken config as
      // appropriate.
      VIEW_CONFIG_KEYS.forEach(function (name) {
        config.express[name] = app.get(name);
      });
    }
    // If options.mountpath was set, override config settings.
    config.express.mountpath = ((typeof options.mountpath === 'string') && options.mountpath !== '/') ? options.mountpath : app.get('mountpath');

    setObject(app, config);

    console.log('express settings\n', app.settings);

    return app;
  }

  function initViews(app) {
    var engines = app.get('view engines') || {};

    console.log('initializing views');

    Object.keys(engines).forEach(function (ext) {
      var spec, module, args, engine;

      spec = engines[ext];
      module = require(spec.module);

      if (isObject(spec.renderer) && isFunction(module[spec.renderer.method])) {
        args = Array.isArray(spec.renderer['arguments']) ? spec.renderer['arguments'].slice() : [];
        engine = module[spec.renderer.method].apply(null, args);

      } else if (isString(spec.renderer) && isFunction(module[spec.renderer])) {
        engine = module[spec.renderer];

      } else if (isFunction(module[spec.name])) {
        engine = module[spec.name];

      } else if (isFunction(module[ext])) {
        engine = module[ext];

      } else {
        engine = module;
      }

      app.engine(ext, engine);
    });

    return app;
  }

  function initMiddlewares(app) {
    console.log('INI MWS', app.get('mountpath'))
    const mws = app.get(MIDDLEWARES_KEY);

    app.use(app.get('mountpath'), meddleware(mws));

    return app;
  }

  function initEvents(app) {
    var timer;

    app.on('shutdown', function onshutdown(server, timeout) {
      var stop, ok, err;

      stop = function (code) {
          app.emit('stop');
          process.exit(code);
      };

      ok = stop.bind(null, 0);
      err = stop.bind(null, 1);

      server.close(ok);
      clearTimeout(timer);
      timer = setTimeout(err, timeout);
    });

    return app;
  }

  return function () {
    const app = this;
    var initializing = true;
    var error;

    app.once('mount', function (parent) {
      // Remove sacrificial express app
      parent._router.stack.pop();

      // Since this particular `app` instance is
      // subsequently deleted, the `mountpath` is
      // moved to `options` for use later.
      options.mountpath = options.mountpath || app.mountpath;

      const emitStart = () => {
        initializing = false;
        parent.emit('start');
      };

      const emitError = (err) => {
        error = err;
        parent.emit('error', err);
      };

      // Kick off server and add middleware which will block until
      // server is ready. This way we don't have to block standard
      // `listen` behavior, but failures will occur immediately.
      const promise = Promise.resolve(parent)
        .then(initSettings)
        .then(initViews)
        .then(initMiddlewares)
        .then(initEvents)
        .then(emitStart)
        .catch(emitError);

      parent.use(function startup(req, res, next) {
        if (initializing) {
          var headers = options.startupHeaders;
          res.status(503);
          if (headers) {
              res.header(headers);
          }
          res.send('Server is starting.');
          return;
        }

        if (error) {
          res.status(503);
          res.send('The application failed to start.');
          console.error(error.stack ? error.stack : error);
          return;
        }

        next();
      });
    });
  };
};
