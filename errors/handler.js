'use strict';

module.exports = function (options) {
  return function (err, req, res, next) {
    if (res.ko && err instanceof Error && err.code && err.toJSON) {
      const error = err.toJSON();
      const code = error.code;
      const message = error.message !== 'Error' ? error.message : undefined;

      return res.send(res.ko(code, message, error.data));
    }

    next();
  };
};
