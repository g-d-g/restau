'use strict';

const CustomError = require('./Error');

module.exports = class Forbidden extends CustomError {
  constructor(message, data) {
    super(message, 'Forbidden', 403, 'forbidden', data);
  }
};
