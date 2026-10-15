const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const run = promisify(execFile);

function safeName(value) {
  return String(value || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/^\.+/, '').trim().slice(0, 80) || 'Study pack';
}

function buildCourseFolder(store, lectures, courseId, destination, { includeAudio = true } = {}) {
  const course = store.data.courses.find((item) => item.id === courseId);
  if (!course) throw new Error('Course not found.');
  const recordings = store.data.lectures.filter((lecture) => lecture.courseId === courseId);
  if (recordings.some((lecture) => lecture.status !== 'saved')) throw new Error('Finish recording or processing this class before sharing it.');
  const folder = path.join(destination, safeName(course.name));
  fs.mkdirSync(folder, { recursive:true, mode:0o700 });
  const write = (name, text) => fs.writeFileSync(path.join(folder, name), text, { mode:0o600 });
  const sections = [];
  recordings.forEach((lecture, index) => {
    const prefix = `${String(index + 1).padStart(2, '0')} - ${safeName(lecture.title)}`;
    const relative = path.join('Lectures', prefix);
    fs.mkdirSync(path.join(folder, 'Lectures'), { recursive:true });
    write(`${relative}.md`, lectures.markdown(lecture.id));
    if (includeAudio && lecture.duration > 0) fs.copyFileSync(lectures.audioPath(lecture.id), path.join(folder, `${relative}.wav`));
    sections.push(`- ${lecture.title} (${lecture.createdAt.slice(0, 10)}): notes${lecture.segments.length ? ', transcript' : ''}${lecture.studyGuide ? ', study guide' : ''}${includeAudio && lecture.duration ? ', audio' : ''}`);
  });
  const materials = course.materials.filter((material) => !material.lectureId);
  if (materials.length) fs.mkdirSync(path.join(folder, 'Course materials'), { recursive:true });
  materials.forEach((material, index) => write(path.join('Course materials', `${String(index + 1).padStart(2, '0')} - ${safeName(material.name)}.md`), `# ${material.name}\n\nType: ${material.category}\nSource date: ${material.sourceDate}\n\n${material.text}\n`));
  const sessions = store.data.sessions.filter((session) => session.courseId === courseId);
  const messages = sessions.flatMap((session) => store.messagesFor(session.id));
  if (messages.length) write('Study conversations.md', `# Study conversations · ${course.name}\n\n${sessions.map((session) => `## ${session.startedAt.slice(0, 10)}\n\n${store.messagesFor(session.id).map((message) => `### ${message.role === 'user' ? 'My question' : 'Study Companion'}\n\n${message.content}`).join('\n\n')}`).join('\n\n')}`);
  write('Start here.md', `# ${course.name}\n\nStudy pack exported from Study Companion.\n\n## Lectures\n\n${sections.join('\n') || 'No lectures saved yet.'}\n\n## Course materials\n\n${materials.map((material) => `- ${material.name} (${material.category})`).join('\n') || 'No imported materials.'}\n\nOpen .md files in any text editor. Audio files use WAV and play in common media players. Note and transcript timestamps refer to the corresponding audio. Imported materials are exported as readable text; original PDF, Word, and slide layouts are not included.\n\nThis pack includes study conversations when present. It does not include account credentials, pairing codes, screenshots, or voice caches.\n`);
  return { folder, courseName:course.name, lectureCount:recordings.length, materialCount:materials.length, conversationCount:sessions.length };
}

function emailDraftUrl({ recipient = '', provider = 'default', courseName, lectureCount, materialCount }) {
  const email = String(recipient || '').trim();
  if (email && (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new Error('Enter a valid email address or leave it blank.');
  const subject = `${courseName} — lectures and study notes`;
  const body = `Here are my study materials for ${courseName}.\n\nThe study pack contains ${lectureCount} lecture${lectureCount === 1 ? '' : 's'} with notes, saved transcripts and study guides, plus ${materialCount} course material${materialCount === 1 ? '' : 's'}.\n\n[Attach the exported study pack ZIP before sending.]`;
  const query = new URLSearchParams({ ...(provider === 'gmail' ? { view:'cm', fs:'1', to:email, su:subject } : { subject }), body });
  if (provider === 'gmail') return `https://mail.google.com/mail/?${query}`;
  if (provider !== 'default') throw new Error('Choose your default email app or Gmail.');
  return `mailto:${encodeURIComponent(email)}?${query}`;
}

async function exportCoursePack(store, lectures, courseId, destination, options = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'study-companion-share-'));
  try {
    const pack = buildCourseFolder(store, lectures, courseId, temporary, options);
    const zip = path.join(temporary, 'study-pack.zip');
    await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', pack.folder, zip]);
    await fs.promises.copyFile(zip, destination);
    return { ...pack, folder:undefined, path:destination, bytes:fs.statSync(destination).size };
  } finally { fs.rmSync(temporary, { recursive:true, force:true }); }
}

module.exports = { safeName, buildCourseFolder, emailDraftUrl, exportCoursePack };
