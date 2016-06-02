'use strict';

// TODO Model         [ ]
// TODO ModelService  [ ]
// TODO extendService [ ]
// TODO split utils into separate files [ ]

const Constants = require('./Constants');
const Model = require('./Model');
const ModelService = require('./ModelService');
const Service = require('./Service');
const errors = require('./errors');
const internal = require('./internal');
const utils = require('./utils');

const {
  caller,
  dirname,
  isNumber,
  isString
} = utils

module.exports = restau;

function restau(options) {
  options = isNumber(options) ? { port: options } : options;
  options = isString(options) ? { basedir: options } : options;
  options = options || {};
  options.basedir = options.basedir || dirname(caller());
  options = Object.assign({ basedir: undefined }, options);

  return internal.Restau.new(options).app;
}

Object.keys(Constants)
  .forEach(key => Object.defineProperty(restau, key, {
    enumerable: true,
    get: () => Constants[key],
    set: (value) => { Constants[key] = value }
  }));

Object.assign(restau, {
  restau,
  Constants,
  Model,
  ModelService,
  Service,
  errors,
  internal,
  utils
});
