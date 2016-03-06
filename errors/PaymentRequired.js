'use strict';

const CustomError = require('./Error');

module.exports = class PaymentRequired extends CustomError {
  constructor(message, data) {
    super(message, 'PaymentRequired', 402, 'payment-required', data);
  }
};
