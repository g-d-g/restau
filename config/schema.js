'use strict';

module.exports = {
  env: {
    format: String,
    default: 'development',
    env: 'NODE_ENV'
  },
  protocol: {
    format: ['http', 'https'],
    default: 'http'
  },
  host: {
    format: 'ipaddress',
    default: '127.0.0.1'
  },
  port: {
    format: 'port',
    default: 1337
  },
  baseurl: {
    format: 'placeholder',
    default: null
  },
  express: {
    mountpath: {
      format: String,
      default: '/'
    },
    'x-powered-by': {
      format: Boolean,
      default: true
    },
    'trust proxy': {
      format: Boolean,
      default: false
    },
    views: {
      format: String,
      default: './views'
    },
    'view cache': {
      format: Boolean,
      default: false
    }
  },
  database: {
    format: '*',
    default: true
  },
  middlewares: {
    format: Object,
    default: null
  }
};
