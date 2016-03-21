'use strict';

const CustomError = require('./Error');
const {isNumber, isObject, isString, responseKo} = require('../utils');

module.exports = function (options) {
  return function (err, req, res, next) {
    if (isString(err)) {
      try {
        err = JSON.parse(err);
      } catch (e) {}
    }

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
      err = responseKo.call(res, code, msg, data);

      if (code >= 500 && req.app.get('env') !== 'production') {
        err.stack = stack;
      }
    }

    if (isObject(err) && err.code) {
      let code = isNumber(err.code) && err.code < 600 ? err.code : 500;

      if (code >= 500) {
        console.error(err.stack || err.message);
      }

      return res.status(code).json(err);
    }

    next(err);
  };
};
