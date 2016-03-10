'use strict';

const CustomError = require('./Error');
const BadRequest = require('./BadRequest');
const Unauthorized = require('./Unauthorized');
const PaymentRequired = require('./PaymentRequired');
const Forbidden = require('./Forbidden');
const NotFound = require('./NotFound');
const MethodNotAllowed = require('./MethodNotAllowed');
const NotAcceptable = require('./NotAcceptable');
const Conflict = require('./Conflict');
const UnprocessableEntity = require('./UnprocessableEntity');
const InternalServerError = require('./InternalServerError');
const NotImplemented = require('./NotImplemented');
const RequestTimeout = require('./RequestTimeout');
const ServiceUnavailable = require('./ServiceUnavailable');
const ValidationError = require('./ValidationError');
const handler = require('./handler');

module.exports = Object.assign(CustomError, {
  CustomError,
  BadRequest,
  Unauthorized,
  PaymentRequired,
  Forbidden,
  NotFound,
  MethodNotAllowed,
  NotAcceptable,
  Conflict,
  UnprocessableEntity,
  InternalServerError,
  NotImplemented,
  RequestTimeout,
  ServiceUnavailable,
  handler
});
