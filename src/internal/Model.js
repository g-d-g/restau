'use strict';

const InternalMiddleware = require('./Middleware');
const utils = require('../utils');

const {
  checkIsClassWithId
} = utils;

module.exports = class Model extends InternalMiddleware {
  static isModel = true;
  static isModelOrService = true;
  static kind = 'model';

  init(clazz) {
    checkIsClassWithId(clazz);
  }

  mount(R, parent) {

  }
};
