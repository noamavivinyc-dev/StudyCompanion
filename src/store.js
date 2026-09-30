const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { extractTimeline } = require("./syllabus");

const COLORS = ["#ff6b35", "#168aad", "#6a994e", "#9b5de5", "#d62828", "#bc6c25"];

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

class StudyStore {
  constructor(root) {
    this.root = root;
    this.file = path.join(root, "study-data.json");
    this.sessionsDir = path.join(root, "sessions");
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    this.data = this.read();
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return this.normalize(parsed);
    } catch {
      const courseId = id("course");
      return {
        version: 1,
        selectedCourseId: courseId,
        activeSessionId: null,
        settings: {
          muted: false,
          handsFree: false,
          persistCourseMemory: false,
          showGuidance: true,
          pairingToken: crypto.randomBytes(5).toString("hex").toUpperCase(),
        },
        courses: [
          {
            id: courseId,
            name: "Physics 201",
            shortName: "PHYS 201",
            color: COLORS[1],
            createdAt: now(),
            updatedAt: now(),
            materials: [],
            memory: [],
            reviewItems: [],
          },
        ],
        sessions: [],
        messages: [],
      };
    }
  }

  normalize(value) {
    const data = value && typeof value === "object" ? value : {};
    data.version = 1;
    data.settings = {
      muted: false,
      handsFree: false,
      persistCourseMemory: false,
      showGuidance: true,
      pairingToken: crypto.randomBytes(5).toString("hex").toUpperCase(),
      ...(data.settings || {}),
    };
    data.courses = Array.isArray(data.courses) ? data.courses : [];
    data.courses.forEach((course) => {
      course.materials = Array.isArray(course.materials) ? course.materials : [];
      course.memory = Array.isArray(course.memory) ? course.memory : [];
      course.reviewItems = Array.isArray(course.reviewItems) ? course.reviewItems : [];
      course.updatedAt = course.updatedAt || course.createdAt || now();
      course.materials.forEach((material) => {
        material.category = material.category || "notes";
        material.sourceDate = material.sourceDate || material.addedAt;
        material.timeline = Array.isArray(material.timeline) ? material.timeline : [];
      });
    });
    data.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    data.messages = Array.isArray(data.messages) ? data.messages : [];
    if (!data.selectedCourseId && data.courses[0]) data.selectedCourseId = data.courses[0].id;
    return data;
  }

  save() {
    fs.mkdirSync(this.root, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  publicState(extra = {}) {
    const active = this.activeSession();
    const today = Date.now();
    return {
      settings: this.data.settings,
      courses: this.data.courses.map((course) => ({
        id: course.id,
        name: course.name,
        shortName: course.shortName,
        color: course.color,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        materialCount: course.materials.length,
        memoryCount: course.memory.length,
        materials: course.materials
          .map(({ id, name, kind, category, sourceDate, addedAt, timeline, text }) => ({
            id, name, kind, category, sourceDate, addedAt, timeline: timeline || [], textLength: text?.length || 0,
          }))
          .sort((a, b) => String(b.sourceDate || b.addedAt).localeCompare(String(a.sourceDate || a.addedAt))),
        reviewDueCount: (course.reviewItems || []).filter((item) => new Date(item.nextReviewAt).valueOf() <= today).length,
        dueReviews: (course.reviewItems || []).filter((item) => new Date(item.nextReviewAt).valueOf() <= today).slice(0, 6),
        upcomingEvents: course.materials
          .flatMap((material) => (material.timeline || []).map((event) => ({ ...event, materialName: material.name })))
          .filter((event) => !event.date || new Date(event.date).valueOf() >= today - 86_400_000)
          .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")))
          .slice(0, 8),
      })),
      selectedCourseId: this.data.selectedCourseId,
      activeSession: active,
      messages: active ? this.messagesFor(active.id) : [],
      recentSessions: this.data.sessions.slice(-12).reverse(),
      ...extra,
    };
  }

  selectedCourse() {
    return this.data.courses.find((course) => course.id === this.data.selectedCourseId) || this.data.courses[0] || null;
  }

  activeSession() {
    return this.data.sessions.find((session) => session.id === this.data.activeSessionId && !session.endedAt) || null;
  }

  messagesFor(sessionId) {
    return this.data.messages.filter((message) => message.sessionId === sessionId);
  }

  createCourse({ name, shortName, color }) {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Give the course a name.");
    const course = {
      id: id("course"),
      name: cleanName.slice(0, 80),
      shortName: String(shortName || cleanName).trim().slice(0, 18).toUpperCase(),
      color: color || COLORS[this.data.courses.length % COLORS.length],
      createdAt: now(),
      updatedAt: now(),
      materials: [],
      memory: [],
      reviewItems: [],
    };
    this.data.courses.push(course);
    this.data.selectedCourseId = course.id;
    this.save();
    return course;
  }

  updateCourse(courseId, patch = {}) {
    const course = this.data.courses.find((item) => item.id === courseId);
    if (!course) throw new Error("Course not found.");
    if (Object.prototype.hasOwnProperty.call(patch, "name")) {
      const name = String(patch.name || "").trim();
      if (!name) throw new Error("Give the course a name.");
      course.name = name.slice(0, 80);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "shortName")) course.shortName = String(patch.shortName || course.name).trim().slice(0, 18).toUpperCase();
    if (Object.prototype.hasOwnProperty.call(patch, "color") && COLORS.includes(patch.color)) course.color = patch.color;
    course.updatedAt = now();
    this.save();
    return course;
  }

  deleteCourse(courseId) {
    const course = this.data.courses.find((item) => item.id === courseId);
    if (!course) throw new Error("Course not found.");
    if (this.activeSession()?.courseId === courseId) throw new Error("End the current study session before deleting this course.");
    const sessions = this.data.sessions.filter((item) => item.courseId === courseId);
    const sessionIds = new Set(sessions.map((item) => item.id));
    const archiveRoot = path.join(this.root, "archive", "deleted-courses", `${courseId}-${Date.now()}`);
    for (const session of sessions) {
      const source = path.join(this.sessionsDir, session.id);
      if (fs.existsSync(source)) {
        fs.mkdirSync(archiveRoot, { recursive: true });
        fs.renameSync(source, path.join(archiveRoot, session.id));
      }
    }
    this.data.courses = this.data.courses.filter((item) => item.id !== courseId);
    this.data.sessions = this.data.sessions.filter((item) => item.courseId !== courseId);
    this.data.messages = this.data.messages.filter((item) => !sessionIds.has(item.sessionId));
    this.data.selectedCourseId = this.data.courses[0]?.id || null;
    this.save();
  }

  selectCourse(courseId) {
    if (!this.data.courses.some((course) => course.id === courseId)) throw new Error("Course not found.");
    if (this.activeSession()) throw new Error("End the current study session before switching courses.");
    this.data.selectedCourseId = courseId;
    this.save();
  }

  updateSettings(patch) {
    const allowed = ["muted", "handsFree", "persistCourseMemory", "showGuidance"];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) this.data.settings[key] = Boolean(patch[key]);
    }
    this.save();
    return this.data.settings;
  }

  startSession() {
    const existing = this.activeSession();
    if (existing) return existing;
    const course = this.selectedCourse();
    if (!course) throw new Error("Create a course before starting a session.");
    const session = {
      id: id("session"),
      courseId: course.id,
      courseName: course.name,
      startedAt: now(),
      endedAt: null,
      questionCount: 0,
      snapshotCount: 0,
      summary: "",
    };
    this.data.sessions.push(session);
    this.data.activeSessionId = session.id;
    fs.mkdirSync(path.join(this.sessionsDir, session.id), { recursive: true });
    this.save();
    return session;
  }

  endSession({ keepMemory = this.data.settings.persistCourseMemory } = {}) {
    const session = this.activeSession();
    if (!session) return null;
    session.endedAt = now();
    const messages = this.messagesFor(session.id);
    const assistantSummaries = messages.filter((m) => m.role === "assistant" && m.summary).map((m) => m.summary);
    session.summary = assistantSummaries.slice(-5).join(" ").slice(0, 1800);
    if (keepMemory && session.summary) {
      const course = this.data.courses.find((item) => item.id === session.courseId);
      if (course) {
        course.memory.push({ id: id("memory"), sessionId: session.id, createdAt: now(), text: session.summary });
        course.memory = course.memory.slice(-80);
      }
    }
    this.data.activeSessionId = null;
    this.save();
    return session;
  }

  addMaterial(courseId, material) {
    const course = this.data.courses.find((item) => item.id === courseId);
    if (!course) throw new Error("Course not found.");
    const row = {
      id: id("material"),
      name: material.name,
      kind: material.kind,
      text: material.text.slice(0, 1_500_000),
      category: material.category || "notes",
      sourceDate: material.sourceDate || now(),
      timeline: Array.isArray(material.timeline) ? material.timeline.slice(0, 40) : [],
      addedAt: now(),
    };
    course.materials.push(row);
    course.updatedAt = now();
    this.save();
    return row;
  }

  updateMaterial(courseId, materialId, patch = {}) {
    const course = this.data.courses.find((item) => item.id === courseId);
    const material = course?.materials.find((item) => item.id === materialId);
    if (!course || !material) throw new Error("Material not found.");
    if (Object.prototype.hasOwnProperty.call(patch, "category") && ["syllabus", "assignment", "slides", "rubric", "notes"].includes(patch.category)) {
      material.category = patch.category;
      material.timeline = patch.category === "syllabus" ? extractTimeline(material.text, material.sourceDate) : [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sourceDate")) {
      const rawDate = String(patch.sourceDate || "");
      const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}T12:00:00` : rawDate);
      if (Number.isNaN(date.valueOf())) throw new Error("Choose a valid material date.");
      material.sourceDate = date.toISOString();
      if (material.category === "syllabus") material.timeline = extractTimeline(material.text, material.sourceDate);
    }
    course.updatedAt = now();
    this.save();
    return material;
  }

  removeMaterial(courseId, materialId) {
    const course = this.data.courses.find((item) => item.id === courseId);
    if (!course) throw new Error("Course not found.");
    const before = course.materials.length;
    course.materials = course.materials.filter((item) => item.id !== materialId);
    if (course.materials.length === before) throw new Error("Material not found.");
    course.updatedAt = now();
    this.save();
  }

  addMessage(message) {
    const session = this.activeSession();
    if (!session) throw new Error("Start a study session first.");
    const row = { id: id("message"), sessionId: session.id, at: now(), ...message };
    this.data.messages.push(row);
    if (row.role === "user") session.questionCount += 1;
    if (row.role === "assistant" && row.review && this.data.settings.persistCourseMemory) {
      const course = this.data.courses.find((item) => item.id === session.courseId);
      if (course && row.review.concept && row.review.prompt) {
        const days = { new: 1, developing: 3, secure: 7 }[row.review.status] || 2;
        const nextReviewAt = new Date(Date.now() + days * 86_400_000).toISOString();
        const existing = course.reviewItems.find((item) => item.concept.toLowerCase() === row.review.concept.toLowerCase());
        const review = { id: existing?.id || id("review"), ...row.review, updatedAt: now(), nextReviewAt };
        if (existing) Object.assign(existing, review);
        else course.reviewItems.push(review);
        course.reviewItems = course.reviewItems.slice(-120);
      }
    }
    this.save();
    return row;
  }

  saveSnapshot(buffer, extension = "jpg") {
    const session = this.activeSession();
    if (!session) throw new Error("Start a study session first.");
    const dir = path.join(this.sessionsDir, session.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${session.questionCount + 1}.${extension}`);
    fs.writeFileSync(file, buffer);
    session.snapshotCount += 1;
    this.save();
    return file;
  }
}

module.exports = { StudyStore };
