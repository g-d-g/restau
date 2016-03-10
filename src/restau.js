'use strict';

const bodyParser = require('body-parser');
const errors = require('./errors');
const express = require('express');
const http = require('http');
const {isModelSubclass} = require('./Model');
const {isServiceSubclass} = require('./Service');
const jsonWebToken = require('jsonwebtoken');
const knex = require('knex');
const request = require('request');
const {
  caller,
  compose,
  debug,
  defineAccessor,
  dirname,
  flatten,
  forEachKey,
  isArray,
  isFunction,
  isObject,
  isString,
  join,
  mapObject,
  mixin,
  normalizeSlashes,
  omit,
  requireSafe,
  resolveUrlParams,
  sep,
  toArray,
  toPairs
} = require('./utils');

const application = { bindModel, client, connector, listen, remote, resolvePath, use };
const d = debug('express:restau');

const CALL_DEPTH = 1; // why 1? restau is the public API
const DEFAULT_CONNECTOR_NAME = 'default';
const DEFAULT_ENV_NAME = 'development';
const OPTION_BINDING_KEYS = ['binding', 'bindModel', 'bindModels', 'links'];
const OPTION_CONNECTOR_KEYS = ['connector', 'connectors', 'db'];
const OPTION_MIDDLEWARE_KEYS = ['mws_head', 'middleware', 'middlewares', 'mw', 'mws', 'model', 'models', 'service', 'services', 'mws_tail'];

module.exports = restau;

function restau(options) {
  if (isString(options)) {
    options = {
      basedir: options
    };
  }

  options = options || {};
  options.basedir = options.basedir || dirname(caller(CALL_DEPTH));
  options.mountpath = options.mountpath || null;

  const app = express();
  const {basedir, mountpath} = options;

  d('init under ' + basedir);

  mixin(application, app);

  app.restau = {
    basedir,
    binding: {},
    connections: {},
    mws: []
  };

  defineAccessor(app.restau, 'models', () => {
    return app.restau.mws.filter(mw => isModelSubclass(mw.fn))
  });

  defineAccessor(app.restau, 'services', () => {
    return app.restau.mws.filter(mw => isServiceSubclass(mw.fn))
  });

  defineAccessor(app.restau, 'registry', () => {
    return app.restau.services
      .map(value => value.fn.registry)
      .reduce((registry, routes) => registry.concat(routes));
  });

  forEachKey(OPTION_CONNECTOR_KEYS, options, app.connector.bind(app));
  forEachKey(OPTION_BINDING_KEYS, options, app.bindModel.bind(app));
  forEachKey(OPTION_MIDDLEWARE_KEYS, options, app.use.bind(app));

  app.on('mount', function (parent) {
    prepareMount.call(app, options);

    Object.assign(parent.restau.binding || {}, app.restau.binding);
    Object.assign(parent.restau.connections || {}, app.restau.connections);

    app.restau.mws.forEach(mw => {
      const {path, fn} = mw;
      let mountFn = mountMiddleware;

      if (isModelSubclass(fn)) {
        mountFn = mountModel;
      }

      if (isServiceSubclass(fn)) {
        mountFn = mountService;
      }

      mountFn.call(app, path, fn);
    });

    toPairs(parent.restau.services)
      .map(pair => pair[1]._instance)
      .filter(service => service && isFunction(service.setup))
      .forEach(service => service.setup(parent));
  });

  return app;
}

function bindModel(connectorName, modelLinked) {
  if (!connectorName) {
    return this;
  }

  if (isObject(connectorName)) {
    Object.keys(connectorName).forEach(connector => this.bindModel(connector, connectorName[connector]));
    return this;
  }

  if (isArray(modelLinked)) {
    modelLinked.forEach(model => this.bindModel(connectorName, model));
    return this;
  }

  if (isFunction(modelLinked)) {
    modelLinked = modelLinked.name;
  }

  this.restau.binding[modelLinked] = connectorName;

  return this;
}

function client(options) {
  const app = this;
  const api = {};

  if (isString(options)) {
    options = {
      baseurl: options
    };
  }

  options = options || {};
  options.baseurl = options.baseurl || null;
  options.headers = options.headers || {};

  if (!isString(options.baseurl)) {
    throw new Error('BASEURL_MISSING');
  }

  const baseUrl = normalizeSlashes(options.baseurl, false, false);
  const makeRequest = request.defaults({ baseUrl, headers: options.headers });
  const registry = app.restau.registry;

  registry.forEach(route => {
    const {name, service, path, method, endpoint} = route;

    if (!api[name]) {
      api[name] = {};
    }

    const handler = function () {
      const args = toArray(arguments);
      const paramsCount = path.split(':').length - 1;
      const reqArgs = args.slice(paramsCount);
      const uri = paramsCount ? resolveUrlParams(path, args.slice(0, paramsCount)) : path;
      const json = ['patch', 'post', 'put'].indexOf(method) > -1

      let [headers, body, callback] = reqArgs;

      if (isFunction(headers)) {
        callback = headers;
        headers = body;
      }

      headers = isObject(headers) ? headers : {};
      body = json ? body : undefined;

      return makeRequest({ uri, method, headers, body, json }, callback);
    };

    if (!api[name][endpoint]) {
      api[name][endpoint] = handler;
    }

    api[name][endpoint][method] = handler;
  });

  return api;
}

function connector(name, db) {
  if (arguments.length === 1) {
    db = name;
    name = undefined;
  }

  if (isObject(db) && !(db.client && db.connection)) {
    Object.keys(db).forEach(key => this.connector(key, db[key]));
    return this;
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
    this.restau.connections[name] = this.resolvePath(db);
  }

  return this;
}

function createJwtHelper(fn, options) {
  return (payload, opts, callback) => {
    if (isFunction(opts)) {
      callback = opts;
      opts = undefined;
    }

    opts = opts || {};
    opts = Object.assign({}, options, opts);

    return fn(payload, options.secret, opts, callback);
  };
}

function listen(port, host) {
  host = host || this.get('host');
  port = port || this.get('port');

  if (!port) {
    throw new Error('PORT_MISSING');
  }

  const app = express()
    .use(bodyParser.urlencoded({ extended: true }))
    .use(bodyParser.json())
    .use(this);

  return http.createServer(app).listen(port, host);
}

function mountMiddleware(path, fn) {
  path = normalizeSlashes([this.mountpath, path].join('/'), true, false);

  d('inject middleware %s', path, fn.name);

  this.parent.use(path, fn);
}

function mountModel(path, model) {
  const parent = this.parent;
  const {binding, connections, connectors} = parent.restau;
  const modelName = model.name;
  const connectorName = binding[modelName] || DEFAULT_CONNECTOR_NAME;

  if (!connectors[connectorName] && !connections[connectorName]) {
    throw new Error('Connector "' + connectorName + '" does not exist');
  }

  if (!connectors[connectorName]) {
    connectors[connectorName] = knex(connections[connectorName]);

    d('create connector "%s"', connectorName)
  }

  const modelBound = model.bindKnex(connectors[connectorName]);

  d('bind %s model with connector "%s"', model.name, connectorName);

  parent.restau.models[model.name] = modelBound;

  d('inject model %s', model.name);

  return modelBound;
}

function mountService(path, service) {
  const parent = this.parent;
  const {registry} = service;
  const router = express();

  let flows = {};
  let handlers = {};
  let promiseHandlers = {};
  let serviceName = service.name;
  let serviceInstance = new service(parent);

  if (!parent.restau.services[serviceName]) {
    d('init service %s', serviceName);

    parent.restau.services[serviceName] = {
      _class: service,
      _flows: {},
      _handlers: {},
      _promiseHandlers: {},
      _instance: serviceInstance
    };
  } else {
    d('service %s already exists', serviceName);

    flows = parent.restau.services[serviceName]._flows;
    handlers = parent.restau.services[serviceName]._handlers;
    promiseHandlers = parent.restau.services[serviceName]._promiseHandlers;
    serviceInstance = parent.restau.services[serviceName]._instance;
  }

  registry.forEach(entry => {
    const {path, method, endpoint, hooks, auth} = entry;
    let flow;

    d('add route %s.%s -> %s %s', serviceName, endpoint, method, path);

    if (!flows[endpoint]) {
      flows[endpoint] = serviceInstance.handler(entry);
    }

    flow = flows[endpoint];

    if (!handlers[endpoint]) {
      d('create handler for endpoint %s.%s', service.name, endpoint);

      const handler = compose([flow, function (req, res, next) {
        const result = res.result;

        // TODO custom response wrapper
        // if (isFunction(options.responseWrapper)) {
        //   result = options.responseWrapper(result, req, res);
        // }

        if (res.finished) {
          console.error('WARN %s.%s: response already sent', serviceName, endpoint)
        } else {
          res.send(result);
        }

        return result;
      }]);


      handlers[endpoint] =
      parent.restau.services[serviceName]._handlers[endpoint] = handler;

      d('create handler %s', endpoint);
    }

    if (!promiseHandlers[endpoint] || !promiseHandlers[endpoint][method]) {
      const promiseHandler = function (req, res, next) {
        return new Promise(function (resolve, reject) {
          flow(req, res, err => {
            if (err) {
              return reject(err);
            }

            resolve(res.result);
          });
        });
      };

      if (!parent.restau.services[serviceName][endpoint]) {
        parent.restau.services[serviceName][endpoint] = promiseHandler;;
      }

      parent.restau.services[serviceName][endpoint][method] = promiseHandler

      d('create promise handler %s %s', method, endpoint);
    }

    router[method](path, handlers[endpoint]);
  });

  mountMiddleware.call(this, path, router);
}

function normalizeJwtOptions(options) {
  options = options || null;

  if (isString(options)) {
    options = {
      secret: options
    };
  }

  if (isObject(options)) {
    const secret = options.secret;

    if (!secret) {
      throw new Error('MISSING_JWT_SECRET');
    }

    options = omit(options, 'secret');
    options = Object.assign({}, { secret, options });
  }

  return options;
}

function prepareMount(options, remoteMode) {
  const app = this;
  const parent = app.parent;

  parent._router.stack.pop();

  if (options.mountpath && app.mountpath === '/') {
    app.mountpath = options.mountpath;
  }

  if (!parent.restau) {
    parent.restau = {
      binding: {},
      connections: {},
      connectors: {},
      models: {},
      services: {}
    };
  }

  const jwtOptions = normalizeJwtOptions(options.jwt);

  if (jwtOptions) {
    parent.restau.populateToken = populateToken;
    parent.restau.signToken = createJwtHelper(jsonWebToken.sign, jwtOptions);
    parent.restau.verifyToken = createJwtHelper(jsonWebToken.verify, jwtOptions);
  }

  if (options.errorHandler) {
    app.use(errors.handler());
  }
}

function populateToken(req) {
  var authorization = req.header('Authorization') || req.header('Access-Token') || req.header('access_token');

  if (!authorization && req.cookies) {
    authorization = req.cookies.authorization || req.cookies.access_token;
  }

  if (!authorization && req.body) {
    authorization = req.body.authorization || req.body.access_token;
    delete req.body.authorization;
    delete req.body.access_token;
  }

  if (!authorization && req.query) {
    authorization = req.query.authorization || req.query.access_token;
    delete req.query.authorization;
    delete req.query.access_token;
  }

  if (isString(authorization)) {
    let token = authorization;
    const spacePosition = token.indexOf(' ');

    if (spacePosition) {
      token = authorization.substring(spacePosition + 1);
    }

    req.headers['Authorization'] = token;
    req.jwt = {
      decoded: null,
      encoded: token,
    };

    return token;
  }
}

function remote(options) {
  const app = this;
  const mw = express();

  mw.on('mount', function (parent) {
    const api = client.call(app, options);
    const registry = app.restau.registry;
    const services = {};
    const router = express();

    prepareMount.call(mw, options, 'remote');

    registry.forEach(route => {
      const {name, service, path, method, endpoint} = route;

      if (!services[name]) {
        services[name] = {};
      }

      if (!parent.restau.services[name]) {
        parent.restau.services[name] = {};
      }

      if (!services[name][endpoint] || !services[name][endpoint][method]) {
        const handler = function (req, res, next) {
          const args = Object.keys(req.params).map(key => req.params[key]);
          const paramsCount = path.split(':').length - 1;

          if (args.length < paramsCount) {
            throw new Error((paramsCount - args.length) + ' param(s) missing to use ' + name + '.' + endpoint + ' with route ' + method + ' ' + path + ' (' + caller(3) + ')');
          }

          const stub = api[name][endpoint][method];

          args.push(req.headers)
          args.push(req.body);
          args.push(function (err, response, resBody) {
            if (err) {
              return next(err);
            }

            res.status(response.statusCode).send(resBody);
          });

          stub.apply(null, args);
        };

        if (!services[name][endpoint]) {
          services[name][endpoint] = handler;
        }

        services[name][endpoint][method] = handler;
      }

      const handler = services[name][endpoint][method];

      if (!parent.restau.services[name][endpoint] || !parent.restau.services[name][endpoint][method]) {
        const servicePromised = function (req, res, next) {
          return new Promise(function (resolve, reject) {
            handler(req, res, err => {
              if (err) {
                return reject(err);
              }

              resolve(res.result);
            });
          });
        };

        if (!parent.restau.services[name][endpoint]) {
          parent.restau.services[name][endpoint] = servicePromised;
        }

        if (!parent.restau.services[name][endpoint][method]) {
          parent.restau.services[name][endpoint][method] = servicePromised;
        }
      }

      router[method](path, handler);
    });

    parent.use(mw.mountpath, router);
  });

  return mw;
}

function resolvePath(obj) {
  if (isArray(obj)) {
    return obj.map(value => this.resolvePath(value));
  }

  if (isObject(obj)) {
    return mapObject(obj, (key, value) => [key, this.resolvePath(value)]);
  }

  if (obj.startsWith('.') || obj.startsWith('..')) {
    return join(this.restau.basedir, obj);
  }

  return obj;
}

function use() {
  let args = flatten(toArray(arguments));
  let [path, fn] = args;

  if (!args.length) {
    return this;
  }

  if (args.length === 1 && isString(args[0])) {
    return this.use('/', args[0]);
  }

  if (!isString(path) || requireSafe(this.resolvePath(path))) {
    return this.use.apply(this, ['/'].concat(args))
  }

  if (args.length > 2) {
    args.slice(1).forEach(mw => this.use(path, mw));
    return this;
  }

  if (isString(fn)) {
    fn = requireSafe(this.resolvePath(fn));
  }

  if (isObject(fn)) {
    Object.keys(fn).forEach(key => this.use(path, fn[key]));
    return this;
  }

  if (!isFunction(fn)) {
    // TODO better error message (path + fn + ?filepath)
    throw new TypeError('app.use() requires middleware functions');
  }

  this.restau.mws.push({ path, fn });

  return this;
}
