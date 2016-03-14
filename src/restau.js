'use strict';

const bodyParser = require('body-parser');
const errors = require('./errors');
const express = require('express');
const http = require('http');
const Model = require('./Model');
const Service = require('./Service');
const jsonWebToken = require('jsonwebtoken');
const knex = require('knex');
const request = require('request');

const {
  CUSTOM_RESPONSES,
  SEP,
  caller,
  clone,
  compose,
  debug,
  defineAccessor,
  dirname,
  flatten,
  forEachKey,
  mixin,
  isArray,
  isBoolean,
  isFunction,
  isObject,
  isString,
  isUndefined,
  mapObject,
  normalizeSlashes,
  omit,
  requireSafe,
  resolvePath,
  resolveUrlParams,
  responseKo,
  responseOk,
  toArray,
  toPairs
} = require('./utils');

const application = { binding, client, connection, listen, remote, use };
const d = debug('express:restau');

const DEFAULT_CONNECTOR_NAME = 'default';
const DEFAULT_ENV_NAME = 'development';
const JOKER_METHODS = ['DELETE', 'GET', 'POST', 'PUT', 'PATCH'];
const OPTION_BINDING_KEYS = ['binding', 'bindModel', 'bindModels', 'links'];
const OPTION_CONNECTION_KEYS = ['connection', 'connections', 'db'];
const OPTION_MIDDLEWARE_KEYS = ['mws_head', 'middleware', 'middlewares', 'mw', 'mws', 'model', 'models', 'service', 'services', 'mws_tail'];

module.exports = restau;

process.on('uncaughtException', x=>console.log(x.stack))

// TODO add configure public API (restau.configure(() => ))
function restau(options) {
  options = parseOptions(options);

  const app = express();
  const basedir = options.basedir || dirname(caller());

  d('init under %s', basedir);

  initStores(app);
  mixin(application, app);
  app.middlewares = app.middlewares || [];
  app.resolvePath = resolvePath(basedir);

  forEachKey(OPTION_BINDING_KEYS, options, app.binding.bind(app));
  forEachKey(OPTION_CONNECTION_KEYS, options, app.connection.bind(app));
  forEachKey(OPTION_MIDDLEWARE_KEYS, options, app.use.bind(app));

  app.on('mount', parent => {
    prepareMount.call(app, options);

    parent.bindings = Object.assign({}, app.bindings, parent.bindings);
    parent.connections = Object.assign({}, app.connections, parent.connections);

    app.middlewares.forEach(fn => fn())

    toPairs(parent.services)
      .map(pair => pair[1].$instance)
      .filter(service => service && isFunction(service.setup))
      .forEach(service => service.setup(parent));
  });

  return app;
}

/** @api public */

function binding(connectionName, modelLinked) {
  const app = this;

  if (!connectionName) {
    return app;
  }

  if (isObject(connectionName)) {
    Object.keys(connectionName).forEach(value => app.binding(value, connectionName[value]));
    return app;
  }

  if (isArray(modelLinked)) {
    modelLinked.forEach(model => app.binding(connectionName, model));
    return app;
  }

  if (isFunction(modelLinked)) {
    modelLinked = modelLinked.name;
  }

  if (modelLinked.indexOf(',') > -1) {
    modelLinked.split(',').map(x => x.trim()).forEach(model => app.binding(connectionName, model));
    return app;
  }

  d('set binding between connection "%s" and model "%s"', connectionName, modelLinked);

  app.bindings[modelLinked] = connectionName;

  return app;
}

function client(options) {
  const app = this;
  const api = {};

  if (isString(options)) {
    options = { baseurl: options };
  }

  options = options || {};
  options.baseurl = options.baseurl || null;
  options.headers = options.headers || {};

  if (!isString(options.baseurl)) {
    throw new Error('BASEURL_MISSING');
  }

  const baseUrl = normalizeSlashes(options.baseurl, false, false);
  const makeRequest = request.defaults({ baseUrl, headers: options.headers });

  Object.keys(app.services).forEach(name => {
    const service = app.services[name];

    if (!api[name]) {
      api[name] = {};
    }

    Object.keys(service).filter(key => key !== '$service').forEach(key => {
      const endpoint = service[key];

      endpoint.routes.forEach(route => {
        const method = route[0];
        const path = normalizeSlashes(endpoint.service.basepath + route[1], true, false);

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

          const reqOpts = { uri, method, headers, body, json };

          if (callback) {
            return makeRequest(reqOpts, callback);
          }

          return new Promise((resolve, reject) => {
            makeRequest(reqOpts, (err, response, reqBody) => {
              if (err) {
                return reject(err);
              }

              resolve(response);
            });
          });
        };

        if (!api[name][key]) {
          api[name][key] = handler;
        }

        api[name][key][method] = handler;
      });
    });
  });

  return api;
}

function connection(name, db) {
  const app = this;

  if (arguments.length === 1) {
    db = name;
    name = undefined;
  }

  if (isObject(db) && !(db.client && db.connection)) {
    Object.keys(db).forEach(key => app.connection(key, db[key]));
    return app;
  }

  name = name || DEFAULT_CONNECTOR_NAME;
  const env = app.get('env') || DEFAULT_ENV_NAME;

  if (db === true) {
    db = ['.', [env, 'sqlite3'].join('.')].join(SEP);
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
    d('set connection "%s"', name);

    app.connections[name] = app.resolvePath(db);
  }

  return app;
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

function remote(options) {
  if (isString(options)) {
    options = {
      baseurl: options
    };
  }

  options = options || {};
  options.baseurl = options.baseurl || null;
  options.headers = options.headers || {};
  options.bindRoutes = options.bindRoutes || true;

  if (!isString(options.baseurl)) {
    throw new Error('BASEURL_MISSING');
  }

  const app = this;
  const mw = express();

  mw.on('mount', function (parent) {
    const api = client.call(app, options);
    const services = {};
    const router = express();

    prepareMount.call(mw, options, 'remote');

    Object.keys(app.services).forEach(name => {
      const service = app.services[name];

      if (!services[name]) {
        services[name] = {};
      }

      if (!parent.services[name]) {
        parent.services[name] = {};
      }

      Object.keys(service).filter(key => key !== '$service').forEach(key => {
        const endpoint = service[key];

        endpoint.routes.forEach(route => {
          const method = route[0];
          const path = normalizeSlashes(endpoint.service.basepath + route[1], true, false);
          const stub = api[name][key][method];

          if (!services[name][key] || !services[name][key][method]) {
            const handler = function (req, res, next) {
              const args = Object.keys(req.params).map(key => req.params[key]);
              const paramsCount = path.split(':').length - 1;

              if (args.length < paramsCount) {
                throw new Error((paramsCount - args.length) + ' param(s) missing to use ' + name + '.' + endpoint + ' with route ' + method + ' ' + path + ' (' + caller(3) + ')');
              }

              let {headers, body} = req;

              headers = isObject(headers) ? headers : {};
              headers = Object.assign({}, options.headers, headers);

              args.push(req.headers)
              args.push(req.body);

              return stub.apply(null, args);
            };

            if (!services[name][key]) {
              services[name][key] = handler;
            }

            services[name][key][method] = handler;
          }

          if (!parent.services[name][key] || !parent.services[name][key][method]) {
            const handler = services[name][key][method];

            if (!parent.services[name][key]) {
              parent.services[name][key] = function () {
                return handler.apply(null, toArray(arguments))
                  .then(response => response.body);
              };
            }

            if (!parent.services[name][key][method]) {
              parent.services[name][key][method] = handler;
            }
          }

          router[method](path, function (req, res, next) {
            services[name][key][method](req, res, next)
              .then(response => res.status(response.statusCode).send(response.body))
              .catch(next);
            });
        });
      });
    });

    if (options.bindRoutes) {
      parent.use(mw.mountpath, router);
    }
  });

  return mw;
}

function use() {
  const app = this;
  let args = flatten(toArray(arguments));
  let [path, fn] = args;

  if (!args.length) {
    return app;
  }

  if (args.length === 1 && isString(args[0])) {
    return app.use('/', args[0]);
  }

  if (!isString(path) || requireSafe(app.resolvePath(path))) {
    return app.use.apply(app, ['/'].concat(args))
  }

  if (args.length > 2) {
    args.slice(1).forEach(mw => app.use(path, mw));
    return app;
  }

  if (isString(fn)) {
    fn = requireSafe(app.resolvePath(fn));
  }

  if (isObject(fn)) {
    Object.keys(fn).forEach(key => app.use(path, fn[key]));
    return app;
  }

  if (!isFunction(fn)) {
    throw new TypeError('app.use() requires middleware functions');
  }

  let mounting = () => fn;

  if (Model.isModelSubclass(fn)) {
    mounting = prepareMountingModel.call(app, fn);
  }

  if (Service.isServiceSubclass(fn)) {
    mounting = prepareMountingService.call(app, fn);
  }

  app.middlewares.push(function () {
    d('inject middleware %s %s', path, fn.name);

    path = normalizeSlashes([app.mountpath, path].join('/'), true, false);
    const mw = mounting.call(app);

    if (isFunction(mw)) {
      app.parent.use(path, mw);
    }
  });

  return app;
}

/** @api private */

function createEndpointHandler(endpoint) {
  const service = this;
  const {name, method, path, auth, before, after} = endpoint;
  const fn = service[name];
  const flow = [];

  if (!fn) {
    throw new Error('ENDPOINT_MISSING ' + service.constructor.name + '.' + name);
  }

  flow.push(function (req, res, next) {
    req.app.jwt = service.app.jwt;
    req.app.models = service.app.models;
    req.app.services = service.app.services;
    res.ok = responseOk;
    res.ko = responseKo;
    Object.assign(res, CUSTOM_RESPONSES);
    next();
  });

  if (!isUndefined(auth) && auth !== null) {
    flow.push(function (req, res, next) {
      const {populateToken, verifyToken} = req.app.jwt;

      if (!verifyToken) {
        throw new Error('MISSING_JWT_SECRET');
      }

      if (!populateToken) {
        throw new Error('MISSING TOKEN POPULATE FUNC');
      }

      let token = populateToken(req);
      let tokenDecoded;
      let verifyError;

      try {
        tokenDecoded = verifyToken(token);
      } catch (err) {
        verifyError = err;
        return next(new errors.Forbidden(err));
      }

      req.jwt = {
        encoded: token,
        decoded: tokenDecoded
      };

      if (auth === false && tokenDecoded) {
        return next(new errors.Forbidden('Access reserved for unsigned users'));
      }

      if (auth && !tokenDecoded) {
        return next(new errors.Forbidden('Access reserved for signed users'));
      }

      if (isArray(auth) && tokenDecoded) {
        tokenDecoded.roles = tokenDecoded.roles || [];

        if (auth[0] === 'U' && !auth.slice(1).reduce((r, curr) => !r || tokenDecoded.roles.indexOf(curr) > -1, true)) {
          return next(new errors.Forbidden('Has not every roles needed: ' + auth.slice(1)));
        }

        if (!auth.reduce((r, curr) => r || tokenDecoded.roles.indexOf(curr) > -1, false)) {
          return next(new errors.Forbidden('Has not one role needed: ' + auth));
        }
      }

      next();
    });
  }

  flow.push.apply(flow, before.map(mw => mw.bind(service)));

  flow.push(function (req, res, next) {
    let output = fn.call(service, req, res, next);

    if (!output || !isFunction(output.then)) {
      output = Promise.resolve(output);
    }

    output
      .then(data => {
        if (data instanceof Error) {
          throw data;
        }

        res.data = data;
        next();
      })
      .catch(next);
  });

  flow.push(function (req, res, next) {
    let data = clone(res.data);

    data = Promise.resolve(data);

    const promise = [data].concat(after).reduce((currentPromise, nextPromise) => {
      return currentPromise
        .then(result => {
          if (result instanceof Error) {
            return Promise.reject(result);
          }

          if (res.finished) {
            return Promise.resolve(result);
          }

          return nextPromise.call(service, result, req, res, next);
        });
    });

    promise
      .then(result => {
        res.result = result;
        next();
      })
      .catch(next);
  });

  return compose(flow);
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

function initStores(app) {
  app.bindings = app.bindings || {};
  app.connections = app.connections || {};
  app.connectors = app.connectors || {};
  app.models = app.models || {};
  app.services = app.services || {};
}

function mountModel(model) {
  const parent = this.parent;
  const {bindings, connections, connectors} = parent;
  const modelName = model.name;
  const connectorName = bindings[modelName];

  if (!connectors[connectorName] && !connections[connectorName]) {
    throw new Error('Connector "' + connectorName + '" does not exist');
  }

  if (!connectors[connectorName]) {
    connectors[connectorName] = knex(connections[connectorName]);

    d('create connector "%s"', connectorName)
  }

  model.knex(connectors[connectorName]);
  model.app = parent;

  d('bind model "%s" with connector "%s"', model.name, connectorName);

  parent.models[model.name] = model;

  d('inject model "%s"', model.name);
}

function mountService(service) {
  const parent = this.parent;
  const router = express();

  let flows = {};
  let handlers = {};
  let promiseHandlers = {};
  let serviceName = service.name;
  let serviceInstance = new service(parent);

  if (!parent.services[serviceName]) {
    d('init service %s', serviceName);

    parent.services[serviceName] = {
      $class: service,
      $flows: {},
      $handlers: {},
      $promiseHandlers: {},
      $instance: serviceInstance
    };
  } else {
    d('service %s already exists', serviceName);

    flows = parent.services[serviceName].$flows;
    handlers = parent.services[serviceName].$handlers;
    promiseHandlers = parent.services[serviceName].$promiseHandlers;
    serviceInstance = parent.services[serviceName].$instance;
  }

  Object.keys(service.api).filter(key => key !== '$service').forEach(key => {
    const endpoint = service.api[key];
    const {auth, routes} = endpoint;
    const before = service.before['*'].concat(endpoint.before);
    const after = service.after['*'].concat(endpoint.after);

    routes.forEach(route => {
      let [method, path] = route;
      let flow;

      d('add route %s.%s -> %s %s', serviceName, key, method, path);

      if (!flows[key]) {
        flows[key] = createEndpointHandler.call(serviceInstance, { name: key, method, path, auth, before, after });
      }

      flow = flows[key];

      if (!handlers[key]) {
        d('create handler for endpoint %s.%s', serviceName, key);

        const handler = compose([flow, function (req, res, next) {
          const result = res.result;

          // TODO custom response wrapper
          // if (isFunction(options.responseWrapper)) {
          //   result = options.responseWrapper(result, req, res);
          // }

          if (res.finished) {
            console.error('WARN %s.%s: response already sent', serviceName, key)
          } else {
            res.send(result);
          }

          return result;
        }]);

        handlers[key] = parent.services[serviceName].$handlers[key] = handler;
      }

      if (!promiseHandlers[key] || !promiseHandlers[key][method]) {
        d('create promise handler %s %s', method, key);

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

        if (!parent.services[serviceName][key]) {
          parent.services[serviceName][key] = promiseHandler;;
        }

        parent.services[serviceName][key][method] = promiseHandler
      }

      router[method](normalizeSlashes(service.basepath + path, true, false), handlers[key]);
    });
  });

  return router;
}

function normalizeService(service) {
  const name = service.name;
  const after = normalizeServiceHooks(service.after);
  const auth = normalizeServiceAuth(service.auth);
  const basepath = normalizeServiceBasepath(service.basepath);
  const before = normalizeServiceHooks(service.before);
  const endpoints = normalizeServiceRoutes(service.endpoints);

  Object.keys(endpoints).forEach(key => {
    if (!after[key]) {
      after[key] = [];
    }

    if (!before[key]) {
      before[key] = [];
    }
  });

  return { name, basepath, auth, before, after, endpoints };
}

function normalizeServiceAuth(auth) {
  const normalized = {};

  if (!isObject(auth)) {
    auth = { '*': auth };
  }

  if (isUndefined(auth['*'])) {
    auth['*'] = undefined;
  }

  Object.keys(auth).forEach(key => {
    let endpoints = key;
    let rule = auth[key];

    if (endpoints.indexOf(',') > -1) {
      endpoints = key.split(',').map(x => x.trim());
    }

    if (!isArray(endpoints)) {
      endpoints = [endpoints];
    }

    if (isString(rule)) {
      rule = [rule];
    }

    if (!isBoolean(rule) && !isArray(rule)) {
      rule = null;
    }

    endpoints.forEach(endpoint => normalized[endpoint] = rule);
  });

  return normalized;
}

function normalizeServiceBasepath(basepath) {
  if (isString(basepath)) {
    return normalizeSlashes(basepath, true, false);
  }

  return '/';
}

function normalizeServiceHooks(hooks) {
  const normalized = {};

  if (!isObject(hooks)) {
    hooks = { '*': hooks };
  }

  if (isUndefined(hooks['*'])) {
    hooks['*'] = undefined;
  }

  Object.keys(hooks).forEach(key => {
    let endpoints = key;
    let mws = hooks[key];

    if (endpoints.indexOf(',') > -1) {
      endpoints = key.split(',').map(x => x.trim());
    }

    if (!isArray(endpoints)) {
      endpoints = [endpoints];
    }

    if (!isArray(mws)) {
      mws = [mws];
    }

    mws = mws.filter(isFunction);

    endpoints.forEach(endpoint => normalized[endpoint] = mws);
  });

  return normalized;
}

function normalizeServiceRoutes(endpoints) {
  const normalized = {};

  if (isObject(endpoints)) {
    Object.keys(endpoints).forEach(key => {
      let keys = key.indexOf(',') > -1 ? key.split(',').map(x => x.trim()) : [key];
      let routes = endpoints[key];

      if (isString(routes)) {
        routes = [routes];
      }

      if (!isArray(routes)) {
        return;
      }

      routes.forEach(route => {
        let methodPos = route.lastIndexOf(' ');
        let method = 'get';

        if (methodPos > -1) {
          method = route.substring(0, methodPos).toLowerCase();
          route = route.substring(methodPos + 1);
        }

        route = normalizeSlashes(route, true, false);

        if (method.indexOf('|') > -1) {
          method = method.split('|').map(x => x.trim());
        }

        if (method === '*') {
          method = JOKER_METHODS.map(x => x.toLowerCase());
        }

        if (!isArray(method)) {
          method = [method];
        }

        keys.forEach(endpoint => {
          if (!normalized[endpoint]) {
            normalized[endpoint] = [];
          }

          method.forEach(m => normalized[endpoint].push([m, route]));
        });
      });
    });
  }

  return normalized;
}

function parseOptions(options) {
  if (isString(options)) {
    options = {
      basedir: options
    };
  }

  options = options || {};

  // TODO add default values for all options

  return options;
}

function parseJwtOptions(options) {
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

function prepareMount(options) {
  const app = this;
  const parent = app.parent;

  parent._router.stack.pop();

  if (options.mountpath && app.mountpath === '/') {
    app.mountpath = options.mountpath;
  }

  initStores(parent);

  const jwtOptions = parseJwtOptions(options.jwt);

  if (jwtOptions) {
    parent.jwt = {
      populateToken,
      signToken: createJwtHelper(jsonWebToken.sign, jwtOptions),
      verifyToken: createJwtHelper(jsonWebToken.verify, jwtOptions)
    };
  }

  if (options.errorHandler) {
    app.use(errors.handler());
  }
}

function prepareMountingModel(model) {
  const app = this;
  const name = model.name;

  // TODO check tableName and jsonSchema (which must be string and object)

  if (!app.bindings[name]) {
    app.bindings[name] = model.binding || DEFAULT_CONNECTOR_NAME;
  }

  app.models[name] = model;

  return mountModel.bind(app, model);
}

function prepareMountingService(service) {
  const app = this;
  let serviceProto = {};
  let servicePrepared;
  let {name, auth, basepath, before, after, endpoints} = normalizeService(service);

  // const servicePrepared = class extends service {
  //   static get name() { return name; }
  //   static get basepath() { return basepath; }
  //   static get auth() { return auth; }
  //   static get before() { return before; }
  //   static get after() { return after; }
  //   static get endpoints() { return endpoints; }
  // };
  defineAccessor(serviceProto, 'name', () => name);
  defineAccessor(serviceProto, 'basepath', () => basepath, (x) => (basepath = x));
  defineAccessor(serviceProto, 'auth', () => auth);
  defineAccessor(serviceProto, 'before', () => before);
  defineAccessor(serviceProto, 'after', () => after);
  defineAccessor(serviceProto, 'endpoints', () => endpoints);

  servicePrepared = mixin(serviceProto, service)

  const api = servicePrepared.api = { $service: servicePrepared };

  Object.keys(endpoints).forEach(key => {
    api[key] = class {
      static get name() { return key; }
      static get auth() { return !isUndefined(auth[key]) ? auth[key] : auth['*']; }
      static set auth(rule) { auth[key] = isString(rule) ? [rule] : rule; }
      static get routes() { return endpoints[key]; }
      static get before() { return before[key]; }
      static get after() { return after[key]; }
      static get service() { return servicePrepared; }
    };
  });

  app.services[name] = api;

  return mountService.bind(app, servicePrepared);
}
