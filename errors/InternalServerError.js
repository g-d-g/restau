'use strict';

const CustomError = require('./Error');

module.exports = class InternalServerError extends CustomError {
  constructor(message, data) {
    super(message, 'InternalServerError', 500, 'internal-server-error', data);
  }
};
