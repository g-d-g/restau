'use strict';

const CustomError = require('./Error');

module.exports = class NotFound extends CustomError {
  constructor(message, data) {
    super(message, 'NotFound', 404, 'not-found', data);
  }
};
