'use strict'

const ObjectionModel = require('objection').Model;
const {fromPairs, getValue, isArray} = require('./utils');

module.exports = class Model extends ObjectionModel {
  static isModel(obj) {
    return obj instanceof Model;
  }

  static isModelSubclass(obj) {
    return obj && obj.prototype instanceof Model;
  }

  $beforeInsert() {
    this.created_at = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }

  static filterWithCriteria(criteria, output) {
    return filterWithCriteria(this, criteria, output);
  }
};

const DEFAULT_CRITERION = {
  logic: 'AND',
  comparator: '='
};

const WHERE_FILTERS = {
  AND: 'where',
  // NAND: 'whereNot',
  OR: 'orWhere',
  // NOR: 'orWhereNot'
}

const WHERE_JSON_FILTERS = {
  AND: 'whereJsonField',
  OR: 'orWhereJsonField'
};

function normalizeCriterion(criterion) {
  criterion = criterion || {};

  if (criterion.key && criterion.key.indexOf('.')) {
    criterion.key = criterion.key.replace('.', ':');
  }

  if (criterion.logic) {
    criterion.logic = criterion.logic.toUpperCase();
  }

  return Object.assign({}, DEFAULT_CRITERION, criterion);
}

function filterWithCriteria(model, criteria, output) {
  criteria = criteria || [];
  let query = model.query();

  // if (!isArray(criteria)) {
    // console.log('DIIIIIIIIIIIIE', criteria)
  // }

  if (isArray(criteria)) {
    criteria
      .map(normalizeCriterion)
      .forEach(({ key, logic, comparator, value }) => {
        const json = key.indexOf(':') > -1;
        const filters = json ? WHERE_JSON_FILTERS : WHERE_FILTERS;
        const where = query[filters[logic]].bind(query);

        query = where(key, comparator, value);
      });
  }

  return query.then(result => {
    if (output) {
      if (isArray(output)) {
        output = fromPairs(output.map(x => [x, x]));
      }

      result = result.map(
        entry => fromPairs(
          Object.keys(output).map(key => [key, getValue(entry, output[key])])));
    }

    return result;
  });
}
