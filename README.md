# restau

> Express and fast microservice

## Installation

```bash
npm install restau --save
```

## Example

```javascript
'use strict';

const restau = require('restau');

class HelloWorld extends restau.Service {
  static id = 'hello';
  static basepath = '/hello';
  static endpoints = {
    sayHello: ['/', '/:who']
  };

  sayHello(inputs, dialog) {
    return 'hello ' + (inputs.who || 'world');
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
// $ curl http://localhost:1337/hello/foo
// hello foo
//
// $ curl http://localhost:1337/hello?who=bar
// hello bar

```

## TODO

* Fix "socket hand up" issue when remote service POST|PATCH|PUT was called with undefined body
* Insert real client IP in remote headers
* Move auth hook into /hooks/populateToken (when auth has value, it's called that new hook)

## License

MIT
