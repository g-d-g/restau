'use strict';

const Service = require('./Service');
const {isString} = require('core-util-is');

module.exports = ModelService;

function ModelService(modelName, basepath) {
  if (!isString(modelName) || !modelName.length) {
    throw new Error('No model name');
  }

  if (!isString(basepath) || !basepath.length) {
    basepath = modelName;
  }

  const clazz = class extends Service {

    static get name() {
      return modelName;
    }

    static get basepath() {
      return '/' + basepath;
    }

    static get routes() {
      return {
        find: 'GET /',
        get: 'GET /:id',
        create: 'POST /',
        updateAll: 'PUT /',
        update: 'PUT /:id',
        patchAll: 'PATCH /',
        patch: 'PATCH /:id',
        removeAll: 'DELETE /',
        remove: 'DELETE /:id'
      };
    }

    get model() {
      return this.app.restau.models[modelName];
    }

    find(req, res, next) {
      return this.model.query();
    }

    get(req, res, next) {
      const id = req.params.id;

      return this.model.query().findById(id)
        .then(userFound => userFound || res.ko(404));
    }

    create(req, res, next) {
      const data = req.body;
      return this.model.query().insert(data);
    }

    updateAll(req, res, next) {
      return res.ko(403, 'With Great Power Comes Great Responsibility');
    }

    update(req, res, next) {
      const id = req.params.id;
      const data = req.body;

      return this.model.query().updateAndFetchById(id, data)
        .then(userUpdated => userUpdated || res.ko(404));
    }

    patchAll(req, res, next) {
      return res.ko(403, 'With Great Power Comes Great Responsibility');
    }

    patch(req, res, next) {
      const id = req.params.id;
      const data = req.body;

      return this.model.query().patchAndFetchById(id, data)
        .then(userPatched => userPatched || res.ko(404));
    }

    removeAll(req, res, next) {
      return res.ko(403, 'With Great Power Comes Great Responsibility');
    }

    remove(req, res, next) {
      const id = req.params.id;

      return this.model.query().deleteById(id)
        .then(count => count && res.ok({ count }) || res.ko(404));
    }
  };

  return clazz;
}
