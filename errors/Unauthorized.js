'use strict';

const CustomError = require('./Error');

module.exports = class Unauthorized extends CustomError {
  constructor(message, data) {
    super(message, 'Unauthorized', 401, 'unauthorized', data);
  }
};
