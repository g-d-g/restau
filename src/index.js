'use strict';

const Model = require('./Model')
const ModelService = require('./ModelService')
const Service = require('./Service')
const errors = require('./errors');
const restau = require('./restau');
const utils = require('./utils');

module.exports = Object.assign(restau, {
  restau,
  Model,
  ModelService,
  Service,
  errors,
  utils
});
