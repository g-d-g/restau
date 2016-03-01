'use strict';

module.exports =  {
  shutdown: {
    enabled: false,
    priority: 0,
    module: {
      name: __dirname + '/../middlewares/shutdown',
      arguments: [
        {
          timeout: 30 * 1000,
          template: null
        }
      ]
    }
  },
  compress: {
    enabled: false,
    priority: 10,
    module: {
      name: 'compression'
    }
  },
  favicon: {
    enabled: true,
    priority: 30,
    module: {
      name: 'serve-favicon',
      arguments: [
        __dirname + '/../public/favicon.ico'
      ]
    }
  },
  static: {
    enabled: true,
    priority: 40,
    module: {
      name: 'serve-static',
      arguments:[
        __dirname + '/../public'
      ]
    }
  },
  logger: {
    enabled: true,
    priority: 50,
    module: {
      name: 'morgan',
      arguments: [
        'combined',
        {
          immediate: true
        }
      ]
    }
  },
  json: {
    enabled: true,
    priority: 60,
    module: {
      name: 'body-parser',
      method: 'json'
    }
  },
  urlencoded: {
    enabled: true,
    priority: 70,
    module: {
      name: 'body-parser',
      method: 'urlencoded',
      arguments: [
        {
          extended: true
        }
      ]
    }
  },
  multipart: {
    enabled: true,
    priority: 80,
    module: __dirname + '/../middlewares/multipart'
  },
  cookieParser: {
    enabled: false,
    priority: 90,
    module:{
      name: 'cookie-parser',
      arguments: [
        'keyboard cat'
      ]
    }
  },
  session: {
    enabled: false,
    priority: 100,
    module: {
      name: 'express-session',
      arguments: [
        {
          key: '',
          secret: 'keyboard cat',
          cookie: {
            path: '/',
            httpOnly: true,
            maxAge: null
          },
          resave: true,
          saveUninitialized: true,
          proxy: null
        }
      ]
    }
  },
  appsec: {
    enabled: true,
    priority: 110,
    module: {
      name: 'lusca',
      arguments: [
        {
          csrf: false,
          xframe: 'SAMEORIGIN',
          p3p: false,
          csp: false
        }
      ]
    }
  },
  router: {
    enabled: false,
    priority: 120,
    module: {
      name: 'express-enrouten',
      arguments: [
        {
          index: './routes'
        }
      ]
    }
  }
};
