function other(o) {
  const m = {};
  m[o.t] = o.v;
  m.x = Object.keys(m).length;
  return m;
}

function process2(list) {
  return list.map(function (e) {
    return other(e);
  });
}

function thing3(a) {
  var total = 0;
  for (var k in a) {
    total += a[k];
  }
  return total;
}

module.exports = { other, process2, thing3 };
