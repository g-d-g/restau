'use strict';

const restau = require('.');

class HelloWorld extends restau.Service {
  static id = 'hello';
  static basepath = '/hello';
  static endpoints = {
    sayHello: ['* /', '* /:who']
  };

  sayHello(inputs, dialog) {
    return 'hello ' + (inputs.who || 'world');
  }
}



restau({
    config: {
      services: {
        hello: {
          foo: 'bar'
        }
      }
    },
    port: 1337
  })
  .use(HelloWorld)
  .listen();

// $ node example.js
//
// $ curl http://localhost:1337/hello
// hello world
//
// $ curl http://localhost:1337/hello/jd
// hello jd
