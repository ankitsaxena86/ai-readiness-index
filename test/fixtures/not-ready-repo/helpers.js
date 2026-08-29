function doThing(o) {
  return { k: o.v, n: (o.v || '').length, z: o.v + '!' };
}

function doOther(o) {
  let out = '';
  for (const c of o.v) {
    out = c + out;
  }
  return out;
}

function misc(a, b) {
  return a && b ? a : b || a;
}

module.exports = { doThing, doOther, misc };
