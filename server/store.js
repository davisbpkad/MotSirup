const fs = require('node:fs');
const path = require('node:path');

function commitSnapshot(dir, snapshot) {
  if (!/^[a-z]+$/.test(snapshot.ppk) || snapshot.complete === false || !Array.isArray(snapshot.packages)) throw Error('Snapshot tidak lengkap/valid.');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, snapshot.ppk + '.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(snapshot), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}

function readSnapshots(dir, ppks) {
  return ppks.flatMap(p => {
    const file = path.join(dir, p.id + '.json');
    if (!fs.existsSync(file)) return [];
    return [JSON.parse(fs.readFileSync(file, 'utf8'))];
  });
}

module.exports = { commitSnapshot, readSnapshots };
