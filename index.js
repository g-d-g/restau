'use strict';

const {HOST_KEY, PORT_KEY} = require('./config');
const bootstrap = require('./bootstrap');
const caller = require('caller');
const configurator = require('./config');
const {createServer} = require('http');
const {dirname} = require('path');
const express = require('express');
const {isFunction, isObject, isString} = require('core-util-is');

// TODO ModelService
// défini des routes automatiques
// pour gérer un crud basique basé sur objection.js
//
// ModelService
// static get idField = id
// static get tableName = name
// static get schema
// static get disable

// TODO gérer l'authentification

// TODO "client" ou proxy vers un service distant
// à ce moment là toutes les routes du registre
// pointent sur un service externe
// + paramètres de config de screws
//    { remote: { url, headers }}
// TODO le paramètre change la création du handlerFlow
//   en mode "remote" on transfert la requête vers
//   un service distant et affiche le résultat en brut

// TODO utiliser endgame
// endgame(options.uncaughtException);

// XXX MAIN >

process.on('unhandledRejection', function (err) {
    throw err;
});

process.on('uncaughtException', function (err) {
  console.log('UNCAUGHT', err.stack);
});

const app = restau();

app
  .start()
  .on('listening', () => console.log('LISTEN', app.get('baseurl')));
// XXX < MAIN


function restau() {
  const args = Array.prototype.slice.call(arguments);
  const options = parseOptions.apply(null, args);

  options.basedir = options.basedir || dirname(caller());
  options.config = configurator(options.basedir, options.configFolder, options.config);

  const app = express();

  app.config = options.config;

  behavior.call(app, behavior)
    .behavior({ configure, start })
    .configure(bootstrap(options));

  return app;
}

function parseOptions() {
  const args = Array.prototype.slice.call(arguments);
  const options = {};

  if (isString(args[0])) {
    options.basedir = args[0];
  }

  if (isObject(args[0])) {
    Object.assign(options, args[0]);
  }

  if (isString(args[1])) {
    options.configFolder = args[1];
  }

  if (isObject(args[1])) {
    options.config = args[1];
  }

  if (isObject(args[2])) {
    options.config = args[2];
  }

  // options.onconfig = options.onconfig || noop; // OUI
  options.mountpath = options.mountpath || null; // OUI
  options.inheritViews = !!options.inheritViews;
  // options.startupHeaders
  // options.uncaughtException

  return options;
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
  const server = createServer(app);

  app.on('start', () => {
    host = host || self.get(HOST_KEY);
    port = port || self.get(PORT_KEY);

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
