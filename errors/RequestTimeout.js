'use strict';

const CustomError = require('./Error');

module.exports = class RequestTimeout extends CustomError {
  constructor(message, data) {
    super(message, 'RequestTimeout', 408, 'request-timeout', data);
  }
};
