'use strict';

const debug = require('debug')('feathers-errors');

// feathers-errors @ v2.0.1
// NOTE (EK): Babel doesn't properly support extending
// some classes in ES6. The Error class being one of them.
// Node v5.0+ does support this but until we want to drop support
// for older versions we need this hack.
// http://stackoverflow.com/questions/33870684/why-doesnt-instanceof-work-on-instances-of-error-subclasses-under-babel-node
// https://github.com/loganfsmyth/babel-plugin-transform-builtin-extend

module.exports = class CustomError extends Error {
 constructor(msg, name, code, className, data) {
   msg = msg || 'Error';

   let errors;
   let message;
   let newData;

   if (msg instanceof Error) {
     message = msg.message || 'Error';

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
   this.name = name;
   this.message = message;
   this.code = code;
   this.className = className;
   this.data = newData;
   this.errors = errors || {};

   debug('%s(%d): %s', this.name, this.code, this.message);
 }

 // NOTE (EK): A little hack to get around `message` not
  // being included in the default toJSON call.
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      className: this.className,
      data: this.data,
      errors: this.errors
    };
  }
 }
