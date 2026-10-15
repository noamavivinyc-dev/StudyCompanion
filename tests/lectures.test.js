const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StudyStore } = require('../src/store');
const { LectureLibrary, BYTES_PER_SECOND } = require('../src/lectures');
const { audioResponse } = require('../src/lecture-audio');

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-lectures-'));
  context.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const store = new StudyStore(root);
  return { store, library:new LectureLibrary(store), root };
}

test('incremental lecture recording persists audio, timestamped notes, and course context across restart', async (context) => {
  const { store, library, root } = fixture(context);
  const lecture = library.start({ title:'Electric fields', courseId:store.selectedCourse().id });
  await Promise.all(Array.from({ length:3 }, () => library.append(lecture.id, Buffer.alloc(BYTES_PER_SECOND))));
  library.update(lecture.id, { notes:[{ id:'one', seconds:2, text:'Force points along the field.' }] });
  const saved = await library.finish(lecture.id);
  assert.equal(saved.duration, 3);
  const bytes = fs.readFileSync(library.audioPath(lecture.id));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(40), BYTES_PER_SECOND * 3);
  const reopened = new LectureLibrary(new StudyStore(root));
  assert.equal(reopened.detail(lecture.id).notes[0].seconds, 2);
  assert.match(reopened.detail(lecture.id).audioUrl, /^study-audio:/);
  assert.match(store.selectedCourse().materials[0].text, /Force points/);
  assert.equal(store.publicState().lectures[0].noteCount, 1);
  assert.equal('notes' in store.publicState().lectures[0], false);
});

test('an interrupted recording is recovered from the bytes actually on disk', async (context) => {
  const { store, library, root } = fixture(context);
  const lecture = library.start({ title:'Interrupted class', courseId:store.selectedCourse().id });
  await library.append(lecture.id, Buffer.alloc(BYTES_PER_SECOND * 2));
  const recovered = new LectureLibrary(new StudyStore(root));
  assert.equal(recovered.detail(lecture.id).duration, 2);
  assert.equal(recovered.detail(lecture.id).status, 'saved');
  assert.match(recovered.detail(lecture.id).error, /Interrupted/);
  assert.equal(fs.readFileSync(recovered.audioPath(lecture.id)).readUInt32LE(40), BYTES_PER_SECOND * 2);
});

test('long lectures transcribe in bounded chunks with accurate offsets and safe retries', async (context) => {
  const { store, library } = fixture(context);
  const lecture = library.start({ title:'Long class', courseId:store.selectedCourse().id });
  for (let i = 0; i < 13; i++) await library.append(lecture.id, Buffer.alloc(BYTES_PER_SECOND * 5));
  await library.finish(lecture.id);
  const sizes = [];
  const result = await library.transcribe(lecture.id, { transcribe:async (buffer) => { sizes.push(buffer.length); return `Part ${sizes.length}`; } });
  assert.deepEqual(sizes, [44 + BYTES_PER_SECOND * 60, 44 + BYTES_PER_SECOND * 5]);
  assert.deepEqual(result.segments.map((segment) => segment.seconds), [0, 60]);
  await assert.rejects(library.transcribe(lecture.id, { transcribe:async () => { throw new Error('Model unavailable'); } }), /Model unavailable/);
  assert.equal(library.detail(lecture.id).segments.length, 2);
  assert.equal(library.detail(lecture.id).status, 'saved');
  assert.ok(fs.existsSync(library.audioPath(lecture.id)));
  assert.match(store.selectedCourse().materials[0].text, /Part 2/);
});

test('moving a lecture moves its linked material and removal keeps a recovery archive', async (context) => {
  const { store, library, root } = fixture(context);
  const first = store.selectedCourse();
  const lecture = library.start({ title:'Organize me', courseId:first.id });
  await library.append(lecture.id, Buffer.alloc(BYTES_PER_SECOND));
  library.update(lecture.id, { notes:[{ text:'Important idea', seconds:0 }] });
  await library.finish(lecture.id);
  const second = store.createCourse({ name:'Chemistry' });
  library.update(lecture.id, { courseId:second.id });
  assert.equal(first.materials.length, 0);
  assert.equal(second.materials[0].lectureId, lecture.id);
  library.remove(lecture.id);
  assert.equal(second.materials.length, 0);
  assert.ok(fs.existsSync(path.join(root, 'archive', 'lectures', `${lecture.id}.wav`)));
  assert.match(fs.readFileSync(path.join(root, 'archive', 'lectures', `${lecture.id}.json`), 'utf8'), /Important idea/);
});

test('audio playback serves ranges for seeking and rejects invalid ranges', async (context) => {
  const { store, library } = fixture(context);
  const lecture = library.start({ title:'Playback', courseId:store.selectedCourse().id });
  await library.append(lecture.id, Buffer.alloc(BYTES_PER_SECOND));
  await library.finish(lecture.id);
  const file = library.audioPath(lecture.id);
  const range = audioResponse(file, new Request('https://local/recording', { headers:{ Range:'bytes=44-143' } }));
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  assert.equal(range.headers.get('content-range'), `bytes 44-143/${BYTES_PER_SECOND + 44}`);
  const invalid = audioResponse(file, new Request('https://local/recording', { headers:{ Range:'bytes=999999-' } }));
  assert.equal(invalid.status, 416);
});

test('study guide failures keep saved notes and a later retry updates a single course material', async (context) => {
  const { store, library } = fixture(context);
  const lecture = library.start({ title:'Guide', courseId:store.selectedCourse().id });
  library.update(lecture.id, { notes:[{ text:'Kinetic energy is mv²/2', seconds:0 }] });
  await library.finish(lecture.id);
  await assert.rejects(library.generate(lecture.id, { summarizeLecture:async () => { throw new Error('Connect ChatGPT'); } }), /Connect/);
  assert.equal(library.detail(lecture.id).notes.length, 1);
  await library.generate(lecture.id, { summarizeLecture:async () => '## Key ideas\nKinetic energy\n\n## Recall\nWhat is kinetic energy?' });
  assert.match(library.markdown(lecture.id), /Recall/);
  assert.equal(store.selectedCourse().materials.length, 1);
  assert.match(store.selectedCourse().materials[0].text, /What is kinetic energy/);
});
