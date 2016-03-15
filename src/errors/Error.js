'use strict';

const ExtendableError = require('es6-error');
const ValidationError = require('./ValidationError');

module.exports = class CustomError extends ExtendableError {
  constructor(msg, name, code, className, data) {
    msg = msg || 'Error';

    let errors;
    let message;
    let newData;
    let original;

    if (typeof msg === 'number') {
      let tmp = msg;
      msg = name;
      name = code;
      code = tmp;
    }

    if (msg instanceof ValidationError) {
      message = 'validation error with fields ' + Object.keys(msg.data);
      code = msg.statusCode;
      data = { fields: msg.data };
    }
    else if (msg instanceof Error) {
      original = msg;
      message = msg.message || 'Error';
      code = code || msg.code || msg.statusCode;
      // NOTE (EK): This is typically to handle validation errors
      if (msg.errors) {
        errors = msg.errors;
      }
    }
    // Support plain old objects
    else if (typeof msg === 'object') {
      message = msg.message || 'Error';
      data = msg;
    }
    // message is just a string
    else {
      message = msg;
    }

    if (typeof name === 'object') {
      data = name;
      name = undefined;
    }

    if (typeof code === 'object') {
      data = code;
      code = undefined;
    }

    if (typeof className === 'object') {
      data = className;
      className = undefined;
    }

    if (data) {
      // NOTE(EK): To make sure that we are not messing
      // with immutable data, just make a copy.
      // https://github.com/feathersjs/feathers-errors/issues/19
      newData = Object.assign({}, data);

      if (newData.errors) {
        errors = newData.errors;
        delete newData.errors;
      }
    }

    super(message);

    // NOTE (EK): Babel doesn't support this so
    // we have to pass in the class name manually.
    // this.name = this.constructor.name;
    this.type = 'CustomError';
    //  this.name = name;
    //  this.message = message;
    this.msg = message;
    this.code = code;
    this.className = className;
    this.data = newData;
    this.errors = errors || {};
    this.original = original;
  }

  // NOTE (EK): A little hack to get around `message` not
  // being included in the default toJSON call.
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      msg: this.msg,
      code: this.code,
      className: this.className,
      data: this.data,
      errors: this.errors
    };
  }
};
