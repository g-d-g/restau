'use strict';

module.exports = class Service {
  static isService(obj) {
    return obj instanceof Service;
  }

  static isServiceSubclass(obj) {
    return obj && obj.prototype instanceof Service;
  }

  static get basepath() {
    return '/';
  }

  static get auth() {
    return;
  }

  static get endpoints() {
    return;
  }

  static get before() {
    return;
  }

  static get after() {
    return;
  }

  constructor(app) {
    this.app = app;
  }

  setup(app) {

  }
};
