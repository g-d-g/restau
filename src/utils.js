'use strict';

const caller = require('caller');
const camelCase = require('to-camel-case');
const clone = require('clone');
const {compose} = require('compose-middleware');
const debug = require('debug');
const deepAssign = require('deep-assign');
const {dirname, join, sep} = require('path');
const flatten = require('arr-flatten');
const http = require('http');
const {isArray, isBoolean, isFunction, isNumber, isObject, isString, isUndefined} = require('core-util-is');
const mapObject = require('map-obj');
const {mixin} = require('uberproto');
const setValue = require('set-value');

const DEFAULT_ACCESSOR = {
  configurable: false,
  enumerable: true,
  get: () => { throw new Error('getter missing'); },
  set: () => { throw new Error('setter missing'); }
};

const DEFAULT_ERROR_STATUS = 500;
const DEFAULT_RESPONSE_STATUS = 200;
const SUCCESS_WHEN_STATUS_LT = 400;
const SEP = sep;
const STATUS_CODES = http.STATUS_CODES;
const CUSTOM_RESPONSE_CODES = [201, 202, 204, 400, 401, 402, 403, 404, 405, 406, 408, 409, 422, 500, 501, 503];
const CUSTOM_RESPONSES = createCustomResponses(CUSTOM_RESPONSE_CODES);


module.exports = {
  CUSTOM_RESPONSE_CODES,
  CUSTOM_RESPONSES,
  DEFAULT_ERROR_STATUS,
  DEFAULT_RESPONSE_STATUS,
  SEP,
  STATUS_CODES,
  SUCCESS_WHEN_STATUS_LT,
  caller,
  camelCase,
  clone,
  compose,
  createCustomResponses,
  debug,
  deepAssign,
  defineAccessor,
  dirname,
  flatten,
  forEachKey,
  fromPairs,
  isArguments,
  isArray,
  isBoolean,
  isFunction,
  isNil,
  isNumber,
  isntNil,
  isObject,
  isString,
  isUndefined,
  join,
  mapObject,
  mixin,
  omit,
  normalizeSlashes,
  requireSafe,
  resolvePath,
  resolveUrlParams,
  responseKo,
  responseOk,
  setValue,
  slice,
  toArray,
  toPairs
};

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
    .map(fromPairs)
    .reduce((r, curr) => Object.assign(r, curr));
}

function defineAccessor(obj, prop, descriptor, setter) {
  descriptor = descriptor || {};
  descriptor = isFunction(descriptor) ? { get: descriptor } : descriptor;
  descriptor =  Object.assign({}, DEFAULT_ACCESSOR, descriptor || {})

  if (setter) {
    descriptor.set = setter;
  }

  Object.defineProperty(obj, prop, descriptor);
}

function forEachKey(keys, obj, fn) {
  return keys.map(key => obj[key])
    .filter(isntNil)
    .forEach(value => fn(value));
}

function fromPairs(pairs) {
  if (!isArray(pairs)) {
    pairs = [arguments[0], arguments[1]];
  }

  if (!isArray(pairs[0])) {
    pairs = [pairs];
  }

  return pairs
    .map(pair => setValue({}, pair[0], pair[1]))
    .reduce((prev, curr) => Object.assign(prev, curr));
}

function isArguments(obj) {
  return obj && !isArray(obj) && !!obj[Symbol.iterator];
}

function isNil(value) {
  return !isntNil(value);
}

function isntNil(value) {
  return !!value;
}

function normalizeSlashes(str, starts, ends) {
  if (isUndefined(starts)) {
    starts = true;
  }

  if (isUndefined(ends)) {
    ends = false;
  }

  const protocolPos = str.indexOf('://');
  let baseurl;

  if (protocolPos > -1) {
    let baseurlPos;
    baseurlPos = protocolPos > -1 && str.indexOf('/', protocolPos + 3);
    baseurlPos = baseurlPos === -1 ? str.length : baseurlPos;

    baseurl = str.substring(0, baseurlPos);
    str = str.substring(baseurlPos);
  }

  if (str.length && str !== '/') {
    str = str.split('/').filter(x => !!x).join('/');
  }

  if (!baseurl && starts === true && !str.startsWith('/')) {
    str = '/' + str;
  }

  if (baseurl) {
    str = str === '/' ? baseurl : [baseurl, str].join('/');
  }

  if (ends === true && !str.endsWith('/')) {
    str = str + '/';
  }

  return str;
}

function omit(obj, omittedKeys) {
  if (isString(omittedKeys)) {
    omittedKeys = [omittedKeys];
  }

  const keys = Object.keys(obj);

  if (keys.length === 1) {
    return omittedKeys.indexOf(keys[0]) > -1 ? {} : obj;
  }

  return keys
    .filter(key => omittedKeys.indexOf(key) === -1)
    .map(key => fromPair(key, obj[key]))
    .reduce((r, curr) => Object.assign(r, curr));
}

function requireSafe(filepath) {
  try {
    return require(filepath);
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND' || err.message.indexOf(filepath) === -1) {
      throw err;
    }
  }
}


function resolvePath(basepath, value) {
  const resolver = (obj) => {
    if (isArray(obj)) {
      return obj.map(value => resolvePath(basepath, value));
    }

    if (isObject(obj)) {
      return mapObject(obj, (key, value) => [key, resolvePath(basepath, value)]);
    }

    if (isString(obj) && (obj.startsWith('.') || obj.startsWith('..'))) {
      return join(basepath, obj);
    }

    return obj;
  };

  if (value) {
    return resolver(value);
  }

  return resolver;
}

function resolveUrlParams(path, args) {
  const reqPath = [];
  let pathParsed = path;
  let paramsCount = path.split(':').length - 1;

  if (!paramsCount) {
    reqPath.push(path);
  }

  if (paramsCount) {
    if (args.length < paramsCount) {
      throw new Error('MISSING_ARGS');
    }

    while (paramsCount--) {
      const doubleDot = pathParsed.indexOf('/:');
      const slash = pathParsed.indexOf('/', doubleDot + 1);

      reqPath.push(pathParsed.substring(0, doubleDot + 1));
      reqPath.push(args.shift());

      pathParsed = slash > -1 ? pathParsed.substring(slash) : null;

      if (paramsCount === 0 && pathParsed) {
        reqPath.push(pathParsed);
      }
    }
  }

  return reqPath.join('');
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

function toArray(obj) {
  if (isArguments(obj)) {
    obj = obj.length === 1 ? [obj[0]] : Array.apply(null, obj);
  }

  if (isObject(obj)) {
    obj = Object.keys(obj).map(key => obj[key]);
  }

  if (obj && !isArray(obj)) {
    obj = [obj];
  }

  return obj;
}

function toPairs(obj) {
  if (isObject(obj)) {
    obj = Object.keys(obj).map(key => [key, obj[key]]);
  }

  return obj;
}
