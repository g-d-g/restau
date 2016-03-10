'use strict';

const CustomError = require('./Error');

module.exports = class Conflict extends CustomError {
  constructor(message, data) {
    super(message, 'Conflict', 409, 'conflict', data);
  }
};
