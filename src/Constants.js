'use strict';

var $ = module.exports = {
  d: require('debug')('restau'),

  APP_METHODS_DEPRECATED: {
    'binding': 'bindModel',
    'connection': 'addConnection'
  },
  APP_METHODS_INHERITED: [
    'addConnection',
    'binding',
    'bindModel',
    'client',
    'connection',
    'get',
    'getConfig',
    'listen',
    'remote',
    // 'resolvePath',
    'set',
    'setConfig',
    'use'
  ],
  APP_PROPS_INHERITED: [
    'basedir',
    'config',
    'db',
    // 'middlewares',
    'models',
    'services'
  ],
  SERVICE_STUB_KEYS: [
    'id',
    'basepath',
    'auth',
    'hooks',
    'autoroute',
    'routes',
    'inputs'
  ],

  JOKER: '*',
  JOKER_METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],

  DEFAULT_AUTH_RULE: null,
  DEFAULT_AUTOROUTE: false,
  DEFAULT_BASEPATH: '/',
  DEFAULT_CONNECTOR_NAME: 'default',
  DEFAULT_ENV_NAME: 'development',
  DEFAULT_HOST: '0.0.0.0',
  DEFAULT_HTTPS_PORT: 443,
  DEFAULT_METHOD: 'GET',
  DEFAULT_OPTION_BODYPARSER: {
    urlencoded: {
      extended: true
    },
    json: {

    }
  },
  DEFAULT_OPTION_ERROR_HANDLER: true,

  ENDPOINT_SEPARATOR: ',',
  METHOD_SEPARATOR: '|',
  MODEL_SEPARATOR: ',',
  RULE_SEPARATOR: ',',

  OPTION_BINDING_KEYS: [
    'binding',
    'bindModel',
    'bindModels',
    'links'
  ],
  OPTION_BODYPARSER_KEYS: [
    'bodyparser',
    'body-parser'
  ],
  OPTION_CONFIG_KEYS: [
    'conf',
    'config',
    'configuration'
  ],
  OPTION_CONNECTION_KEYS: [
    'connection',
    'connections',
    'db'
  ],
  OPTION_ERROR_HANDLER_KEYS: [
    'errorHandler',
    'errorhandler',
    'error-handler'
  ],
  OPTION_HOST_KEYS: [
    'host',
    'hostname',
    'ip'
  ],
  OPTION_MIDDLEWARE_KEYS: [
    'mws_head',
    'middleware',
    'middlewares',
    'mw',
    'mws',
    'model',
    'models',
    'service',
    'services',
    'mws_tail'
  ],
  OPTION_PORT_KEYS: [
    'port'
  ],
  OPTION_SSL_KEYS: [
    'secure',
    'security',
    'ssl'
  ]
};

defineProperty('OPTION_SETTINGS', () => {
  return {
    bodyparser: $.OPTION_BODYPARSER_KEYS,
    config: $.OPTION_CONFIG_KEYS,
    errorHandler: $.OPTION_ERROR_HANDLER_KEYS,
    host: $.OPTION_HOST_KEYS,
    port: $.OPTION_PORT_KEYS,
    ssl: $.OPTION_SSL_KEYS
  };
});

defineProperty('OPTION_SETTINGS_HIDDEN', () => {
  return [].concat($.OPTION_SSL_KEYS);
});

defineProperty('OPTION_SETTINGS_KEYS', () => {
  return Object.keys($.OPTION_SETTINGS)
    .map(x => $.OPTION_SETTINGS[x])
    .reduce((x, y) => x.concat(y));
});

defineProperty('OPTION_SETTINGS_MERGED', () => {
  return [].concat($.OPTION_CONFIG_KEYS);
});

function defineProperty(key, get) {
  Object.defineProperty($, key, {
    get,
    enumerable: true
  });
}
