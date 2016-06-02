
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const restau = require('.');
const express = require('express');
const {internal, Model, ModelService, Service} = restau;







class Foo extends Service {
  static id = 'foo';
  static basepath = '/ / / /  foo /  / / /';
  static auth = {
    // bar: false,
    // 'foobar,bar': '  ta   ',
    // '    *   ,   x , y': null,
  };
  // static after = [
  //   function (output, {req, res, next}) { console.log('AFTER', output, this.constructor.auth); return 'y'; },
  //   function (output, {req, res, next}) { console.log('AFTER2', output); }
  // ]
  // static after = [function (r, req, res, next) { console.log('AFTER', this, r); return 'y'; }, function (r, req, res, next) { console.log('AFTER2', this, r); return 'z' }];
  static before = [
    // function (inputs, dialog) { console.log('BEFORE1', this.abc(), inputs); return {z:'z'}},
    function (inputs, dialog) { console.log('BEFORE2', inputs); }
  ];
  static autoroute = false;
  static endpoints = {
    bar: ['* hella', '* hella/:bax'],
    foo: [['get', 'foo'], 'post foox']
  }
  static inputs = {
    foo: {
      x:'y'
    },
    bar: {
      a: 'b'
    }
  };

  abc() {
    return '--abc--';
  }

  foo(inputs, dialog) {
    console.log('IN FOO', inputs)
    return 'foo' + this.abc();
  }

  bar(inputs, dialog) {
    // dialog.res.status(404);
    // const dial = { res, req, next };
    console.log('11', { inputs })
    // return 'bibi';
    // return {foo:'bar'};
    // XXX
    // XXX ERROR! normalement il devrait y avoir le remote XYZ
    // XXX
    console.log('IN BAR', this && this.app && this.app.services && Object.keys(this.app.services))
// console.log('::', this.constructor.inputs === this.constructor.internal.inputs)
    // return 'bar';
    // return this.app.services.XYZ.z(req, res, next);
    // console.log('XXX', this.foo())
    // return 'bar';/
    // var a,b;
    console.log('------')
    console.log('XXX', dialog.req.connection.remoteAddress, inputs)
    console.log('--')
    return this.foo(inputs, dialog)
      .then(x => x+'bar')
      // .then(x => { a = x; return this.app.services.XYZ.z(req, res, next); })
      // .then(x => { b = x; return a+'bar'+b; })
      // .catch(x => console.error('XXX', x.stack));
  }
}

class XYZ extends Service {
  static autoroute = true;

  x() { return 'x'; }
  y() { return 'y'; }
  z() { return 'z'; }
}


// process.exit();

// var x = internal.Service.new();
// x._endpoints.push({id:'foo'},{id:'bar'})
// x._auth.foo = 'bar';
// x.init(Foo);
// x.basepath = 'x';
// console.log(x.metas);
// console.log();
// console.log(x.endpointsObject.bar.metas);
var fs = require('fs');
const x = restau({
  'links': {
    foo: ['bar']
  },
  hostname: '0.0.0.0',
  port: 3001,
  // ssl: {
  //   // key: fs.readFileSync('./key.pem'),
  //   // cert: fs.readFileSync('./cert.pem'),
  //   passphrase: 'b3tsi',
  //   key: fs.readFileSync('./key.pem'),
  //   cert: fs.readFileSync('./cert.pem'),
  //   forwarder: 3000
  // },
  configuration: {a:'z'},
  'errorHandler': false
  // 'bodyparser': false
});

// const app = require('express')();
// var appB = restau().use('a', XYZ);

// x.bindModel('x', 'y')

x.use('x/y//', Foo)
  // .use(XYZ);
// x.use('a/b')
// console.log('DIIIE', x.services.foo.constructor.hooks)

x.use(function (req, res, next) {
  console.log('IN CUSTOM MW');
  // res.send('ok')
  // res.send('ok');
  next();
});

// x.listen();

//----------------------
var y = restau().use('_', XYZ);

y.listen(3002);

x.listen()
  .on('listening', () => {
    console.log('=========')
    var app = express();
    app.use('o', x.remote())//.use('_', XYZ);
    app.use('p', y.remote(3002))
    var app2 = express();
    app2.use('AAA', app);


    app2.listen(3010)
      .on('listening', () => {

        console.log('==========')
        app2.client(3010);
      });

  })
//--------------------

// console.log(app.restau.middlewares[0])
// restau().use('X', app.remote(3010)).listen(3020);

// x.addConnection(true)
// x//.set('body-parser', false)
//  .set('config', {services: {foo:{x:'y'}}})
//  .setConfig('services.foo', {a:'b'})
//  .setConfig('services.foo', {c:'d'})
 // .set('errorHandler', true)
 // .set('configuration', {x:{y:'z'}})

//  console.log('-- 1')
//  app.use('w', appB)
// app.use(x)
//
// console.log('-- 2')
// console.log('-- 3')



// var app2 = require('express')();
// app2.use('aaa', x)
//
// app.use('xxx', x).use('X', app);

// x.use('b', XYZ);

// var app = express();
// var appB = restau().use('b', XYZ);
// var appC = express().use('a', appB);
// console.log('---')
//
// app.use('X', x);
// console.log('-----------')
// app.use('_', appC)//.remote(3001))
// console.log('-----------')
//
// app.listen(3001);
//
// var app2 = restau();
// var app3 = restau();
// // var appZ = restau().use('bididi', XYZ);
// // x
// app2.use('A', app.remote(3001))
//   .listen(3010)
// console.log('===========')
// app3.use(app2.remote(3010))
// // app
// .listen(3020)
// .on('listening', function() {
//   console.log();
//   console.log(Object.keys(app2.services));
  // const c = app.client()//.$use(appZ.client(1234));
// // console.log(c)
// // });
//   // console.log('DIIIIE')
//   //
//   //
//   // console.log(c.$use(appB.client(1234)));
  // console.log('--')
  // console.log(c.foo)
  // c.foo.foo.get((x,y,z) => console.log(typeof z, z)).then(x => console.log(typeof x, x))
  // c.foo.bar.get((x,y,z) => console.log(typeof z, z)).then(x => console.log(typeof x, x))
  // c.XYZ.z.get((x,y,z) => console.log(typeof z, z)).then(x => console.log(typeof x, x))
  // console.log('--')
// });


// console.log('=====');
//
// var remoted = app2.remote();
//
// console.log('REMOTED', Object.keys(remoted.services));
//
// var appX = express().use('o', remoted);
// var appY = express();
//
// // appX.listen(3010)
// appY.use(appX)
//   .listen(3010)
//   .on('listening', () => {
//     console.log('@@@@@@', Object.keys(appY.services))
//   });
//
//
//
//
//
//
// // console.log('--', Object.keys(app2.services))
// // console.log('--')
// // console.log('--')
// //
//
// // console.log(app2.restau.basedir)
// // app
// // x.listen().on('listening', function() {
// //   // console.log('coucou', arguments)
// //   // console.log(x.settings)
// //   // console.log('--')
// //   // console.log(x.set(Foo, {x:'y'}))
// //   // console.log('--')
// //   // console.log(x.services[0].endpoints[0].metas)
// //   // console.log(require('express')().set.toString())
// // });
//
//
// //
// console.log(x);

// const EventEmitter = require('events');
//
// class X extends EventEmitter {
//
// }
//
// const y = new X;
// y.on('mount', parent => {
//   parent._router.stack.pop();
//   console.log('DIIIIE');
// });
// console.log('----')
// console.log(y);
//
// const a = require('express')();
//
// a.use(y);



// var x = new internal.Service;
// x.endpoints.push({id: 'foo'}, {id: 'bar'});
// console.log(x.id);
