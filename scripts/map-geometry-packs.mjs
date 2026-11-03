import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {compactJSON} from './json-bytes.mjs';

const limits = {gzipBytes: 8 * 1024, decodedBytes: 128 * 1024, geometries: 16};
const hash = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.split(path.sep).join('/');
const json = bytes => JSON.parse((bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes).toString('utf8'));
const stringify = value => JSON.stringify(value, (_key, item) => Object.is(item, -0) ? JSON.rawJSON('-0') : item);

export async function packMapGeometry(publicRoot) {
  const root = path.resolve(publicRoot), indexFile = path.join(root, 'maps/data/maps.json');
  const sourcePublic = await fs.realpath(fileURLToPath(new URL('../public/', import.meta.url)));
  const contained = (parent, child) => {const rel = path.relative(parent, child); return !rel || (!rel.startsWith('..') && !path.isAbsolute(rel));};
  assert(!contained(sourcePublic, root) && !contained(root, sourcePublic), 'Geometry packing requires a generated copy, never source public');
  const checked = new Set();
  async function noLinks(file, allowMissing = false) {
    const pending = [];
    for (let current = path.resolve(file); !checked.has(current); current = path.dirname(current)) {pending.push(current); if (path.dirname(current) === current) break;}
    for (const current of pending.reverse()) {
      try {assert(!(await fs.lstat(current)).isSymbolicLink(), 'Geometry paths must not traverse symbolic links or junctions: ' + current); checked.add(current);}
      catch (error) {if (allowMissing && error.code === 'ENOENT') return; throw error;}
    }
  }
  async function read(file) {await noLinks(file); return fs.readFile(file);}
  await noLinks(root); await noLinks(path.join(root, 'maps/data/geometry-packs'), true);
  const relative = file => slash(path.relative(root, file));
  function resolve(ref, base) {
    assert.equal(typeof ref, 'string');
    const url = new URL(ref, pathToFileURL(base));
    assert.equal(url.protocol, 'file:', 'Geometry must remain a local asset');
    const source = fileURLToPath(url), file = process.platform === 'win32' ? source.toLowerCase() : source, rel = path.relative(root, file);
    assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'Map asset escapes the generated root');
    return {file, fragment: url.hash};
  }
  const index = JSON.parse((await read(indexFile)).toString('utf8'));
  assert(Array.isArray(index), 'Map index must be a list');
  const documents = [], refs = new Map(), order = [], encountered = new Set(), registered = new WeakMap();
  function reference(object, key, base, doc, ordered = false) {
    if (!object?.[key]) return;
    const fields = registered.get(object) || new Set();
    if (fields.has(key)) return;
    fields.add(key); registered.set(object, fields);
    const target = resolve(object[key], base);
    if (target.fragment) return; // Existing validated packs remain unchanged on a repeated build.
    if (!refs.has(target.file)) refs.set(target.file, []);
    refs.get(target.file).push({object, key, base, doc});
    if (ordered && !encountered.has(target.file)) {encountered.add(target.file); order.push(target.file);}
  }
  for (const entry of index) {
    const file = resolve(entry.manifest, indexFile).file, data = json(await read(file));
    const doc = {file, data, changed: false}; documents.push(doc);
    for (const chunk of data.chunks || []) {
      const content = json(await read(resolve(chunk.url, file).file));
      for (const batch of content.batches || []) {
        const asset = data.assets?.[batch.assetId];
        assert(asset, `Chunk references missing asset: ${batch.assetId}`);
        reference(asset, 'geometry', file, doc, true);
        reference(asset.lod, 'lowGeometry', file, doc, true);
      }
    }
    for (const asset of Object.values(data.assets || {})) {
      reference(asset, 'geometry', file, doc, true);
      reference(asset.lod, 'lowGeometry', file, doc, true);
    }
    if (data.pois?.url) {
      const poiFile = resolve(data.pois.url, file).file, poiData = json(await read(poiFile));
      const poiDoc = {file: poiFile, data: poiData, changed: false, parent: doc}; documents.push(poiDoc);
      for (const point of poiData.points || []) for (const part of point.parts || []) reference(part, 'geometry', file, poiDoc, true);
    }
  }
  const packs = [], assignments = new Map(), oversized = [], sourceGeometryFiles = [...refs.keys()].map(relative).sort();
  let current = {}, currentFiles = [];
  function encode(geometries) {const raw = Buffer.from('{"schemaVersion":1,"geometries":{' + Object.entries(geometries).map(([id, source]) => JSON.stringify(id) + ':' + source).join(',') + '}}'); return {raw, gzip: gzipSync(raw, {level: 9})};}
  function fits(encoded, count) {return count <= limits.geometries && encoded.raw.length <= limits.decodedBytes && encoded.gzip.length <= limits.gzipBytes;}
  function finish() {
    if (!currentFiles.length) return;
    const encoded = encode(current), digest = hash(encoded.raw), file = path.join(root, 'maps/data/geometry-packs', digest + '.json.gz');
    assert(fits(encoded, currentFiles.length));
    assert.deepEqual(json(encoded.gzip).geometries, Object.fromEntries(Object.entries(current).map(([id, source]) => [id, JSON.parse(source)])), 'Packed geometry must retain every numeric value');
    for (const [source, id] of currentFiles) assignments.set(source, {file, id});
    packs.push({file, bytes: encoded.gzip, entryIds: Object.keys(current), decodedBytes: encoded.raw.length, sha256: digest});
    current = {}; currentFiles = [];
  }
  for (const file of order) {
    const stored = await read(file), raw = compactJSON(stored[0] === 31 && stored[1] === 139 ? gunzipSync(stored) : stored);
    if (raw.length > limits.decodedBytes) {oversized.push(relative(file)); continue;}
    const value = raw.toString('utf8'), id = hash(relative(file));
    let next = {...current, [id]: value}, encoded = encode(next);
    if (!fits(encoded, currentFiles.length + 1)) {finish(); next = {[id]: value}; encoded = encode(next);}
    if (!fits(encoded, 1)) {oversized.push(relative(file)); continue;}
    current = next; currentFiles.push([file, id]);
  }
  finish();
  let rewrittenReferences = 0;
  for (const [file, destinations] of refs) {
    const packed = assignments.get(file); if (!packed) continue;
    for (const destination of destinations) {
      const {object, key, base, doc} = destination;
      const ref = slash(path.relative(path.dirname(base), packed.file)) + '#' + packed.id;
      if (object[key] !== ref) {object[key] = ref; doc.changed = true; rewrittenReferences++;}
    }
  }
  // All inputs and generated payloads are checked before touching generated output files.
  if (packs.length) await fs.mkdir(path.join(root, 'maps/data/geometry-packs'), {recursive: true});
  for (const pack of packs) {await noLinks(pack.file, true); await fs.writeFile(pack.file, pack.bytes);}
  for (const doc of documents.filter(doc => doc.parent && doc.changed)) {
    const raw = Buffer.from(stringify(doc.data)), bytes = gzipSync(raw, {level: 9});
    await fs.writeFile(doc.file, bytes);
    doc.parent.data.pois.bytes = raw.length; doc.parent.data.pois.gzipBytes = bytes.length; doc.parent.changed = true;
  }
  for (const doc of documents.filter(doc => !doc.parent && doc.changed)) await fs.writeFile(doc.file, gzipSync(Buffer.from(stringify(doc.data)), {level: 9}));
  return {schemaVersion: 1, limits, geometryCount: refs.size, packedGeometryCount: assignments.size, packCount: packs.length, rewrittenReferences, oversized, sourceGeometryFiles,
    packs: packs.map(pack => ({path: relative(pack.file), sha256: pack.sha256, gzipBytes: pack.bytes.length, decodedBytes: pack.decodedBytes, entryIds: pack.entryIds}))};
}
