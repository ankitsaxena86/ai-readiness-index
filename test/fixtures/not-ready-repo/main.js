const h = require('./helpers');
const s = require('./stuff');

function run(x) {
  let r = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i].t == 1) {
      r.push(h.doThing(x[i]));
    } else if (x[i].t == 2) {
      r.push(s.other(x[i]));
    } else {
      r.push(x[i]);
    }
  }
  return r;
}

function go() {
  const d = [{ t: 1, v: 'a' }, { t: 2, v: 'b' }, { t: 3, v: 'c' }];
  console.log(run(d));
}

go();

module.exports = { run, go };
