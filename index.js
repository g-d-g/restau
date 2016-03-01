'use strict';

const bootstrap = require('./bootstrap');
const express = require('express');
const http = require('http');
const {isFunction, isObject, isString} = require('core-util-is');


// XXX MAIN >
const app = restau()
              .start();
              // app.server.on('listening', () => console.log('LISTEN', app.get('port')));
// XXX < MAIN


function restau(options) {
  if (isString(options)) {
    options = {
      basedir: options
    };
  }

  options = options || {};
  options.configFolder = arguments.length > 1 && arguments[1];

  const app = express();

  behavior.call(app, behavior)
    .behavior({ configure, start })
    .configure(bootstrap(options));

  return app;
}

function behavior(name, method) {
  const app = this;

  if (isObject(name)) {
    Object.keys(name).forEach(n => behavior.call(app, n, name[n]));
    return app;
  }

  if (isFunction(name)) {
    method = name;
    name = method.name;
  }

  if (app[name]) {
    throw new Error('key already in used: ' + name);
  }

  app[name] = method.bind(app);

  return app;
}

function configure(fn) {
  const app = this;

  fn.call(app);

  return app;
}

function start(port, host) {
  const self = this;
  const app = express().use(this);
  const server = http.createServer(app);

  app.on('start', () => {
    host = host || self.get('host');
    port = port || self.get('port');

    server.listen(port, host);
  });

  return server;
}

// function injectModels() {
//   const app = this;
//   let config = app.get('models');
//
//   if (!config) {
//     return;
//   }
//
//   if (!app.connectors) {
//     throw new Error('No database connectors');
//   }
//
//   const models = require(config);
//
//   Object.keys(models).forEach(name => {
//     const model = models[name];
//     const connectorName = model.connector ||  'default';
//     const connector = app.connectors[connectorName];
//
//     models[name] = model.bindKnex(connector);
//   });
//
//   app.models = models;
// }
