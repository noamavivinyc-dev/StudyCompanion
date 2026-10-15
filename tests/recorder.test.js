const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('audio worklet emits bounded PCM chunks, flushes the tail, and excludes pauses', () => {
  const messages = [];
  let Processor;
  const sandbox = {
    AudioWorkletProcessor:class { constructor() { this.port = { postMessage:(value) => messages.push(value) }; } },
    registerProcessor:(_name, implementation) => { Processor = implementation; },
    Int16Array,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/recorder-worklet.js'), 'utf8'), sandbox);
  const processor = new Processor();
  const samples = new Float32Array(24000).fill(0.5);
  processor.process([[samples]]);
  assert.equal(messages.length, 0, 'capture remains off until explicitly started');
  processor.port.onmessage({ data:{ type:'resume' } });
  processor.process([[samples]]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].buffer.byteLength, 32000);
  processor.port.onmessage({ data:{ type:'pause' } });
  assert.equal(messages[1].buffer.byteLength, 16000);
  processor.process([[samples]]);
  assert.equal(messages.length, 2, 'paused input is excluded');
  processor.port.onmessage({ data:{ type:'flush', id:'finish' } });
  assert.equal(messages[2].type, 'flushed');
  assert.equal(messages[2].id, 'finish');
  assert.equal(new Int16Array(messages[0].buffer)[0], 16383);
});
