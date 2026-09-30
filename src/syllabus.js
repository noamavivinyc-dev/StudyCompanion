const MONTHS = "January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec";
const MONTH_PATTERN = `(?:${MONTHS.split(" ").join("|")})`;
const DATE_PATTERN = new RegExp(`\\b(?:${MONTH_PATTERN})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b|\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b`, "i");
const ACADEMIC_EVENT = /\b(due|exam|midterm|final|quiz|test|homework|assignment|problem set|project|paper|lab|lecture|class|break|office hours)\b/i;

function inferCategory(name, text = "") {
  const sample = `${name} ${String(text).slice(0, 2500)}`;
  if (/syllabus|course schedule|grading policy|learning objectives/i.test(sample)) return "syllabus";
  if (/rubric|grading criteria/i.test(sample)) return "rubric";
  if (/assignment|homework|problem set|worksheet/i.test(sample)) return "assignment";
  if (/lecture|slide|deck/i.test(sample)) return "slides";
  return "notes";
}

function parseDate(dateText, referenceDate) {
  const raw = String(dateText).replace(/(st|nd|rd|th)/i, "");
  const hasYear = /\b\d{4}\b/.test(raw);
  const reference = new Date(referenceDate || Date.now());
  const candidate = new Date(hasYear ? raw : `${raw}, ${reference.getFullYear()}`);
  return Number.isNaN(candidate.valueOf()) ? null : candidate.toISOString();
}

function extractTimeline(text, referenceDate) {
  const events = [];
  const seen = new Set();
  for (const rawLine of String(text || "").split(/\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || line.length > 260 || !ACADEMIC_EVENT.test(line)) continue;
    const match = line.match(DATE_PATTERN);
    if (!match) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ dateText: match[0], date: parseDate(match[0], referenceDate), title: line.slice(0, 240) });
    if (events.length >= 40) break;
  }
  return events;
}

module.exports = { inferCategory, extractTimeline };
