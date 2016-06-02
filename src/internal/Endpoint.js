'use strict';

const Constants = require('../Constants');
const utils = require('../utils');

const {
  compose,
  flatten,
  isFunction,
  isPromise,
  isString,
  isUndefined,
  normalizeSlashes
} = utils;

const {
  PRIVATE_ATTR_PREFIX,
  JOKER,
  DEFAULT_METHOD
} = Constants;

module.exports = class Endpoint {
  static new(props) {
    return new this(props);
  }

  constructor(props) {
    const {id, fn, service} = props;

    if (!isString(id) || !id.length) {
      throw new Error('ID_MISSING');
    }

    if (!service) {
      throw new Error('SERVICE_REQUIRED');
    }

    Object.keys({ id, fn, service }).forEach(key => Object.defineProperty(this, key, {
      value: props[key],
      configurable: false,
      enumerable: true,
      writable: false
    }));

    return this;
  }

  get auth() {
    return getAuthFrom(this.service.auth, this.id);
  }

  get hooks() {
    const {after, before} = this;

    return {after, before};
  }

  get after() {
    return getHooksFrom(this.service.hooks.after, this.id);
  }

  get before() {
    return getHooksFrom(this.service.hooks.before, this.id);
  }

  get baseroutes() {
    return getRoutesFrom(this.service.routes, this.id);
  }

  get inputs() {
    return this.service.inputs[this.id] || {};
  }

  get metas() {
    const {id, auth, hooks, routes, fn} = this;

    return {id, auth, hooks, routes, fn};
  }

  get routes() {
    return this.baseroutes
      .map(([m, r]) => [m, this.service.basepath + r])
      .map(([m, r]) => [m, normalizeSlashes(r)]);
  }

  getInputs(inputs) {
    return Object.assign({}, this.inputs, inputs);
  }

  concreteHandler(concreteService) {
    const {id, fn, service} = this;

    if (!fn) {
      throw new Error('ENDPOINT_MISSING ' + service.id + '.' + id);
    }

    return (inputs, dialog) => {
      const {req, res, next} = dialog
      let output = fn.call(concreteService, this.getInputs(inputs), dialog);

      if (!isPromise(output)) {
        output = Promise.resolve(output);
      }

      return output;
    };
  }

  concreteMiddleware(concreteHandler, concreteService) {
    const {service, before, after} = this;
    const beforeMiddleware = createHooksExecutor(concreteService, before);
    const afterMiddleware = createHooksExecutor(concreteService, after);
    let flow = [];

    return (req, res, next) => {
      const dialog = {req, res, next};

      beforeMiddleware(getReqInputs(req), dialog)
        .then(inputs => concreteHandler(inputs, dialog))
        .then(data => {
          if (data instanceof Error) {
            throw data;
          }

          res.data = data;

          return afterMiddleware(data, dialog);
        })
        .then(result => {
          if (result instanceof Error) {
            throw result;
          }

          res.result = result;

          // TODO custom response wrapper
          // > move to Restau.mount because it has (R, parent)
          //     used for options
          // if (isFunction(options.responseWrapper)) {
          //   result = options.responseWrapper(result, req, res);
          // }

          if (res.finished) {
            console.error('WARN %s.%s: response already sent', service.id, this.id);
          } else {
            res.send(result);
            // next();
          }
        })
        .catch(next);
    };
  }

  remoteHandler(remoteService) {
    return (inputs, dialog) => {
      const {req, res, next} = dialog;
      const {headers} = req;
      let request = remoteService.constructor.client[this.id];

      if (req && req.method) {
        request = request[req.method.toLowerCase()];
      }

      request(inputs, { headers })
        .then(x => {
          res.send(x);
        })
        .catch(x => res.send('ERR '+x));
    };
  }

  remoteMiddleware(remoteHandler, remoteService) {
    return (req, res, next) => remoteHandler.call(
      remoteService,
      getReqInputs(req),
      {req, res, next}
    );
  }
};

function getReqInputs(req) {
  req = req || {};

  return Object.assign({}, req.body, req.query, req.params);
}

function getAuthFrom(auth, id) {
  let rule = auth[id];

  if (isUndefined(rule)) {
    rule = auth[JOKER];
  }

  return rule;
}

function getHooksFrom(hooks, id) {
  return flatten([].concat(hooks[JOKER], hooks[id]))
    .filter(x => isFunction(x));
}

function getRoutesFrom(routes, id) {
  return routes[id] || [];
}

function createHooksExecutor(instance, hooks) {
  const promises = hooks.map(fn => (inputs, dialog) => {
    let output = fn.call(instance, inputs, dialog);

    if (isUndefined(output)) {
      output = inputs;
    }

    if (!isPromise(output)) {
      output = Promise.resolve(output);
    }

    return output
      .then(result => {
        if (result instanceof Error) {
          throw result;
        }

        return result;
      })
      .catch(dialog.next);
  });

  return (inputs, dialog) => {
    const {req, res, next} = dialog;

    return new Promise((resolve, reject) => {
      [Promise.resolve(inputs)].concat(promises)
        .reduce((currentPromise, nextPromise) => {
          return currentPromise.then(result => {
            if (result instanceof Error) {
              return Promise.reject(result);
            }

            if (res.finished) {
              return Promise.resolve(result);
            }

            return nextPromise.call(instance, result, dialog);
          });
        })
        .then(resolve)
        .catch(reject);
    });
  };
}
