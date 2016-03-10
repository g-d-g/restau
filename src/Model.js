'use strict'

const ObjectionModel = require('objection').Model;

module.exports = class Model extends ObjectionModel {
  static isModel(obj) {
    return obj instanceof Model;
  }

  static isModelSubclass(obj) {
    return obj && obj.prototype instanceof Model;
  }
};
