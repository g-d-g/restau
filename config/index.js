'use strict';

const convict = require('convict');
const deepAssign = require('deep-assign');
const fs = require('fs');
const {isBoolean, isNumber, isObject, isString} = require('core-util-is')
const middlewares = require('./middlewares');
const path = require('path');
const schema = require('./schema');

const BASEURL_KEY = 'baseurl';
const CONNECTORS_KEY = 'database';
const ENV_KEY = 'env';
const HOST_KEY = 'host';
const MIDDLEWARES_KEY = 'middlewares';
const MOUNTPATH_KEY = 'mountpath';
const PORT_KEY = 'port';
const PROTOCOL_KEY = 'protocol';

const DEFAULT_BASEDIR = process.cwd();
const DEFAULT_BASEURL = ['{', PROTOCOL_KEY, '}://{', HOST_KEY, '}:{', PORT_KEY, '}'].join('');
const DEFAULT_CONFIG_FOLDER = 'config';
const DEFAULT_CONFIG_NAME = 'default';

convict.addFormat({
  name: 'placeholder',
  validate: function(val) {
    if (!isString(val)) {
      throw new Error('Expects a string');
    }
  },
  coerce: function(val, config) {
    return val.replace(/\{([\w\.]+)}/g, function(v,m) { return config.get(m); });
  }
});

exports = module.exports = configuration;
exports.middlewares = middlewares;
exports.schema = schema;

function configuration(basedir, configFolder) {
  basedir = basedir || DEFAULT_BASEDIR;
  configFolder = configFolder || DEFAULT_CONFIG_FOLDER;

  const confdir = path.join(basedir, configFolder);
  const config = convict(schema);
  const env = config.get(ENV_KEY);
  const files = [];

  files.push(path.join(confdir, DEFAULT_CONFIG_NAME));

  if (env !== DEFAULT_CONFIG_NAME) {
    files.push(path.join(confdir, env));
  }

  files
    .map(foundConfig)
    .filter(configPath => !!configPath)
    .forEach(configPath => {
      if (configPath.endsWith('.js')) {
        config.load(require(configPath));
      } else {
        config.loadFile(configPath)
      }
    });

  if (!config.get(BASEURL_KEY)) {
    config.set(BASEURL_KEY, DEFAULT_BASEURL);
  }

  normalizeConnectors(config);
  normalizeMiddlewares(config);
  resolvePaths(config, basedir);

  config.validate();

  return config.get();
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

function foundConfig(filePath) {
  if (fileExists(filePath)) {
    return filePath;
  }

  return ['js', 'json'].reduce((result, ext) => {
    const fileTested = [filePath, ext].join('.');

    if (!result && fileExists(fileTested)) {
      return fileTested;
    }

    return result;
  }, null);
}

function normalizeConnectors(config) {
  let db = config.get(CONNECTORS_KEY);

  if (!db) {
    return config;
  }

  const env = config.get('env');
  const connectors = {};

  if (db === true) {
    db = ['.', 'data', [env, 'sqlite3'].join('.')].join(path.sep);
  }

  if (isString(db)) {
    db = {
      client: 'sqlite3',
      connection: {
        filename: db
      }
    };
  }

  if (isObject(db) && db.client && db.connection) {
    db = {
      'default': db
    };
  }

  Object.keys(db).forEach(name => connectors[name] = db);

  config.set(CONNECTORS_KEY, db);

  return config;
}

function normalizeMiddlewares(config) {
  const mwConfig = convict(middlewares);
  const userMws = config.get(MIDDLEWARES_KEY);

  if (isObject(userMws)) {
    Object.keys(userMws).forEach(name => {
      let mw = userMws[name];

      if (isBoolean(mw)) {
        mw = {
          enabled: mw
        };
      }

      if (isNumber(mw)) {
        mw = {
          enabled: true,
          priority: mw
        };
      }

      if (Array.isArray(mw)) {
        mw = {
          enabled: true,
          module: {
            arguments: mw
          }
        }
      }

      if (isString(mw) && mwConfig.has(name)) {
        mw = {
          enabled: true,
          module: {
            name: mw,
            arguments: []
          }
        };
      }

      if (isObject(mw)) {
        const overrideArgs = mw.module && mw.module.arguments;
        mw = deepAssign({}, mwConfig.get(name), mw);

        if (overrideArgs) {
          mw.module.arguments = overrideArgs;
        }
      }

      mwConfig.set(name, mw);
    })
  }

  config.set(MIDDLEWARES_KEY, mwConfig.get());

  return config;
}

function resolvePaths(config, basedir) {
  function walkAndResolve(obj, parent) {
    Object.keys(obj).forEach(key => {
      let value = obj[key];
      const keyPath = !parent ? key : [parent, key].join('.');

      if (isObject(value)) {
        value = walkAndResolve(value, keyPath);
      }

      if (isString(value) && (value.startsWith('.' + path.sep) || value.startsWith('..' + path.sep))) {
        value = path.join(basedir, value);
        config.set(keyPath, value);
      }
    });
  }

  walkAndResolve(config.get());

  return config;
}
