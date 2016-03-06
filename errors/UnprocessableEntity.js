'use strict';

const CustomError = require('./Error');

module.exports = class UnprocessableEntity extends CustomError {
  constructor(message, data) {
    super(message, 'UnprocessableEntity', 422, 'unprocessable-entity', data);
  }
};
