const test = require("node:test");
const assert = require("node:assert/strict");
const { inferCategory, extractTimeline } = require("../src/syllabus");

test("syllabus imports are classified and dated events are extracted", () => {
  const text = "Course Schedule\nHomework 1 due September 30\nMidterm October 12\nReading: vectors";
  assert.equal(inferCategory("PHYS 201 syllabus.pdf", text), "syllabus");
  const events = extractTimeline(text, "2026-08-20T00:00:00.000Z");
  assert.equal(events.length, 2);
  assert.equal(events[0].date.slice(0, 10), "2026-09-30");
});
