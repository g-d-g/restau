'use strict';

const Service = require('./Service');
const {isFunction, isString, isUndefined} = require('./utils');

class AbstractModelService extends Service {
  static get name() {
    throw new Error('You must override the "name" getter');
  }

  static get basepath() {
    throw new Error('You must override the "basepath" getter');
  }

  get model() {
    throw new Error('You must override the "model" getter');
  }

  static get endpoints() {
    return {
      find: 'GET /',
      search: 'POST /search',
      create: 'POST /',
      updateAll: 'PUT /',
      patchAll: 'PATCH /',
      removeAll: 'DELETE /',
      get: 'GET /:id',
      update: 'PUT /:id',
      patch: 'PATCH /:id',
      remove: 'DELETE /:id'
    };
  }

  find(req, res, next) {
    return this.model.query().where(req.query);
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

  search(req, res, next) {
    let {criteria, output} = req.body;
    let formatting = x => x;

    if (!isUndefined(req.query.count)) {
      formatting = x => ''+x.length;
    }

    if (!isUndefined(req.query.ids)) {
      formatting = x => x.map(i => i.id);
    }

    if (!isUndefined(req.query.field)) {
      formatting = x => x.map(i => i[req.query.field]);
    }

    return this.model.filterWithCriteria(criteria, output)
      .then(formatting);
  }
};

function createModelService(modelName, basepath) {
  if (isFunction(modelName)) {
    modelName = modelName.name;
  }

  if (!isString(modelName) || !modelName.length) {
    throw new Error('No model name');
  }

  if (!isString(basepath) || !basepath.length) {
    basepath = modelName;
  }

  return class extends AbstractModelService {
    static get name() {
      return modelName;
    }

    static get basepath() {
      return '/' + basepath;
    }

    get model() {
      return this.app.models[modelName];
    }
  };
}

module.exports = Object.assign(createModelService, { AbstractModelService });
