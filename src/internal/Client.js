'use strict';

const Constants = require('../Constants');
const Service = require('../Service');
const utils = require('../utils');

const {
  flatten,
  fromPairs,
  isArray,
  isFunction,
  isObject,
  isUndefined,
  normalizeSlashes,
  request,
  toArray,
  tryParseJSON
} = utils;

const {
  d
} = Constants;

const DEFAULT_CONTENT_TYPE = 'application/json';
const SUCCESS_WHEN_STATUS_LT = 400;
const CLIENT_INSTANCE_PROPERTY = '_client';
const CLIENT_USE_METHOD = '$use';

module.exports = class Client {
  static isInstance(obj) {
    return obj instanceof this;
  }

  constructor(options) {
    options = options || {};

    let {baseUrl, headers} = options;

    if (!baseUrl) {
      throw new Error('BASEURL_MISSING');
    }

    baseUrl = normalizeSlashes(baseUrl, false, false);

    d('CLIENT %s', baseUrl);

    this.baseUrl = baseUrl;
    this.store = {};
    this.request = request.defaults({ headers });
    this.use = this.use.bind(this);
    this.api = {};

    [[CLIENT_INSTANCE_PROPERTY, this], [CLIENT_USE_METHOD, this.use]]
      .forEach(([prop, value]) => Object.defineProperty(this.api, prop, {
        value,
        enumerable: false
      }));

    if (arguments.length > 1) {
      this.use(toArray(arguments).slice(1));
    }
  }

  addService(service) {
    const {baseUrl} = this;
    const clazz = service.constructor;
    const {id, internal} = clazz;
    const {endpoints} = internal;
    const mountpath = normalizeSlashes([clazz.mountpath, internal.mountpath]);

    let api = this.api[id];
    let store = this.store[id];

    if (!store) {
      store = this.store[id] = {};
    }

    if (!api) {
      api = this.api[id] = store;
    }

    endpoints.forEach(x => {
      // XXX s'il y a >=2 routes, on va créer deux handler (le 2eme écrase le 1er)
      x.routes.forEach(([method, path]) => {
        const url = normalizeSlashes([baseUrl, mountpath, path]);
        const handler = this.callEndpoint.bind(this, id, x.id, method, url);

        Object.assign(handler, { method, url });

        if (!store[x.id]) {
          store[x.id] = handler;
        }

        if (!api[x.id]) {
          api[x.id] = store[x.id];
        }

        method = method.toLowerCase();

        // if (!store[endpoint.id][method]) {
          store[x.id][method] = handler;
        // }

        // if (!api[endpoint.id][method]) {
          api[x.id][method] = store[x.id][method];
        // }

        d('%s.%s: %s %s', id, x.id, method, url);
      });
    });
  }

  callEndpoint(service, endpoint, method, uri, inputs, options, callback) {
    if (uri.indexOf('/:') > -1) {
      uri = uri.replace(/(\/:([^\s\/]+))/, (match, p1, p2) => {
        if (isUndefined(inputs[p2])) {
          throw new Error('PARAM_MISSING '+ p2  +' ('+ service +'.'+ endpoint +')');
        }

        return '/'+inputs[p2];
      });
    }

    if (isFunction(inputs)) {
      callback = inputs;
      inputs = undefined;
    }

    if (isFunction(options)) {
      callback = options;
      options = undefined;
    }

    inputs = inputs || {};
    options = options || {};

    callback = callback || options.callback;
    callback = isFunction(callback) ? callback : null;

    Object.assign(options, { method, uri, callback: null });

    const deferred = Promise.defer();
    const params = Object.assign({}, options, { method, uri });
    params.body = JSON.stringify(inputs);
    params.headers = params.headers || {};
    params.headers['content-length'] = params.body.length;
    params.headers['content-type'] = params.headers['content-type'] || DEFAULT_CONTENT_TYPE;

    d('REQ %s %s', method, uri);

    this.request(params, (err, res, body) => {
      body = tryParseJSON(body);

      if (!err && res.statusCode >= SUCCESS_WHEN_STATUS_LT) {
        err = body;
        body = null;
      }

      if (callback) {
        callback(err, res, body);
      }

      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(body);
      }
    });

    return deferred.promise;
  }

  use() {
    let obj = flatten(toArray(arguments)).filter(x => !!x);

    if (!obj.length) {
      return this.api;
    }

    if (obj.length > 1) {
      obj.forEach(x => this.use(obj));
      return this.api;
    }

    obj = obj[0];
    obj = obj && obj.restau ? obj.restau : obj;
    obj = obj && obj.services ? obj.services : obj;

    if (!!obj && this.constructor.isInstance(obj[CLIENT_INSTANCE_PROPERTY])) {
      obj = obj[CLIENT_INSTANCE_PROPERTY];
    }

    if (this.constructor.isInstance(obj)) {
      [this.store, this.api].forEach(x => Object.assign(x, obj.store));
      return this.api;
    }

    if (!!obj && !Service.isInstance(obj) && isObject(obj)) {
      Object.keys(obj).forEach(x => this.use(obj[x]));
      return this.api;
    }

    if (!Service.isInstance(obj) || !obj.constructor.internal) {
      // XXX nothing to load inda client
      // XXX throw error?
      return this.api;
    }

    this.addService(obj);

    return this.api;
  }
};
