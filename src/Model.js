'use strict'

const ObjectionModel = require('objection').Model;

module.exports = class Model extends ObjectionModel {
  static isInstance(obj) {
    return obj instanceof this;
  }

  static isSubclass(obj) {
    return obj && obj.prototype instanceof this;
  }

  static get id() {
    return this.name;
  }

  $beforeInsert() {
    this.created_at = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }
};
