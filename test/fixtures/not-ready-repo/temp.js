const x = require('./main');

x.go();

function test1() {
  const r = x.run([{ t: 1, v: 'z' }]);
  if (r.length !== 1) {
    console.log('bad');
  }
}

test1();
