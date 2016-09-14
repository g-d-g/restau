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
  static get name() {
    return 'hello';
  }

  static get basepath() {
    return '/hello';
  }

  static get endpoints() {
    return {
      sayHello: ['/', '/:who']
    };
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

```

## TODO

* Add .pipe() method to endpoint (example: services.foo.bar.pipe()) ???
* Add restau.configure (to add hooks dynamically for example)
* Fix "socket hand up" issue when remote service POST|PATCH|PUT was called with undefined body
* Insert real client IP in remote headers
* Move auth hook into /hooks/populateToken (when auth has value, it's called that new hook)
* Support service configuration in restau(options)

## License

MIT
