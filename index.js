'use strict';

const errors = require('./errors');
const restau = require('./restau');
const Model = require('./Model')
const ModelService = require('./ModelService')
const Service = require('./Service')

module.exports = Object.assign(restau, {
  restau,
  Model,
  ModelService,
  Service,
  errors
});

// TODO
// api public .client(headers) pour retourner une api permettant de
// d'exécuter des requêtes http vers les services existants
//
// api public .remote(String, headers) pour retourner un middleware interceptant
// les routes des services et exécutant la requête vers le service
// distant avec le client
//
// ModelService
// static get idField = id
// static get tableName = name
// static get schema
// static get disable
//
// TODO gérer l'authentification
//
// TODO "client" ou proxy vers un service distant
// à ce moment là toutes les routes du registre
// pointent sur un service externe
// + paramètres de config de screws
//    { remote: { url, headers }}
// TODO le paramètre change la création du handlerFlow
//   en mode "remote" on transfert la requête vers
//   un service distant et affiche le résultat en brut
//
// TODO utiliser endgame
// endgame(options.uncaughtException);
//
// TODO lorsque l'on inject les services dans app.services,
// il faut créer app.services[endpoint][get|post|patch] ???
