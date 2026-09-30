const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { StudyStore } = require("../src/store");

test("sessions remain course-scoped and only persist memory when enabled", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "study-store-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new StudyStore(root);
  const session = store.startSession();
  store.addMessage({ role: "user", content: "Check this." });
  store.addMessage({ role: "assistant", content: "Try the sign.", summary: "Student reviewed vector signs." });
  store.endSession({ keepMemory: true });
  const course = store.selectedCourse();
  assert.equal(session.courseId, course.id);
  assert.equal(course.memory.length, 1);
  assert.match(course.memory[0].text, /vector signs/);
});

test("public state exposes dated material metadata but omits imported source text", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "study-store-"));
  const store = new StudyStore(root);
  store.addMaterial(store.selectedCourse().id, { name: "notes.txt", kind: "txt", text: "private notes" });
  const state = store.publicState();
  assert.equal(state.courses[0].materialCount, 1);
  assert.equal(state.courses[0].materials[0].name, "notes.txt");
  assert.equal("text" in state.courses[0].materials[0], false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("courses and materials can be edited and removed without touching source files", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "study-store-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new StudyStore(root);
  const course = store.selectedCourse();
  store.updateCourse(course.id, { name: "Mechanics", shortName: "PHYS 1" });
  const material = store.addMaterial(course.id, { name: "outline.txt", kind: "txt", text: "Midterm October 12", sourceDate: "2026-09-01T00:00:00.000Z" });
  store.updateMaterial(course.id, material.id, { category: "syllabus", sourceDate: "2026-09-02" });
  assert.equal(store.selectedCourse().name, "Mechanics");
  assert.equal(store.selectedCourse().materials[0].category, "syllabus");
  assert.equal(store.selectedCourse().materials[0].timeline.length, 1);
  store.removeMaterial(course.id, material.id);
  assert.equal(store.selectedCourse().materials.length, 0);
});

test("learning signals create a spaced review only when course memory is enabled", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "study-store-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new StudyStore(root);
  store.updateSettings({ persistCourseMemory: true });
  store.startSession();
  store.addMessage({ role: "assistant", content: "Try the sign.", review: { concept: "Vector signs", status: "new", prompt: "How do signs change across axes?" } });
  assert.equal(store.selectedCourse().reviewItems.length, 1);
  assert.ok(new Date(store.selectedCourse().reviewItems[0].nextReviewAt) > new Date());
});
