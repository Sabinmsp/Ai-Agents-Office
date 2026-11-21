import { readFileSync, writeFileSync } from 'node:fs';
import { ANIM } from '../public/js/config.js';

// Extract the office's animation tracks from the Universal Animation Library GLB.
const source = readFileSync('public/assets/people/UAL1_Standard.glb');
const jsonEnd = 20 + source.readUInt32LE(12);
const library = JSON.parse(source.toString('utf8', 20, jsonEnd));
const data = source.subarray(jsonEnd + 8);
const output = { asset: library.asset, scene: 0, scenes: [{ nodes: [] }], nodes: [], animations: [], accessors: [], bufferViews: [], buffers: [] };
const nodeIds = new Map(), accessorIds = new Map(), viewIds = new Map(), chunks = [];
let byteLength = 0;

function copyAccessor(id) {
  if (accessorIds.has(id)) return accessorIds.get(id);
  const accessor = library.accessors[id];
  const viewId = accessor.bufferView;
  if (!viewIds.has(viewId)) {
    const view = library.bufferViews[viewId];
    const start = view.byteOffset ?? 0;
    viewIds.set(viewId, output.bufferViews.length);
    output.bufferViews.push({ ...view, byteOffset: byteLength });
    chunks.push(data.subarray(start, start + view.byteLength));
    const padding = (4 - view.byteLength % 4) % 4;
    chunks.push(Buffer.alloc(padding));
    byteLength += view.byteLength + padding;
  }
  const index = output.accessors.length;
  accessorIds.set(id, index);
  output.accessors.push({ ...accessor, bufferView: viewIds.get(viewId) });
  return index;
}

for (const name of Object.values(ANIM)) {
  const { channels, samplers } = library.animations.find(clip => clip.name === name);
  const result = { name, channels: [], samplers: [] };
  for (const { sampler, target } of channels) {
    const node = library.nodes[target.node];
    if (target.path !== 'rotation' && !(target.path === 'translation' && /^(root|pelvis)$/.test(node.name))) continue;
    if (!nodeIds.has(target.node)) {
      const index = output.nodes.length;
      nodeIds.set(target.node, index);
      output.nodes.push({ name: node.name });
      output.scenes[0].nodes.push(index);
    }
    const { input, output: values, interpolation } = samplers[sampler];
    result.channels.push({ sampler: result.samplers.length, target: { node: nodeIds.get(target.node), path: target.path } });
    result.samplers.push({ input: copyAccessor(input), output: copyAccessor(values), interpolation });
  }
  output.animations.push(result);
}

output.buffers.push({ byteLength });
const text = Buffer.from(JSON.stringify(output));
const json = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(header.length + json.length + binHeader.length + byteLength, 8);
header.writeUInt32LE(json.length, 12);
header.write('JSON', 16);
binHeader.writeUInt32LE(byteLength);
binHeader.write('BIN\0', 4);
writeFileSync('public/assets/people/office-animations.glb', Buffer.concat([header, json, binHeader, ...chunks]));
