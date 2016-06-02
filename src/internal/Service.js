'use strict';

const Constants = require('../Constants');
const Endpoint = require('./Endpoint');
const InternalMiddleware = require('./Middleware');
const express = require('express');
const utils = require('../utils');

const {
  checkIsClassWithId,
  fromPairs,
  inheritProperty,
  isArray,
  isBoolean,
  isClass,
  isFunction,
  isObject,
  isString,
  normalizeSlashes
} = utils;

const {
  d,
  SERVICE_STUB_KEYS,
  JOKER,
  JOKER_METHODS,
  DEFAULT_AUTH_RULE,
  DEFAULT_AUTOROUTE,
  DEFAULT_BASEPATH,
  DEFAULT_METHOD,
  ENDPOINT_SEPARATOR,
  METHOD_SEPARATOR,
  RULE_SEPARATOR
} = Constants;

module.exports = class InternalService extends InternalMiddleware {
  static isModelOrService = true;
  static isService = true;
  static kind = 'service';

  classes = {};
  instances = {};
  // router = null;

  init(clazz) {
    checkIsClassWithId(clazz);

    super.init(clazz);

    defineProperty(this, {
      id: clazz.id || clazz.name,
      basepath: normalizeBasepath(clazz.basepath || DEFAULT_BASEPATH),
      auth: normalizeAuth(clazz.auth),
      hooks: {
        after: normalizeHooks(clazz.after),
        before: normalizeHooks(clazz.before)
      },
      autoroute: clazz.autoroute || DEFAULT_AUTOROUTE,
      routes: normalizeRoutes(clazz.endpoints),
      inputs: normalizeInputs(clazz.inputs)
    });

    if (this.autoroute) {
      Object.getOwnPropertyNames(clazz.prototype)
        .filter(x => x !== 'constructor')
        .filter(x => !this.routes[x] || !this.routes[x].length)
        .forEach(x => {
          if (!this.routes[x]) {
            this.routes[x] = [];
          }

          this.routes[x].push([DEFAULT_METHOD, normalizeSlashes(x)]);
        });
    }
    this.endpoints = createEndpoints(this, clazz);
    // this.stub = createStub(this, clazz);

    return this;
  }

  get before() {
    return this.hooks.before;
  }

  get after() {
    return this.hooks.after;
  }

  get endpointsObject() {
    return fromPairs(this.endpoints.map(x => [x.id, x]));
  }

  get endpointsIds() {
    return this.endpoints.map(x => x.id);
  }

  get metas() {
    const {id, basepath, auth, hooks, autoroute, routes, endpoints} = this;

    return {id, basepath, auth, hooks, autoroute, routes, endpoints};
  }

  get stub() {
    return createStub(this, this.fn);
  }

  get concreteInstance() {
    const {endpoints} = this;
    const instance = new this.stub;
    const proto = instance.constructor.prototype;

    endpoints.forEach(x => proto[x.id] = x.concreteHandler(instance));

    return instance;
  }

  get remoteInstance() {
    const {endpoints} = this;
    const instance = new this.stub;
    const proto = instance.constructor.prototype;

    endpoints.forEach(x => proto[x.id] = x.remoteHandler(instance));

    return instance;
  }

  router(type, instance) {
    const proto = instance.constructor.prototype;
    const router = express();

    d('ROUTER %s (%s)', this.id, type);

    this.endpoints.forEach(endpoint => {
      d('  %s:', endpoint.id);

      const routes = endpoint.routes;
      const mw = endpoint[type](proto[endpoint.id], instance);

      routes.forEach(([method, path]) => {
        d('    %s %s', method, path);

        router[method.toLowerCase()](path, mw);
      });
    });

    return router;
  }

  mount(R, parent) {
    const id = this.id;
    const instance = R.services[id];
    const router = this.router('concreteMiddleware', instance);

    parent.services[id] = instance;

    return router;
  }

  mountRemote(R, parent, client) {
    const {id, endpoints} = this;
    const instance = this.remoteInstance;
    const router = this.router('remoteMiddleware', instance);

    Object.assign(instance.constructor, { client });

    parent.services[id] = instance;

    return router;
  }
};

function createEndpoints(service, clazz) {
  return Object.getOwnPropertyNames(clazz.prototype)
    .filter(key => key !== 'constructor')
    .map(key => Endpoint.new({
      id: key,
      fn: clazz.prototype[key],
      service
    }))
    .filter(x => x.routes.length);
}

function createStub(service, clazz) {
  const stub = class StubService extends clazz {
    static get internal() {
      return service;
    }

    static get name() {
      return this.id;
    }

    static get after() {
      return this.hooks.after;
    }

    static get before() {
      return this.hooks.before;
    }
  };

  SERVICE_STUB_KEYS.forEach(x => stub[x] = service[x]);
  service.endpoints.forEach(x => stub.prototype[x.id] = null);

  return stub;
}

function defineProperty(obj, key, value) {
  if (isObject(key)) {
    Object.keys(key).forEach(x => defineProperty(obj, x, key[x]));
    return;
  }

  Object.defineProperty(obj, key, {
    value,
    configurable: false,
    enumerable: true,
    writable: false
  });
}

function normalizeAuth(auth) {
  const normalized = {};

  if (!isObject(auth) || isArray(auth)) {
    auth = { [JOKER]: auth };
  }

  auth = Object.assign({ [JOKER]: DEFAULT_AUTH_RULE }, auth);

  Object.keys(auth).forEach(key => {
    let endpoints = key;
    let rule = auth[key];

    endpoints = key.split(ENDPOINT_SEPARATOR).map(x => x.trim());

    if (isString(rule)) {
      rule = rule.split(RULE_SEPARATOR).map(x => x.trim());
    }

    if (!isBoolean(rule) && !isArray(rule)) {
      rule = DEFAULT_AUTH_RULE;
    }

    endpoints.forEach(endpoint => normalized[endpoint] = rule);
  });

  return normalized;
}

function normalizeBasepath(basepath) {
  if (!isString(basepath)) {
    return DEFAULT_BASEPATH;
  }

  return normalizeSlashes(basepath, true, false);
}

function normalizeInputs(inputs) {
  const normalized = {};

  Object.keys(inputs).forEach(x => {
    const value = inputs[x];

    x.split(ENDPOINT_SEPARATOR)
      .map(key => key.trim())
      .forEach(key => normalized[key] = value);
  });

  return normalized;
}

function normalizeHooks(hooks) {
  const normalized = {};

  if (!isObject(hooks) || isArray(hooks)) {
    hooks = { [JOKER]: hooks };
  }

  hooks = Object.assign({ [JOKER]: [] }, hooks);

  Object.keys(hooks).forEach(key => {
    let endpoints = key;
    let mws = hooks[key];

    endpoints = key.split(ENDPOINT_SEPARATOR).map(x => x.trim());

    if (!isArray(mws)) {
      mws = [mws];
    }

    mws = mws.filter(isFunction);

    endpoints.forEach(endpoint => normalized[endpoint] = mws);
  });

  return normalized;
}

function normalizeRoutes(endpoints) {
  const normalized = {};

  if (isObject(endpoints)) {
    Object.keys(endpoints).forEach(key => {
      let keys = key.split(ENDPOINT_SEPARATOR).map(x => x.trim());
      let routes = endpoints[key];

      if (isString(routes)) {
        routes = routes.split(ENDPOINT_SEPARATOR).map(x => x.trim());
      }

      if (!isArray(routes)) {
        return;
      }

      routes.forEach(route => {
        let method = DEFAULT_METHOD;

        if (isArray(route) && route.length === 2) {
          method = route[0];
          route = route[1];
        } else {
          let methodPos = route.lastIndexOf(' ');

          if (methodPos > -1) {
            method = route.substring(0, methodPos);
            route = route.substring(methodPos + 1);
          }
        }

        method = method.toUpperCase();
        route = normalizeSlashes(route, true, false);

        if (method === JOKER) {
          method = JOKER_METHODS;
        }

        if (isString(method)) {
          method = method.split(METHOD_SEPARATOR).map(x => x.trim());
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
