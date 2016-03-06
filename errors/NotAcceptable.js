'use strict';

const CustomError = require('./Error');

module.exports = class NotAcceptable extends CustomError {
  constructor(message, data) {
    super(message, 'NotAcceptable', 406, 'not-acceptable', data);
  }
};
