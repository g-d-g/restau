'use strict';

const caller = require('caller');
const debug = require('debug');
const {dirname, join, sep} = require('path');
const flatten = require('arr-flatten');
const getValue = require('get-value');
const {isArray, isBoolean, isFunction, isNumber, isObject, isString, isUndefined} = require('core-util-is');
const mapObject = require('map-obj');
const request = require('request');
const setValue = require('set-value');

const ANONYMOUSE_CLASS_NAMES = [
  '_class'
];

module.exports = {
  sep,
  caller,
  checkIsClassWithId,
  compose,
  debug,
  deprecateMethod,
  dirname,
  findKeyWhichContains,
  flatten,
  forEachKey,
  fromPairs,
  getValue,
  inheritMethod,
  inheritProperty,
  isArguments,
  isArray,
  isBoolean,
  isClass,
  isFunction,
  isNil,
  isNumber,
  isObject,
  isPromise,
  isString,
  isUndefined,
  isntNil,
  join,
  mapObject,
  // mixin,
  normalizeSlashes,
  request,
  requireSafe,
  resolvePath,
  setValue,
  toArray,
  tryParseJSON
};

function checkIsClassWithId(obj) {
  if (!isClass(obj)) {
    throw new Error('CLASS_REQUIRED');
  }

  const id = obj.id || obj.name;

  if (!isString(id) || !id.length || ANONYMOUSE_CLASS_NAMES.indexOf(id) > -1) {
    throw new Error('ID_MISSING');
  }
}

function compose() {
  const args = toArray(arguments);
  const stack = flatten(args);
  const thisArg = this;

  for (const handler of stack) {
    if (!isFunction(handler)) {
      throw new TypeError('Handlers must be a function');
    }
  }

  return function middleware(req, res, done) {
    let index = 0;

    function next(err) {
      if (index === stack.length) {
        return done(err);
      }

      const handler = stack[index++];

      if (handler.length === 4) {
        if (err) {
          handler.call(thisArg, err, req, res, next);
        } else {
          next(err);
        }
      } else {
        if (err) {
          next(err);
        } else {
          handler.call(thisArg, req, res, next);
        }
      }
    }

    next();
  };
}


function deprecateMethod(obj, ancient, successor) {
  if (isObject(ancient)) {
    Object.keys(ancient).forEach(x => deprecateMethod(obj, x, ancient[x]));
    return obj;
  }

  obj[ancient] = (function () {
    console.error(`DEPRECATED USAGE
> The method "${ancient}" is deprecated
> Please use "${successor}" instead
> Check in file ${caller()}`);

    return this[successor].apply(this, toArray(arguments));
  }).bind(obj);

  return obj;
}

function findKeyWhichContains(obj, value) {
  return Object.keys(obj).find(x => obj[x].indexOf(value) > -1);
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

  pairs = pairs.filter(x => x.length);

  if (!pairs.length) {
    return {};
  }

  return pairs
    .map(pair => ({ [pair[0]]: !isUndefined(pair[1]) ? pair[1] : pair[0] }))
    .reduce((prev, curr) => Object.assign(prev, curr));
}

function inheritMethod(from, to, key) {
  if (isArray(key)) {
    key.forEach(x => inheritMethod(from, to, x));
    return to;
  }

  let origin = to[key];

  while (origin && isFunction(origin.origin)) {
    origin = origin.origin;
  }

  to[key] = from[key].bind(from);

  if (origin) {
    to[key].origin = origin.bind(to);
  }

  return to;
}

function inheritProperty(from, to, key) {
  if (isArray(key)) {
    key.forEach(x => inheritProperty(from, to, x));
    return to;
  }

  Object.defineProperty(to, key, {
    enumerable: true,
    get: () => from[key]
  });

  return to;
}

function isArguments(obj) {
  return obj && !isArray(obj) && !!obj[Symbol.iterator];
}

function isClass(obj) {
  return obj && isFunction(obj.constructor) && isObject(obj.prototype);
}

function isNil(obj) {
  return !isntNil(obj);
}

function isPromise(obj) {
  return obj && isFunction(obj);
}

function isntNil(obj) {
  return !!obj;
}

function normalizeSlashes(str, starts, ends) {
  if (isArray(str)) {
    str = str.join('/');
  }

  if (isUndefined(starts)) {
    starts = true;
  }

  if (isUndefined(ends)) {
    ends = false;
  }

  str = str || '/';

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
    str = str.split('/')
      .map(x => x.trim())
      .filter(x => !!x).join('/');
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

function requireSafe(filepath) {
  try {
    return require(filepath);
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND' || err.message.indexOf(filepath) === -1) {
      throw err;
    }
  }
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

function resolvePath(basepath, obj) {
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

function tryParseJSON(str) {
  var result = str;

  try {
    if (isString(result)) {
      result = JSON.parse(result);
    }
  } catch (e) {

  }

  return result;
}
