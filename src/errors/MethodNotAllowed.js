'use strict';

const CustomError = require('./Error');

module.exports = class MethodNotAllowed extends CustomError {
  constructor(message, data) {
    super(message, 'MethodNotAllowed', 405, 'method-not-allowed', data);
  }
};
