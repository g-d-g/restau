'use strict';

const CustomError = require('./Error');
const {responseKo} = require('../utils');

module.exports = function (options) {
  return function (err, req, res, next) {
    if (err instanceof Error && !err.toJSON) {
      err = new CustomError(err);
    }

    if (err instanceof Error && err.toJSON) {
      let errorOutput;
      let errorJson = err.toJSON();
      let {code, msg, data} = errorJson;
      let stack;

      code = code || 500;
      msg = msg !== 'Error' ? msg : undefined;
      stack = err.original ? err.original.stack : err.stack;
      errorOutput = responseKo.call(res, code, msg, data);

      if (code >= 500 && req.app.get('env') !== 'production') {
        errorOutput.stack = stack;
      }

      if (code >= 500) {
        console.error(stack);
      }

      return res.send(errorOutput);
    }

    next(err);
  };
};
