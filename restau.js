'use strict';

const Model = require('./Model')
const ModelService = require('./ModelService')
const Service = require('./Service')
const caller = require('caller');
const camelCase = require('to-camel-case');
const clone = require('clone');
const {compose} = require('compose-middleware');
const enrouten = require('express-enrouten');
const express = require('express');
const debug = require('debug');
const flatten = require('arr-flatten');
const http = require('http');
const {isArray, isFunction, isNumber, isObject, isString, isUndefined} = require('core-util-is')
const knex = require('knex');
const path = require('path');
const setValue = require('set-value');

const DEFAULT_CONFIG_FOLDER = 'config';
const DEFAULT_CONNECTOR_NAME = 'default';
const DEFAULT_ENV_NAME = 'development';
const DEFAULT_ERROR_STATUS = 500;
const DEFAULT_RESPONSE_STATUS = 200;
const DEFAULT_RESPONSE_CODES = [201, 202, 204, 400, 401, 402, 403, 404, 405, 406, 408, 409, 422, 500, 501, 503];
const JOKER_METHODS = ['DELETE', 'GET', 'POST', 'PUT', 'PATCH'];
const STATUS_CODES = http.STATUS_CODES;
const SUCCESS_WHEN_STATUS_LT = 400;
const CUSTOM_RESPONSES = createCustomResponses(DEFAULT_RESPONSE_CODES);

const d = debug('express:restau');

module.exports = restau;

function restau() {
  const connectors = {};
  const links = {};
  const models = {};
  const services = {};
  const registry = [];

  const app = express();
  const env = process.env.NODE_ENV || DEFAULT_ENV_NAME;
  const options = parseOptions(arguments);

  behavior({ behavior, bindModel, start, useConnector, useModel, useService });

  useConnector(options.db);
  useModel(options.models);
  useService(options.services);
  bindModel(options.links);

  app.on('mount', function (parent) {
    parent._router.stack.pop();

    if (!parent.restau) {
      parent.restau = {
        models: {},
        services: {}
      };
    }

    let mountpath = app.mountpath;
    if (mountpath === '/' && options.mountpath) {
      mountpath = options.mountpath;
    }

    const modelsInjected = injectModels(parent);
    const routes = injectServices(parent);

    parent.use(mountpath, enrouten({ routes }));
  });

  function behavior(name, method) {
    if (isObject(name)) {
      Object.keys(name).forEach(n => behavior(n, name[n]));
      return app;
    }

    if (isFunction(name)) {
      method = name;
      name = method.name;
    }

    if (app[name]) {
      throw new Error('key already in used: ' + name);
    }

    app[name] = function () {
      method.apply(app, toArray(arguments));
      return app;
    };

    return app;
  }

  function findConnectorName(model) {
    const name = model.name;
    let connection = DEFAULT_CONNECTOR_NAME;

    const customConnection = links[name];

    if (customConnection) {
      connection = customConnection;
    }

    if (!connectors[connection]) {
      throw new Error('Connector "' + connection + '" does not exist');
    }

    return connection;
  }

  function injectModels(parent) {
    const connections = {};

    return Object.keys(models).map(key => {
      const model = models[key];
      const connectorName = findConnectorName(model);

      if (!connections[connectorName]) {
        connections[connectorName] = knex(connectors[connectorName]);

        d('create connector ' + connectorName)
      }

      const modelBound = models[key].bindKnex(connections[connectorName]);

      d('bind ' + model.name + ' model with ' + connectorName + ' connector');

      parent.restau.models[model.name] = modelBound;

      d('inject model ' + model.name);

      return modelBound;
    });
  }

  function injectServices(parent) {
    const routes = [];

    registry.forEach(entry => {
      if (!parent.restau.services[entry.name]) {
        parent.restau.services[entry.name] = {};

        d('init service ' + entry.name);
      }

      const service = new entry.service(parent);
      const handlers = {};

      entry.routes.forEach(route => {
        const {path, method, endpoint, hooks} = route;
        const handler = service[endpoint];

        if (!handlers[endpoint]) {
          const {before, after} = hooks;
          var flow = before;

          flow.unshift(function (req, res, next) {
            res.ok = responseOk;
            res.ko = responseKo;
            Object.assign(res, CUSTOM_RESPONSES);
            next();
          });

          flow.push(function (req, res, next) {
            let output = handler.call(service, req, res, next);

            if (!output || !isFunction(output.then)) {
              output = Promise.resolve(output);
            }

            output
              .then(data => {
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

                  return nextPromise(result, req, res, next);
                });
            });

            promise
              .then(result => {
                if (isFunction(options.responseWrapper)) {
                  result = options.responseWrapper(result, req, res);
                }

                res.result = result;
                next();
              })
              .catch(next);
          });

          flow = compose(flow);

          parent.restau.services[entry.name][endpoint] = function (req, res, next) {
            return new Promise(function (resolve, reject) {
              flow(req, res, err => {
                if (err) {
                  return reject(err);
                }

                resolve(res.result);
              });
            });
          }

          handlers[endpoint] = compose([flow, function (req, res, next) {
            const result = res.result;

            if (res.finished) {
              console.error('WARN %s.%s: response already sent', entry.name, endpoint)
            } else {
              res.send(result);
            }

            return result;
          }]);

          d('add route %s.%s -> %s %s', entry.name, endpoint, method, path);
        }

        routes.push({
          path,
          method,
          handler: handlers[endpoint]
        });
      });
    });

    return routes;
  }

  function prepareThing(label, store) {
    const prepare = function (thing) {
      if (isArray(thing)) {
        return flatten(thing.map(prepare).filter(compact));
      }

      if (isObject(thing)) {
        return flatten(Object.keys(thing).map(key => prepare(thing[key])).filter(compact));
      }

      if (isString(thing)) {
        return prepare(requireSafe(thing));
      }

      if (isFunction(thing)) {
        const name = thing.name;
        if (!name) {
          throw new Error('MISSING_NAME');
        }

        if (store[name]) {
          d('WARN a %s %s was already prepared', label, name);
        }

        d('prepare %s %s', label, name);

        store[name] = thing;

        return thing;
      }
    };

    if (arguments.length > 2) {
      return prepare(slice(arguments, 2));
    }

    return prepare;
  }

  function resolveRelativePaths(obj) {
    if (isObject(obj)) {
      Object.keys(obj).forEach(key => {
        obj[key] = resolveRelativePaths(obj[key]);
      });
    }

    if (isString(obj)) {
      if (obj.startsWith('.' + path.sep) || obj.startsWith('..' + path.sep)) {
        return path.join(options.basedir, obj);
      }
    }

    return obj;
  }

  function requireSafe(filepath) {
    try {
      return require(resolveRelativePaths(filepath));
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw err;
      }
    }
  }

  function useConnector(name, db) {
    if (arguments.length === 1) {
      db = name;
      name = undefined;
    }

    if (isObject(db) && !(db.client && db.connection)) {
      return flatten(Object.keys(db).map(key => useConnector(key, db[key])).filter(compact));
    }

    name = name || DEFAULT_CONNECTOR_NAME;

    if (db === true) {
      db = ['.', [env, 'sqlite3'].join('.')].join(path.sep);
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
      resolveRelativePaths(db);

      d('prepare connector %s', name)

      connectors[name] = db;

      return db;
    }
  }

  function bindModel(connectorName, modelLinked) {
    if (!connectorName) {
      return;
    }

    if (isObject(connectorName)) {
      return Object.keys(connectorName).forEach(connector => bindModel(connector, connectorName[connector]));
    }

    if (!connectors[connectorName]) {
      throw new Error('Connector "' + connectorName + '" does not exist');
    }

    if (isArray(modelLinked)) {
      return modelLinked.forEach(model => bindModel(connectorName, model));
    }

    if (isFunction(modelLinked)) {
      modelLinked = modelLinked.name;
    }

    if (!models[modelLinked]) {
      throw new Error('Model "' + modelLinked + '" does not exist');
    }

    links[modelLinked] = connectorName;
  }

  function useModel() {
    const modelPrepared = prepareThing('model', models, toArray(arguments));

    return modelPrepared;
  }

  function useService() {
    let servicePrepared = prepareThing('service', services, toArray(arguments));

    if (servicePrepared && !isArray(servicePrepared)) {
      servicePrepared = [servicePrepared];
    }

    if (isArray(servicePrepared)) {
      servicePrepared.forEach(service => {
        let {name, basepath, routes} = service;
        basepath = basepath || '/';
        routes = routes || {};

        const entry = {
          name,
          service,
          routes: []
        };

        Object.keys(routes).forEach(endpoint => {
          if (!service.prototype[endpoint]) {
            throw new Error('Endpoint "' + name + '.' + endpoint + '" does not exist');
          }

          const hooks = service.hooks(endpoint);
          let methodAndRoutes = routes[endpoint];

          if (isString(methodAndRoutes)) {
            methodAndRoutes = [methodAndRoutes];
          }

          if (!isArray(methodAndRoutes)) {
            return;
          }
          methodAndRoutes.forEach(methodAndRoute => {
            const methodPos = methodAndRoute.indexOf(' ');
            let method = 'GET';
            let route = methodAndRoute;

            if (methodPos > -1) {
              method = methodAndRoute.substring(0, methodPos).toUpperCase();
              route = methodAndRoute.substring(methodPos + 1);
            }

            route = [basepath, route].join('/');
            route = normalizeSlashs(route, true, false);

            if (method === '*') {
              JOKER_METHODS.forEach(value => entry.routes.push({
                  path: route,
                  method: value,
                  endpoint,
                  hooks
                }));

              return;
            }

            entry.routes.push({
              path: route,
              method,
              endpoint,
              hooks
            });
          });
        });

        registry.push(entry);
      });
    }

    return servicePrepared;
  }

  return app;
}

function compact(x) {
  return !!x;
}

// function configure(fn) {
//   const app = this;
//
//   fn.call(app);
//
//   return app;
// }

function createCustomResponses(codes) {
  return codes
    .map(code => [camelCase(STATUS_CODES[code]), code])
    .map(response => {
      const [method, code] = response;
      const handler = code < SUCCESS_WHEN_STATUS_LT ? responseOk : responseKo;

      return [method, function () {
        return handler.apply(this, [code].concat(toArray(arguments)));
      }];
    })
    .map(fromPair)
    .reduce((r, curr) => Object.assign(r, curr));
}

function fromPair(pair) {
  if (!isArray(pair)) {
    pair = Array.prototype.slice.call(arguments);
  }

  const [key, value] = pair;

  return setValue({}, key, value);
}

function normalizeSlashs(str, starts, ends) {
  if (isUndefined(starts)) {
    starts = true;
  }

  if (isUndefined(ends)) {
    ends = false;
  }

  str = str.split('/').filter(x => !!x).join('/');

  if (starts === true && !str.startsWith('/')) {
    str = '/' + str;
  }

  if (ends === true && !str.endsWith('/')) {
    str = str + '/';
  }

  return str;
}

function parseOptions(args) {
  let [opts, configFolder] = toArray(args);

  if (isString(opts)) {
    opts = {
      basedir: opts
    };
  }

  opts = opts || {};
  opts.basedir = opts.basedir || path.dirname(caller(2));
  opts.configFolder = configFolder || opts.configFolder || DEFAULT_CONFIG_FOLDER;
  opts.db = opts.db || null;
  opts.connections
  opts.inheritViews = !!opts.inheritViews;
  opts.models = opts.models || null;
  opts.links = opts.links || null;
  opts.mountpath = opts.mountpath || null;
  opts.services = opts.services || null;
  opts.responseWrapper = opts.responseWrapper || null;

  return opts;
}

function responseKo() {
  const args = toArray(arguments);
  let data = args[0] || {};

  if (isNumber(data)) {
    data = {
      code: data
    };
  }

  if (isString(data)) {
    data = {
      message: data
    };
  }

  if (!data.code) {
    data.code = DEFAULT_ERROR_STATUS;
  }

  args[0] = data;

  return responseOk.apply(this, args);
}

function responseOk(data) {
  data = data || {};

  if (isNumber(data)) {
    data = {
      code: data
    };
  }

  if (isString(data)) {
    data = {
      message: data
    };
  }

  if (!data.code) {
    data.code = DEFAULT_RESPONSE_STATUS;
  }

  if (isString(arguments[1])) {
    data.message = arguments[1];
  }

  if (isObject(arguments[1])) {
    Object.assign(data, arguments[1])
  }

  if (isObject(arguments[2])) {
    Object.assign(data, arguments[2])
  }

  if (this.statusCode !== DEFAULT_RESPONSE_STATUS) {
    data.code = this.statusCode;
  }

  if (data.code && !data.message) {
    data.message = STATUS_CODES[data.code];
  }

  data.success = data.code < SUCCESS_WHEN_STATUS_LT;

  if (this.statusCode !== data.code) {
    this.status(data.code);
  }

  return Object.assign({ success: null, code: null, message: null }, data);
}

function slice(obj, start, end) {
  return Array.prototype.slice.call(obj, start, end);
}

function start(port, host) {
  const rest = this;
  const app = express().use(rest);
  const server = http.createServer(app);

  host = host || rest.get('port');
  port = port || rest.get('port');

  if (!port) {
    throw new Error('MISSING_PORT');
  }

  server.listen(port, host);

  server.on('listening', function () {
    console.log('restau listen on %d', port)
  })

  return server;
}

function toArray(obj) {
  return slice(obj);
}
