'use strict';

const {basename} = require('path');
const clone = require('clone');
const {compose} = require('compose-middleware');
const enrouten = require('express-enrouten');
const express = require('express');
const {isArray, isFunction, isNumber, isObject, isString, isUndefined} = require('core-util-is');

const {STATUS_CODES} = require('http')
const JOKER_METHODS = ['DELETE', 'GET', 'POST', 'PUT', 'PATCH'];
const DEFAULT_RESPONSE_STATUS = 200;
const DEFAULT_ERROR_STATUS = 500;
const SUCCESS_LT_STATUS = 400;

module.exports = function (options) {
  if (isString(options)) {
    options = {
      services: options
    };
  }

  options = options || {};
  options.services = options.services || null;
  options.models = options.models || null;

  if (isString(options.responseWrapper)) {
    let wrapperPath = options.responseWrapper;
    let wrapperFile = basename(wrapperPath);
    let wrapperMethodName;
    let wrapperMethod;
    const dotPos = wrapperFile.indexOf('.');

    if (dotPos > -1) {
      wrapperPath = wrapperPath.substring(0, (wrapperPath.length - wrapperFile.length) + dotPos);
      wrapperMethodName = wrapperFile.substring(dotPos + 1);
    }

    wrapperMethod = require(wrapperPath);
    if (wrapperMethodName) {
      wrapperMethod = wrapperMethod[wrapperMethodName];
    }

    options.responseWrapper = wrapperMethod;
  }

  const app = express();

  app.once('mount', mount(app, options));

  return app;
};

function mount(app, options) {
  return function onmount(parent) {
    // Remove sacrificial express app and keep a
    // copy of the currently registered items.
    /// XXX: caveat emptor, private member
    parent._router.stack.pop();

    if (!parent.services) {
      parent.services = {};
    }

    const registry = createRegistry(parent, options);
    const routes = createRoutes(parent, registry, options);

    console.log('----- INIT SCREWS')
    console.log('mounting routes at', app.mountpath);
    console.log(routes);
    console.log(parent.services);

    parent.use(app.mountpath, enrouten({ routes }));
  };
}

function createRegistry(app, options) {
  const registry = [];
  var services = options.services || null;

  if (isString(services)) {
    // TODO use module require.dir recursivly
    services = require(services);
  }

  loadServices(services);

  function loadServices(services) {
    if (isFunction(services)) {
      registerService(services);
    }

    if (isObject(services)) {
      Object.keys(services).forEach(key => {
        const service = services[key];

        if (isObject(service)) {
          loadServices(service);
          return;
        }

        loadService(service, key);
      });
    }
  }

  function loadService(service, key) {
    let {name, basepath, routes} = service;
    name = name || key;
    basepath = basepath || '/';
    routes = routes || {};

    const entry = {
      name,
      service,
      routes: []
    };

    Object.keys(routes).forEach(endpoint => {
      const handler = endpoint;
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
              handler,
              hooks
            }));

          return;
        }

        entry.routes.push({
          path: route,
          method,
          handler,
          hooks
        });
      });
    });

    registry.push(entry);
  }

  return registry;
}

function createRoutes(app, registry, options) {
  const routes = [];
  var responseWrapper = options.responseWrapper || null;

  registry.forEach(entry => {
    if (!app.services[entry.name]) {
      app.services[entry.name] = {};
    }

    const service = new entry.service(app);
    const handlers = {};

    entry.routes.forEach(route => {
      const {path, method, handler, hooks} = route;
      const handlerFn = service[handler];

      if (!handlerFn) {
        throw new Error('endpoint no found ' + [entry.name, handler].join('.'));
      }

      if (!handlers[handler]) {
        const {before, after} = hooks;
        var flow = before;

        flow.unshift(function (req, res, next) {
          res.ok = responseOk;
          res.ko = responseKo;
          next();
        });

        flow.push(function (req, res, next) {
          let output = handlerFn.call(service, req, res, next);

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
              if (isFunction(responseWrapper)) {
                result = responseWrapper(result, req, res);
              }

              res.result = result;
              next();
            })
            .catch(next);
        });

        flow = compose(flow);

        app.services[entry.name][handler] = function (req, res, next) {
          return new Promise(function (resolve, reject) {
            flow(req, res, err => {
              if (err) {
                return reject(err);
              }

              resolve(res.result);
            });
          });
        }

        handlers[handler] = compose([flow, function (req, res, next) {
          const result = res.result;

          if (res.finished) {
            console.error('WARN %s.%s: response already sent', entry.name, handler)
          } else {
            res.send(result);
          }

          return result;
        }]);
      }

      routes.push({
        path,
        method,
        handler: handlers[handler]
      });
    });
  });

  return routes;
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

  data.success = data.code < SUCCESS_LT_STATUS;

  if (this.statusCode !== data.code) {
    this.status(data.code);
  }

  return Object.assign({ success: null, code: null, message: null }, data);
}

function responseKo() {
  const args = Array.prototype.slice.call(arguments);
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
