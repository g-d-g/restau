'use strict';

module.exports = class Service {
  static get basepath() {
    return '/';
  }

  static get routes() {
    return;
  }

  static get before() {
    return;
  }

  static get after() {
    return;
  }

  static get auth() {
    return;
  }

  static hooks(endpoint) {
    let {before, after} = this;

    if (endpoint) {
      let beforeEndpoint = before && before[endpoint] || [];
      let afterEndpoint = after && after[endpoint] || [];

      if (!Array.isArray(beforeEndpoint)) {
        beforeEndpoint = [beforeEndpoint];
      }

      if (!Array.isArray(afterEndpoint)) {
        afterEndpoint = [afterEndpoint];
      }

      if (before && before['*']) {
        beforeEndpoint.unshift(before['*']);
      }

      if (after && after['*']) {
        afterEndpoint.push(after['*']);
      }

      beforeEndpoint = beforeEndpoint.filter(mw => !!mw);
      afterEndpoint = afterEndpoint.filter(mw => !!mw);

      return {
        before: beforeEndpoint,
        after: afterEndpoint
      };
    }

    return { before, after };
  }

  constructor(app) {
    this.app = app;
  }
};
