import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {packMapGeometry} from './map-geometry-packs.mjs';

const base = await fs.mkdtemp('D:/CodexTemp/nsp-map-packs-');
const gzip = value => gzipSync(Buffer.from(JSON.stringify(value)), {level: 9});
const read = async file => JSON.parse(gunzipSync(await fs.readFile(file)));
const digest = value => createHash('sha256').update(value).digest('hex');
async function write(root, file, data) {await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true}); await fs.writeFile(path.join(root, file), file.endsWith('.gz') ? gzip(data) : JSON.stringify(data));}
async function fixture(root) {
  const assets = {};
  for (let i = 0; i < 145; i++) {
    const name = 'g' + i;
    await write(root, 'maps/data/assets/' + name + '.json.gz', {positions: [0, 0.12345678912345678, i, 1, -0.00000000123, 2], indices: [0, 1, 0], normals: [1, 0, 0], uvs: [0.012345678901234567, 0]});
    assets[name] = {geometry: '../../assets/' + name + '.json.gz', material: {texture: 'texture.png', opacity: 0.30000000001}};
  }
  const negativeZero = path.join(root, 'maps/data/assets/g0.json.gz');
  await fs.writeFile(negativeZero, gzipSync(Buffer.from(gunzipSync(await fs.readFile(negativeZero)).toString().replace('{"positions"', '{"largeInteger":900719925474099312345,"positions"').replace('"positions":[0,', '"positions":[-0,')), {level: 9}));
  await write(root, 'maps/data/assets/large.json.gz', {positions: Array.from({length: 150000}, (_, i) => Math.sin(i) * 1234.56789123), indices: [0, 1, 2]});
  assets.large = {geometry: '../../assets/large.json.gz'};
  assets.g1.lod = {lowGeometry: '../../assets/g144.json.gz', distance: 17.123456789};
  for (const name of ['one', 'two']) {
    const prefix = 'maps/data/maps/' + name + '/';
    const mapAssets = name === 'one' ? assets : {g1: {geometry: '../../assets/../assets/g1.json.gz', material: {opacity: 0.7}}};
    await write(root, prefix + 'manifest.json.gz', {schemaVersion: 1, mapId: name, assets: mapAssets, chunks: [{url: 'chunks/0.json.gz'}], buildings: [{roofGroupId: 'roof'}], pois: {url: 'pois.json.gz'}, notes: ['../../assets/g0.json.gz']});
    await write(root, prefix + 'chunks/0.json.gz', {batches: (name === 'one' ? ['g1', 'g2', 'g0', ...Object.keys(assets)] : ['g1']).map(assetId => ({assetId, roofGroupId: 'roof', instances: [[0.123456789123, 2, 3, 0, 0, 0, 1, 1, 1, 1]]}))});
    await write(root, prefix + 'pois.json.gz', {points: [{id: 'point', position: [1, 2, 3], parts: [{geometry: '../../assets/g0.json.gz', material: {alphaTest: 0.041999999433755875}}]}]});
    const poi = path.join(root, prefix + 'pois.json.gz');
    await fs.writeFile(poi, gzipSync(Buffer.from(gunzipSync(await fs.readFile(poi)).toString().replace('"position":[1,', '"position":[-0,')), {level: 9}));
  }
  await write(root, 'maps/data/maps.json', ['one', 'two'].map(id => ({id, manifest: 'maps/' + id + '/manifest.json.gz'})));
}
const one = path.join(base, 'one'), two = path.join(base, 'two'); await fixture(one); await fixture(two);
const originals = new Map();
for (const name of await fs.readdir(path.join(one, 'maps/data/assets'))) originals.set(name, await fs.readFile(path.join(one, 'maps/data/assets', name)));
const before = await read(path.join(one, 'maps/data/maps/one/manifest.json.gz'));
const poiBefore = await read(path.join(one, 'maps/data/maps/one/pois.json.gz'));
const chunkBefore = await fs.readFile(path.join(one, 'maps/data/maps/one/chunks/0.json.gz'));
const result = await packMapGeometry(one), repeated = await packMapGeometry(two);
assert(result.packCount >= 3); assert.equal(result.packedGeometryCount, 145); assert.equal(result.oversized.length, 1);
assert.deepEqual(result, repeated, 'Content IDs and gzip bytes must not depend on output directory');
assert.equal(result.packs[0].entryIds[0], digest('maps/data/assets/g1.json.gz'), 'Chunk first co-occurrence defines pack order');
let literalFound = false;
for (const pack of result.packs) {
  const bytes = await fs.readFile(path.join(one, pack.path)), other = await fs.readFile(path.join(two, pack.path));
  assert.deepEqual(bytes, other); assert(bytes.length <= result.limits.gzipBytes);
  const raw = gunzipSync(bytes), data = JSON.parse(raw); assert(raw.length <= result.limits.decodedBytes);
  literalFound ||= raw.includes(Buffer.from('900719925474099312345'));
  assert.equal(data.schemaVersion, 1); assert(Object.keys(data.geometries).length <= result.limits.geometries);
  assert.equal(digest(raw), pack.sha256);
}
assert(literalFound, 'Integer literal beyond JS safe range must not be rounded during compaction');
async function restored(root, manifestFile, ref) {
  const [file, id] = ref.split('#'); const target = path.resolve(path.dirname(manifestFile), file);
  const data = await read(target); return id ? data.geometries[id] : data;
}
for (const name of ['one', 'two']) {
  const file = path.join(one, 'maps/data/maps', name, 'manifest.json.gz'), data = await read(file);
  for (const [id, asset] of Object.entries(data.assets)) {
    assert.deepEqual(await restored(one, file, asset.geometry), JSON.parse(gunzipSync(originals.get(id + '.json.gz'))));
    if (asset.lod) assert.deepEqual(await restored(one, file, asset.lod.lowGeometry), JSON.parse(gunzipSync(originals.get('g144.json.gz'))));
  }
  const poi = await read(path.join(path.dirname(file), 'pois.json.gz'));
  assert(Object.is(poi.points[0].position[0], -0), 'POI position negative zero must remain intact');
  assert.deepEqual(await restored(one, file, poi.points[0].parts[0].geometry), JSON.parse(gunzipSync(originals.get('g0.json.gz'))));
}
const after = await read(path.join(one, 'maps/data/maps/one/manifest.json.gz'));
assert.equal(after.assets.large.geometry, before.assets.large.geometry);
assert.deepEqual(after.assets.g1.material, before.assets.g1.material);
assert.deepEqual(after.buildings, before.buildings); assert.deepEqual(after.notes, before.notes);
const poiAfter = await read(path.join(one, 'maps/data/maps/one/pois.json.gz'));
poiAfter.points[0].parts[0].geometry = poiBefore.points[0].parts[0].geometry;
assert.deepEqual(poiAfter, poiBefore, 'All non-geometry POI fields remain identical');
assert.deepEqual(await fs.readFile(path.join(one, 'maps/data/maps/one/chunks/0.json.gz')), chunkBefore);
const shared = await read(path.join(one, 'maps/data/maps/two/manifest.json.gz'));
assert.equal(after.assets.g1.geometry, shared.assets.g1.geometry, 'Shared canonical source uses one pack entry');
for (const [name, bytes] of originals) assert.deepEqual(await fs.readFile(path.join(one, 'maps/data/assets', name)), bytes);
const again = await packMapGeometry(one); assert.equal(again.packCount, 0, 'Already packed refs remain stable');
const invalid = path.join(base, 'invalid'); await fixture(invalid);
await fs.unlink(path.join(invalid, 'maps/data/assets/g3.json.gz'));
await assert.rejects(packMapGeometry(invalid));
await assert.rejects(fs.stat(path.join(invalid, 'maps/data/geometry-packs')));
await assert.rejects(packMapGeometry(fileURLToPath(new URL('../public/', import.meta.url))), /generated copy/);
const link = path.join(base, 'linked'); await fs.symlink(one, link, process.platform === 'win32' ? 'junction' : 'dir');
await assert.rejects(packMapGeometry(link), /symbolic links|junctions/);
console.log(JSON.stringify({status: 'PASS',fixture: base,checks: ['complete geometry deep equality', 'count/compressed/decoded limits', 'oversized standalone fallback', 'LOD and POI links', 'canonical shared entry', 'deterministic gzip/hash', 'materials/roof/instances/other strings unchanged', 'source bytes preserved', 'idempotent packed refs', 'invalid input produces no output'],packs: result.packCount}));
