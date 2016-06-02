'use strict';

module.exports = class Middleware {
  static isModel = false;
  static isModelOrService = false;
  static isService = false;
  static kind = 'mw';

  static new(mountpath, fn) {
    return new this(mountpath, fn);
  }

  mountpath = null;

  constructor(mountpath, fn) {
    this.mountpath = mountpath;

    if (fn) {
      this.init(fn);
    }
  }

  get id() {
    return this.fn.name || '<anonymous>';
  }

  init(fn) {
    this.fn = fn;
  }

  mount(R, parent) {
    return this.fn;
  }
}
