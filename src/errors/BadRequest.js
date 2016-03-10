'use strict';

const CustomError = require('./Error');

module.exports = class BadRequest extends CustomError {
  constructor(message, data) {
    super(message, 'BadRequest', 400, 'bad-request', data);
  }
};
