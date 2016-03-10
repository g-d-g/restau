'use strict';

const CustomError = require('./Error');

module.exports = class ServiceUnavailable extends CustomError {
  constructor(message, data) {
    super(message, 'ServiceUnavailable', 503, 'service-unavailable', data);
  }
};
