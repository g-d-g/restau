'use strict';

module.exports = function errorHandler(err, req, res, next) {
  next(err);
};
