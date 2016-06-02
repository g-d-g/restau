'use strict';

const Client = require('./Client')
const Constants = require('../Constants');
const InternalMiddleware = require('./Middleware');
const InternalModel = require('./Model');
const InternalService = require('./Service');
const Model = require('../Model');
const Service = require('../Service');
const bodyParser = require('body-parser');
const errors = require('../errors');
const express = require('express');
const http = require('http');
const https = require('https');
const utils = require('../utils');

const {
  d,
  APP_METHODS_DEPRECATED,
  APP_METHODS_INHERITED,
  APP_PROPS_INHERITED,
  DEFAULT_CONNECTOR_NAME,
  DEFAULT_HOST,
  DEFAULT_HTTPS_PORT,
  DEFAULT_OPTION_BODYPARSER,
  DEFAULT_OPTION_ERROR_HANDLER,
  MODEL_SEPARATOR,
  OPTION_BINDING_KEYS,
  OPTION_BODYPARSER_KEYS,
  OPTION_CONFIG_KEYS,
  OPTION_CONNECTION_KEYS,
  OPTION_HOST_KEYS,
  OPTION_MIDDLEWARE_KEYS,
  OPTION_PORT_KEYS,
  OPTION_SETTINGS,
  OPTION_SETTINGS_HIDDEN,
  OPTION_SETTINGS_KEYS,
  OPTION_SETTINGS_MERGED,
  OPTION_SSL_KEYS
} = Constants;

const {
  sep,
  caller,
  deprecateMethod,
  dirname,
  findKeyWhichContains,
  flatten,
  forEachKey,
  fromPairs,
  getValue,
  inheritMethod,
  inheritProperty,
  isArray,
  isFunction,
  isNumber,
  isObject,
  isString,
  isUndefined,
  normalizeSlashes,
  requireSafe,
  resolvePath,
  setValue,
  toArray
} = utils;

module.exports = class
 {
  static new(app, options) {
    return new this(app, options);
  }

  static isModelOrServiceSubclass(obj) {
    return Model.isSubclass(obj) || Service.isSubclass(obj);
  }

  static isModelOrServiceInstance(obj) {
    return Model.isInstance(obj) || Service.isInstance(obj);
  }

  static isModelOrService(obj) {
    return this.isModelOrServiceInstance(obj) || this.isModelOrServiceSubclass(obj);
  }

  static getConfigKeyOf(obj) {
    const key = ['config'];

    if (this.isModelOrServiceInstance(obj)) {
      obj = obj.constructor;
    }

    if (Model.isSubclass(obj)) {
      key.push('models');
    }

    if (Service.isSubclass(obj)) {
      key.push('services');
    }

    key.push(obj.id || obj.name);

    return key.join('.');
  }

  app = null;
  basedir = null;
  db = {
    bindings: {},
    connections: []
  };
  models = {};
  services = {};
  middlewares = [];

  constructor(app, options) {
    if (!options) {
      options = app || {};
      app = express();
    }

    this.app = app;
    this.basedir = options.basedir;

    Object.assign(app, { restau: this });

    d('INIT %s', this.basedir);

    app.on('mount', this.mount.bind(this, '/'));

    deprecateMethod(this, APP_METHODS_DEPRECATED);
    inheritProperty(this, app, APP_PROPS_INHERITED);
    inheritMethod(this, app, APP_METHODS_INHERITED);

    OPTION_SETTINGS_KEYS.forEach(x => !isUndefined(options[x]) && this.set(x, options[x]));
    forEachKey(OPTION_BINDING_KEYS, options, this.bindModel.bind(this));
    forEachKey(OPTION_CONNECTION_KEYS, options, this.addConnection.bind(this));
    forEachKey(OPTION_MIDDLEWARE_KEYS, options, this.use.bind(this));
  }

  get config() {
    return this.getConfig();
  }

  get internalModels() {
    return this.middlewares.filter(x => x.constructor.isModel);
  }

  get internalServices() {
    return this.middlewares.filter(x => x.constructor.isService);
  }

  get metas() {
    const {basedir, db, middlewares, models, services} = this;

    return {basedir, db, middlewares, models, services};
  }

  get settings() {
    return this.app.settings;
  }

  addConnection(name, db) {
    const app = this.app;

    if (arguments.length === 1) {
      db = name;
      name = undefined;
    }

    if (isObject(db) && !(db.client && db.connection)) {
      Object.keys(db).forEach(key => app.addConnection(key, db[key]));
      return app;
    }

    name = name || DEFAULT_CONNECTOR_NAME;
    const env = this.get('env') || DEFAULT_ENV_NAME;

    if (db === true) {
      db = ['.', [env, 'sqlite3'].join('.')].join(sep);
    }

    if (isString(db)) {
      db = {
        client: 'sqlite3',
        connection: {
          filename: db
        }
      };
    }

    if (isObject(db)) {
      d('CONNECTION "%s" added', name);

      this.db.connections[name] = this.resolvePath(db);
    }

    return app;
  }

  addMiddleware(mountpath, fn) {
    if (!fn) {
      fn = mountpath;
      mountpath = '/';
    }

    let internalClass = InternalMiddleware;
    let internalInstance;
    let store;
    let id;

    if (Model.isSubclass(fn)) {
      internalClass = InternalModel;
      // TODO
      // store = this.models;
    }

    if (Service.isSubclass(fn)) {
      internalClass = InternalService;
      store = this.services;
    }

    internalInstance = internalClass.new(mountpath, fn);
    id = internalInstance.id;

    d('%s added %s %s', internalClass.kind.toUpperCase(), mountpath, id);

    if (store) {
      store[id] = internalInstance.concreteInstance;
    }

    this.middlewares.push(internalInstance);
  }

  bindModel(connectionName, modelBound) {
    const app = this.app;

    if (!connectionName) {
      return app;
    }

    if (isObject(connectionName)) {
      Object.keys(connectionName).forEach(value => app.bindModel(value, connectionName[value]));
      return app;
    }

    if (isArray(modelBound)) {
      modelBound.forEach(model => app.bindModel(connectionName, model));
      return app;
    }

    if (Model.isSubclass(modelBound)) {
      modelBound = modelBound.id;
    }

    if (isFunction(modelBound)) {
      modelBound = modelBound.name;
    }

    if (modelBound.indexOf(MODEL_SEPARATOR) > -1) {
      modelBound.split(MODEL_SEPARATOR).map(x => x.trim()).forEach(model => app.bindModel(connectionName, model));
      return app;
    }

    d('MODEL "%s" bound with connection "%s"', modelBound, connectionName);

    this.db.bindings[modelBound] = connectionName;

    return app;
  }

  client(options) {
    return new Client(parseClientOptions(this, options), this).api;
  }

  get() {
    const args = toArray(arguments);
    let [key] = args;

    if (this.constructor.isModelOrService(key)) {
      key = this.constructor.getConfigKeyOf(key);
    }

    let dotPos = isString(key) ? key.indexOf('.') : -1;

    if (args.length === 1 && OPTION_SETTINGS_KEYS.indexOf(key) > -1) {
      const settingProp = findKeyWhichContains(OPTION_SETTINGS, key);
      const settingKeys = OPTION_SETTINGS[settingProp];

      let initialValue = undefined;
      let reducer = (x, y) => !isUndefined(x) ? x : this.app.set.origin(y);

      if (OPTION_SETTINGS_MERGED.indexOf(settingProp) > -1) {
        reducer = (x, y) => Object.assign(x, this.app.set.origin(y));
        initialValue = {};
      }

      return settingKeys.reduce(reducer, initialValue);
    }

    if (args.length === 1 && dotPos > -1) {
      let store = this.app.settings;
      let basekey = key.substring(0, dotPos);

      if (OPTION_SETTINGS_KEYS.indexOf(basekey) > -1) {
        key = key.substring(dotPos + 1)
        store = this.get(basekey);
      }

      return getValue(store, key);
    }

    return this.app.set.origin.apply(this.app, args);
  }

  getConfig(key) {
    if (!key) {
      return this.get('config');
    }

    return this.setConfig(key);
  }

  listen(port, host) {
    host = host || this.get('host') || DEFAULT_HOST;
    port = port || this.get('port');

    if (!port) {
      throw new Error('PORT_MISSING');
    }

    const app = express()
    const ssl = this.get('ssl');

    injectIntegratedMiddlewares(this, app);
    app.use(this.app);
    setupServices(app);

    return createServer(app, port, host, ssl)
      .listen(port, host)
      .on('listening',
        () => d('LISTEN http%s://%s:%s', ssl ? 's' : '', host, port));
  }

  mount(mountpath, parent) {
    if (!parent) {
      console.log('DIE MOTHER FUCKER!');
      process.exit();
      // parent = mountpath;
      // mountpath = undefined;
    }

    // mountpath = normalizeSlashes(mountpath || this.app.mountpath);
    mountpath = normalizeSlashes([this.app.mountpath, /*parent.mountpath, */mountpath]);
    const {app, middlewares, services} = this;

    this.prepareMount(parent);
    inheritSettings(app, parent);

    // internalServices.forEach(x => x.mountpath = normalizeSlashes([mountpath, x.mountpath], true));

    Object.assign(parent.services, services);

    // if (options.config) {
    //   parent.config = parent.config || {};
    //   deepAssign(parent.config, options.config);
    // }
    //
    // parent.bindings = Object.assign({}, app.bindings, parent.bindings);
    // parent.connections = Object.assign({}, app.connections, parent.connections);

    // TODO
    // doit on copier les settings ? (config + port + host + ssl)
    //    db (= bindings + connections)

    // mount middlewares -->
    let router;

    middlewares.forEach(x => {
      d('%s %s mounted on %s', x.constructor.kind.toUpperCase(), x.id, x.mountpath);

      const mw = x.mount(this, parent);

      if (isFunction(mw)) {
        injectMiddleware(parent, normalizeSlashes([mountpath, x.mountpath]), mw);
      }
    });

    // update services mountpath
    Object.keys(services)
      .map(x => parent.services[x].constructor)
      .forEach(x => x.mountpath = normalizeSlashes([mountpath, x.mountpath], true));
  }


  prepareMount(parent) {
    const app = this.app;

    if (!parent.restau) {
      getRouterStack(parent).pop();

      this.constructor.new(parent, {
        basedir: parent.basedir || app.basedir
      });
    }
  }

  remote(options) {
    options = parseClientOptions(this, options);

    let {baseUrl, headers} = options;

    if (!baseUrl) {
      throw new Error('BASEURL_MISSING');
    }

    const remoted = express();

    return remoted.on('mount', parent => {
      const client = this.client(options);
      const router = this.constructor.new();

      this.prepareMount(parent);

      Object.keys(this.services).forEach(id => {
        const service = this.services[id].constructor;
        const {internal} = service;
        const mountpath = normalizeSlashes([service.mountpath, internal.mountpath]);
        const mw = internal.mountRemote(this, router, client[id]);

        router.use(mountpath, mw);
      });

      router.mount(remoted.mountpath, parent);
    });
  }

  resolvePath(value) {
    return resolvePath(this.basedir, value);
  }

  set() {
    const args = toArray(arguments);
    let [key, value] = args;

    if (args.length === 1) {
      return this.get(key);
    }

    if (this.constructor.isModelOrService(key)) {
      key = this.constructor.getConfigKeyOf(key);
    }

    let dotPos = isString(key) ? key.indexOf('.') : -1;

    if (args.length > 1) {
      d('SET %s %s', key, OPTION_SETTINGS_HIDDEN.indexOf(key) > -1 ? '****' : JSON.stringify(value));

      if (OPTION_SETTINGS_MERGED.indexOf(key) > -1) {
        args[1] = Object.assign({}, this.get(key), value);
      }

      if (dotPos > -1) {
        setValue(this.app.settings, key, args[1]);

        return this.app;
      }
    }

    return this.app.set.origin.apply(this.app, args);
  }

  setConfig() {
    const args = toArray(arguments);

    if (isString(args[0])) {
      args[0] = ['config', args[0]].join('.');
    }

    return this.set.apply(this, args);
  }

  use() {
    const app = this.app;
    let args = flatten(toArray(arguments));
    let [path, fn] = args;

    if (!args.length) {
      return app;
    }

    if (args.length === 1 && isString(args[0])) {
      return app.use('/', args[0]);
    }

    if (!isString(path) || requireSafe(this.resolvePath(path))) {
      return app.use.apply(this, ['/'].concat(args))
    }

    if (args.length > 2) {
      args.slice(1).forEach(mw => app.use(path, mw));
      return app;
    }

    if (isString(fn)) {
      fn = requireSafe(this.resolvePath(fn));
    }

    if (isObject(fn)) {
      Object.keys(fn).forEach(key => app.use(path, fn[key]));
      return app;
    }

    if (!isFunction(fn)) {
      throw new TypeError('app.use() requires middleware functions');
    }

    let mountpath = normalizeSlashes(path, true, false);

    if (fn.restau instanceof this.constructor) {
      fn.restau.mount(mountpath, app);
    } else {
      this.addMiddleware(mountpath, fn);
    }

    return app;
  }
};

function createServer(app, port, host, ssl) {
  let factory;

  if (ssl) {
    factory = app => {
      if (ssl.forwarder) {
        d('FORWARDER LISTEN %s > %s', ssl.forwarder, port);

        http
          .createServer(express().get('*', function (req, res, next) {
            var base = req.headers && req.headers.host && req.headers.host.indexOf(':') === -1 ? req.headers.host : req.headers.host.split(':').shift();
            var url = ['https://', base, port == DEFAULT_HTTPS_PORT ? '' : ':'+port, req.path].join('');

            res.redirect(url);
          }))
          .listen(ssl.forwarder, host);
      }

      return https.createServer(ssl, app);
    };
  }

  if (!factory) {
    factory = app => http.createServer(app);
  }

  return factory(app);
}

function getRouterStack(app) {
  return getValue(app, '_router.stack');
}

function hasMiddleware(app, mw) {
  const routerStack = getRouterStack(app);

  return isFunction(mw) && isArray(routerStack) && !!routerStack.find(x => x.handle === mw);
}

function inheritSettings(app, parent) {
  const settings = Object.keys(OPTION_SETTINGS)
    .map(key =>[key, app.get(key), parent.get(key)])
    .map(([key, appValue, parentValue]) => {
      if (OPTION_SETTINGS_MERGED.indexOf(key) > -1) {
        return [key, Object.assign({}, appValue, parentValue)];
      }

      if (!isUndefined(appValue) && !parentValue) {
        return [key, appValue];
      }

      return [key];
    })
    .filter(([key, value]) => !isUndefined(value));

  d('INHERITS SETTINGS %s', JSON.stringify(settings.map(([key, value]) => key)));

  settings.forEach(([key, value]) => parent.set.origin(key, value));
}

function injectIntegratedMiddlewares(app, parent) {
  let bodyparser = app.get('bodyparser');

  if (isUndefined(bodyparser) || bodyparser === true) {
    bodyparser = DEFAULT_OPTION_BODYPARSER;
  }

  if (bodyparser) {
    d('INTEGRATED MW body-parser %s', JSON.stringify(bodyparser));

    Object.keys(bodyparser).forEach(x => parent.use(bodyParser[x](bodyparser[x])));
  }

  let errorHandler = app.get('errorHandler');

  if (isUndefined(errorHandler)) {
    errorHandler = DEFAULT_OPTION_ERROR_HANDLER;
  }

  if (errorHandler === true) {
    errorHandler = errors.handler;
  }

  if (isFunction(errorHandler) && !hasMiddleware(parent, errors.handler)) {
    d('INTEGRATED MW error-handler');

    parent.use(errorHandler);
  }
}

function injectMiddleware(app, mountpath, mw) {
  app.restau.addMiddleware(mountpath, mw);
  app.use.origin(mountpath, mw);

  return app;
}

function parseClientOptions(app, options) {
  options = options || {};

  if (isNumber(options)) { options = { port: options }; }
  if (isString(options)) { options = { baseUrl: options }; }

  options.headers = options.headers || {};
  options.host = options.host || app.get('host') || DEFAULT_HOST;
  options.port = options.port || app.get('port');
  options.ssl = options.ssl || !!app.get('ssl') || options.port == DEFAULT_HTTPS_PORT;

  if (!options.baseUrl && options.port) {
    options.baseUrl = [];
    options.baseUrl.push(options.ssl ? 'https' : 'http');
    options.baseUrl.push('://', options.host, ':', options.port);
    options.baseUrl = options.baseUrl.join('');
  }

  return options;
}

function setupServices(app) {
  Object.keys(app.services)
    .map(x => app.services[x])
    .forEach(x => {
      const clazz = x.constructor
      const {id, internal, routes} = clazz;
      const mountpath = normalizeSlashes([clazz.mountpath, internal.mountpath, internal.basepath]);
      const config = app.getConfig(x) || {};

      d('SETUP service %s', id);
      d('  mountpath: %s', mountpath);
      d('  config: %s', JSON.stringify(config));
      d('  endpoints:');
      internal.endpoints.forEach(x => {
        d('    %s', x.id);
        internal.routes[x.id].forEach(([method, path]) => d('      %s %s', method, path));
      });

      x.setup(app, config);
    });
}
