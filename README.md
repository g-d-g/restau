# restau

> Express and fast microservice

## Installation

```bash
npm install restau --save
```

## Example

```javascript
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

```

## TODO

* Populate created_at and updated_at in Model
* Support multiple methods in service routes (like post|put /foo)

## License

MIT
