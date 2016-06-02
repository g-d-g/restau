'use strict';

module.exports = class Service {
  static isInstance(obj) {
    return obj instanceof this;
  }

  static isSubclass(obj) {
    return obj && obj.prototype instanceof this;
  }

  static id = null;
  static basepath = '/';
  static auth = {};
  static before = {};
  static after = {};
  static autoroute = false;
  static endpoints = {};
  static inputs = {};

  setup(app, config) {
    this.app = app;
    this.config = config;
    console.log('SETTTUUUUUUUUP', this.constructor.id, config)
  }
};
