'use strict';

const Model = require('./Model')
const ModelService = require('./ModelService')
const Service = require('./Service')
const caller = require('caller');
const clone = require('clone');
const {compose} = require('compose-middleware');
const enrouten = require('express-enrouten');
const express = require('express');
const debug = require('debug');
const flatten = require('arr-flatten');
const http = require('http');
const {isArray, isFunction, isObject, isString, isUndefined} = require('core-util-is')
const knex = require('knex');
const path = require('path');

const DEFAULT_CONFIG_FOLDER = 'config';
const DEFAULT_CONNECTOR_NAME = 'default';
const DEFAULT_ENV_NAME = 'development';
const DEFAULT_ERROR_STATUS = 500;
const DEFAULT_RESPONSE_STATUS = 200;
const JOKER_METHODS = ['DELETE', 'GET', 'POST', 'PUT', 'PATCH'];
const {STATUS_CODES} = http;
const SUCCESS_WHEN_STATUS_LT = 400;

const d = debug('express:restau');

module.exports = Object.assign(restau, {
  restau,
  Model,
  ModelService,
  Service
});

// TODO
// api public .client(headers) pour retourner une api permettant de
// d'exécuter des requêtes http vers les services existants
//
// api public .remote(String, headers) pour retourner un middleware interceptant
// les routes des services et exécutant la requête vers le service
// distant avec le client
//
// ModelService
// static get idField = id
// static get tableName = name
// static get schema
// static get disable
//
// TODO gérer l'authentification
//
// TODO "client" ou proxy vers un service distant
// à ce moment là toutes les routes du registre
// pointent sur un service externe
// + paramètres de config de screws
//    { remote: { url, headers }}
// TODO le paramètre change la création du handlerFlow
//   en mode "remote" on transfert la requête vers
//   un service distant et affiche le résultat en brut
//
// TODO utiliser endgame
// endgame(options.uncaughtException);
//
// TODO lorsque l'on inject les services dans app.services,
// il faut créer app.services[endpoint][get|post|patch] ???

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

    d('LINKS: ', links);

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
      method.apply(app, slice(arguments));
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

        d('inject connector ' + connectorName)
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

        d('inject service ' + entry.name);
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

          d('inject route ' + method + ' ' + path);
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
    const modelPrepared = prepareThing('model', models, slice(arguments));

    return modelPrepared;
  }

  function useService() {
    let servicePrepared = prepareThing('service', services, slice(arguments));

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
  let [opts, configFolder] = slice(args);

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
  const args = slice(arguments);
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