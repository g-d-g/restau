'use strict'

const ObjectionModel = require('objection').Model;

module.exports = class Model extends ObjectionModel {
  static isModel(obj) {
    return obj instanceof Model;
  }

  static isModelSubclass(obj) {
    return obj && obj.prototype instanceof Model;
  }

  $beforeInsert() {
    this.created_at = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }
};
