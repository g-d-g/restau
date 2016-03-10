'use strict';

const restau = require('.');

class HelloWorld extends restau.Service {
  static get name() {
    return 'hello';
  }

  static get basepath() {
    return '/hello'
  }

  static get routes() {
    return {
      sayHello: ['/', '/:who'],
    }
  }

  sayHello(req, res, next) {
    return 'hello ' + (req.params.who || 'world');
  }
}

restau()
  .use(HelloWorld)
  .listen(1337);

// $ node example.js
//
// $ curl http://localhost:1337/hello
// hello world
//
// $ curl http://localhost:1337/hello/jd
// hello jd
