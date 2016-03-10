'use strict';

const errors = require('./errors');
const restau = require('./restau');
const Model = require('./Model')
const ModelService = require('./ModelService')
const Service = require('./Service')

module.exports = Object.assign(restau, {
  restau,
  Model,
  ModelService,
  Service,
  errors
});
