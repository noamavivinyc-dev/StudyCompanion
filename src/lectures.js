const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SAMPLE_RATE = 16000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;

function wavHeader(size) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(size + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(size, 40);
  return header;
}

function timestamp(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

class LectureLibrary {
  constructor(store) {
    this.store = store;
    this.dir = path.join(store.root, "lectures");
    this.activeId = null;
    this.jobs = new Set();
    this.pending = Promise.resolve();
    fs.mkdirSync(this.dir, { recursive: true });
    store.data.lectures ||= [];
    let recovered = false;
    for (const lecture of store.data.lectures) {
      if (["recording", "transcribing", "generating"].includes(lecture.status)) {
        if (lecture.status === "recording") this.finalizeAudio(lecture);
        lecture.status = "saved";
        lecture.error = "Interrupted last time. Your saved audio and notes are available; retry processing when ready.";
        recovered = true;
      }
    }
    if (recovered) store.save();
  }

  get(id) {
    const lecture = this.store.data.lectures.find((item) => item.id === id);
    if (!lecture) throw new Error("Lecture not found.");
    return lecture;
  }

  audioPath(id) {
    const lecture = this.get(id);
    return path.join(this.dir, `${lecture.id}.wav`);
  }

  start({ title, courseId }) {
    if (this.activeId) throw new Error("Finish the current recording first.");
    const course = this.store.data.courses.find((item) => item.id === courseId);
    if (!course) throw new Error("Choose a course first.");
    const lecture = {
      id: `lecture_${crypto.randomUUID()}`, courseId,
      title: String(title || "Untitled lecture").trim().slice(0, 120) || "Untitled lecture",
      createdAt: new Date().toISOString(), duration: 0, status: "recording", error: "",
      notes: [], segments: [], studyGuide: "",
    };
    this.store.data.lectures.push(lecture);
    fs.writeFileSync(this.audioPath(lecture.id), wavHeader(0), { mode: 0o600 });
    this.activeId = lecture.id;
    this.store.save();
    return this.detail(lecture.id);
  }

  append(id, bytes) {
    if (id !== this.activeId) throw new Error("This recording has ended.");
    const buffer = Buffer.from(bytes);
    if (!buffer.length || buffer.length % 2 || buffer.length > BYTES_PER_SECOND * 5) throw new Error("Invalid audio chunk.");
    const file = this.audioPath(id);
    this.pending = this.pending.then(async () => {
      await fs.promises.appendFile(file, buffer);
      this.get(id).duration += buffer.length / BYTES_PER_SECOND;
    });
    return this.pending;
  }

  finalizeAudio(lecture) {
    const file = this.audioPath(lecture.id);
    if (!fs.existsSync(file)) { lecture.duration = 0; return; }
    const size = Math.max(0, fs.statSync(file).size - 44);
    const fd = fs.openSync(file, "r+");
    try { fs.writeSync(fd, wavHeader(size), 0, 44, 0); } finally { fs.closeSync(fd); }
    lecture.duration = size / BYTES_PER_SECOND;
  }

  async finish(id) {
    if (id !== this.activeId) throw new Error("This recording has already ended.");
    try { await this.pending; } catch { /* Finalize the portion that reached disk. */ }
    const lecture = this.get(id);
    this.finalizeAudio(lecture);
    lecture.status = "saved";
    this.activeId = null;
    this.pending = Promise.resolve();
    this.syncMaterial(lecture);
    this.store.save();
    return this.detail(id);
  }

  detail(id) {
    const lecture = this.get(id);
    return { ...lecture, audioUrl: lecture.duration > 0 && lecture.status !== "recording" ? `study-audio://lecture/${lecture.id}` : null };
  }

  update(id, patch) {
    const lecture = this.get(id);
    if (this.jobs.has(id)) throw new Error("Wait for this lecture to finish processing before editing it.");
    if (Object.hasOwn(patch, "title")) {
      const title = String(patch.title || "").trim();
      if (!title) throw new Error("Give the lecture a title.");
      lecture.title = title.slice(0, 120);
    }
    if (Object.hasOwn(patch, "courseId")) {
      if (id === this.activeId) throw new Error("Finish recording before moving this lecture.");
      if (!this.store.data.courses.some((course) => course.id === patch.courseId)) throw new Error("Course not found.");
      const previous = this.store.data.courses.find((course) => course.id === lecture.courseId);
      if (previous) previous.materials = previous.materials.filter((item) => item.lectureId !== id);
      lecture.courseId = patch.courseId;
    }
    if (Object.hasOwn(patch, "notes")) {
      if (!Array.isArray(patch.notes) || patch.notes.length > 1000) throw new Error("Too many notes.");
      lecture.notes = patch.notes.map((note) => ({
        id: String(note.id || crypto.randomUUID()).slice(0, 80),
        seconds: Math.min(lecture.duration, Math.max(0, Number(note.seconds) || 0)),
        text: String(note.text || "").slice(0, 10000),
      })).filter((note) => note.text.trim());
    }
    this.syncMaterial(lecture);
    this.store.save();
    return this.detail(id);
  }

  syncMaterial(lecture) {
    const course = this.store.data.courses.find((item) => item.id === lecture.courseId);
    if (!course) return;
    const text = [lecture.title, ...lecture.notes.map((note) => `[${timestamp(note.seconds)}] ${note.text}`),
      ...lecture.segments.map((segment) => `[${timestamp(segment.seconds)}] ${segment.text}`), lecture.studyGuide].filter(Boolean).join("\n\n");
    if (!lecture.notes.length && !lecture.segments.length && !lecture.studyGuide) return;
    let material = course.materials.find((item) => item.lectureId === lecture.id);
    if (!material) {
      material = { id: `material_${crypto.randomUUID()}`, lectureId: lecture.id, category: "notes", kind: "lecture", addedAt: lecture.createdAt, sourceDate: lecture.createdAt, timeline: [] };
      course.materials.push(material);
    }
    material.name = lecture.title;
    material.text = text.slice(0, 1_500_000);
    course.updatedAt = new Date().toISOString();
  }

  async transcribe(id, asr, onProgress = () => {}) {
    const lecture = this.get(id);
    if (id === this.activeId || this.jobs.has(id)) throw new Error("This lecture is already busy.");
    if (!lecture.duration) throw new Error("This lecture has no saved audio.");
    this.jobs.add(id);
    lecture.status = "transcribing"; lecture.error = ""; lecture.progress = 0;
    this.store.save(); onProgress();
    const fd = fs.openSync(this.audioPath(id), "r");
    try {
      const size = fs.fstatSync(fd).size - 44;
      // Read bounded one-minute pieces so a full lecture never enters memory at once.
      const chunkSize = BYTES_PER_SECOND * 60;
      const segments = [];
      for (let offset = 0; offset < size; offset += chunkSize) {
        const pcm = Buffer.alloc(Math.min(chunkSize, size - offset));
        fs.readSync(fd, pcm, 0, pcm.length, 44 + offset);
        const text = (await asr.transcribe(Buffer.concat([wavHeader(pcm.length), pcm]))).trim();
        if (text) segments.push({ seconds: offset / BYTES_PER_SECOND, text });
        lecture.progress = Math.round(Math.min(1, (offset + pcm.length) / size) * 100);
        onProgress();
      }
      if (!segments.length) throw new Error("No speech was detected. Your audio and notes are still saved.");
      lecture.segments = segments;
      lecture.status = "saved";
      this.syncMaterial(lecture);
    } catch (error) {
      lecture.status = "saved"; lecture.error = error.message;
      throw error;
    } finally {
      fs.closeSync(fd); this.jobs.delete(id); this.store.save(); onProgress();
    }
    return this.detail(id);
  }

  async generate(id, tutor, onProgress = () => {}) {
    const lecture = this.get(id);
    if (id === this.activeId || this.jobs.has(id)) throw new Error("This lecture is already busy.");
    if (!lecture.segments.length && !lecture.notes.length) throw new Error("Add notes or transcribe this lecture first.");
    this.jobs.add(id); lecture.status = "generating"; lecture.error = "";
    this.store.save(); onProgress();
    try {
      lecture.studyGuide = await tutor.summarizeLecture(lecture);
      this.syncMaterial(lecture);
    } catch (error) { lecture.error = error.message; throw error; }
    finally { lecture.status = "saved"; this.jobs.delete(id); this.store.save(); onProgress(); }
    return this.detail(id);
  }

  remove(id) {
    if (id === this.activeId || this.jobs.has(id)) throw new Error("Finish recording or processing before removing this lecture.");
    const file = this.audioPath(id);
    const archive = path.join(this.store.root, "archive", "lectures");
    fs.mkdirSync(archive, { recursive: true });
    fs.writeFileSync(path.join(archive, `${id}.json`), JSON.stringify(this.get(id)), { mode: 0o600 });
    if (fs.existsSync(file)) fs.renameSync(file, path.join(archive, `${id}.wav`));
    this.store.data.lectures = this.store.data.lectures.filter((item) => item.id !== id);
    for (const course of this.store.data.courses) course.materials = course.materials.filter((item) => item.lectureId !== id);
    this.store.save();
  }

  markdown(id) {
    const lecture = this.get(id);
    return `# ${lecture.title}\n\n${lecture.createdAt.slice(0, 10)} · ${timestamp(lecture.duration)}\n\n## Notes\n\n${lecture.notes.map((note) => `- [${timestamp(note.seconds)}] ${note.text}`).join("\n")}\n\n## Study guide\n\n${lecture.studyGuide || "Not generated yet."}\n\n## Transcript\n\n${lecture.segments.map((segment) => `[${timestamp(segment.seconds)}] ${segment.text}`).join("\n\n")}\n`;
  }
}

module.exports = { LectureLibrary, wavHeader, timestamp, BYTES_PER_SECOND };
