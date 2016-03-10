'use strict';

const Forbidden = require('./errors/Forbidden');
const http = require('http');
const {
  CUSTOM_RESPONSES,
  clone,
  compose,
  isArray,
  isFunction,
  isntNil,
  isString,
  isUndefined,
  normalizeSlashes,
  responseKo,
  responseOk
} = require('./utils');

const JOKER_METHODS = ['DELETE', 'GET', 'POST', 'PUT', 'PATCH'];

module.exports = class Service {
  static isService(obj) {
    return obj instanceof Service;
  }

  static isServiceSubclass(obj) {
    return obj && obj.prototype instanceof Service;
  }

  static get basepath() {
    return '/';
  }

  static get routes() {
    return;
  }

  static get before() {
    return;
  }

  static get after() {
    return;
  }

  static get auth() {
    return;
  }

  static hooks(endpoint) {
    let {before, after} = this;

    if (endpoint) {
      let auth = this.auth && this.auth[endpoint];
      let beforeEndpoint = before && before[endpoint] || [];
      let afterEndpoint = after && after[endpoint] || [];

      if (!Array.isArray(beforeEndpoint)) {
        beforeEndpoint = [beforeEndpoint];
      }

      if (!Array.isArray(afterEndpoint)) {
        afterEndpoint = [afterEndpoint];
      }

      if (before && before['*']) {
        beforeEndpoint.unshift(before['*']);
      }

      if (after && after['*']) {
        afterEndpoint.push(after['*']);
      }

      beforeEndpoint = beforeEndpoint.filter(isntNil);
      afterEndpoint = afterEndpoint.filter(isntNil);

      if (!isUndefined(auth) && auth !== null) {
        beforeEndpoint.unshift(function (req, res, next) {
          const {populateToken, verifyToken} = req.app.restau;

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
            return next(new Forbidden(err));
          }

          req.jwt = {
            encoded: token,
            decoded: tokenDecoded
          };

          if (auth === false && tokenDecoded) {
            return next(new Forbidden('Access reserved for unsigned users'));
          }

          if (auth && !tokenDecoded) {
            return next(new Forbidden('Access reserved for signed users'));
          }

          if (isArray(auth) && tokenDecoded) {
            tokenDecoded.roles = tokenDecoded.roles || [];

            if (auth[0] === 'U' && !auth.slice(1).reduce((r, curr) => !r || tokenDecoded.roles.indexOf(curr) > -1, true)) {
              return next(new Forbidden('Has not every roles needed: ' + auth.slice(1)));
            }

            if (!auth.reduce((r, curr) => r || tokenDecoded.roles.indexOf(curr) > -1, false)) {
              return next(new Forbidden('Has not one role needed: ' + auth));
            }
          }

          next();
        });
      }

      return {
        before: beforeEndpoint,
        after: afterEndpoint
      };
    }

    return { before, after };
  }

  static get registry() {
    const service = this;
    const entries = [];
    let {name, basepath, routes, auth} = service;

    basepath = basepath || '/';
    routes = routes || {};
    auth = auth || {};

    Object.keys(routes).forEach(endpoint => {
      if (!service.prototype[endpoint]) {
        throw new Error('Endpoint "' + name + '.' + endpoint + '" does not exist');
      }

      let endpoints = routes[endpoint];
      let hooks = service.hooks(endpoint);

      if (isString(endpoints)) {
        endpoints = [endpoints];
      }

      if (!isArray(endpoints)) {
        return;
      }

      endpoints.forEach(route => {
        let methodPos = route.indexOf(' ');
        let method = 'get';
        let routeAuth = auth[endpoint];

        if (isUndefined(routeAuth)) {
          routeAuth = null;
        }

        if (isString(routeAuth)) {
          routeAuth = [routeAuth];
        }

        if (methodPos > -1) {
          method = route.substring(0, methodPos).toLowerCase();
          route = route.substring(methodPos + 1);
        }

        route = normalizeSlashes([basepath, route].join('/'), true, false);

        const entry = {
          service,
          name,
          path: route,
          method,
          endpoint,
          hooks,
          auth: routeAuth
        };

        if (method === '*') {
          JOKER_METHODS
            .map(value => value.toLowerCase())
            .forEach(value => {
              entries.push(Object.assign({}, entry, { method: value }));
            });

          return;
        }

        entries.push(entry);
      });
    });

    return entries;
  }

  constructor(app) {
    this.app = app;
    this.restau = app.restau;
  }

  handler(entry) {
    const service = this;
    const {path, method, endpoint, hooks, auth} = entry;
    const {before, after} = hooks;
    const endpointFn = service[endpoint];
    const flow = [];

    if (!endpointFn) {
      throw new Error('ENDPOINT_MISSING ' + serviceName + '.' + endpoint);
    }

    flow.push(function (req, res, next) {
      req.app.restau = service.app.restau;
      res.ok = responseOk;
      res.ko = responseKo;
      Object.assign(res, CUSTOM_RESPONSES);
      next();
    });

    flow.push.apply(flow, before);

    flow.push(function (req, res, next) {
      let output = endpointFn.call(service, req, res, next);

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

            return nextPromise(result, req, res, next);
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

  setup(app) {

  }
};
