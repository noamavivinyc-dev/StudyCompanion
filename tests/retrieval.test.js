const test = require("node:test");
const assert = require("node:assert/strict");
const { relevantCourseContext, chunks } = require("../src/retrieval");

test("retrieval ranks relevant course text before unrelated material", () => {
  const course = {
    materials: [
      { name: "Kinematics", text: "Projectile motion separates horizontal velocity from vertical acceleration due to gravity." },
      { name: "Thermodynamics", text: "Entropy in an isolated system does not decrease." },
    ],
    memory: [],
  };
  const context = relevantCourseContext(course, "Why is horizontal velocity constant in projectile motion?", 1);
  assert.match(context, /Kinematics/);
  assert.doesNotMatch(context, /Thermodynamics/);
});

test("chunking preserves overlap for long imported notes", () => {
  const output = chunks("x".repeat(2500), 1000, 100);
  assert.equal(output.length, 3);
  assert.equal(output[0].length, 1000);
  assert.equal(output[1].length, 1000);
});
