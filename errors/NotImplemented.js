'use strict';

const CustomError = require('./Error');

module.exports = class NotImplemented extends CustomError {
  constructor(message, data) {
    super(message, 'NotImplemented', 501, 'not-implemented', data);
  }
};
