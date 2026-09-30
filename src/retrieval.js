const STOP = new Set("the a an and or but if then than to of in on at for from with by is are was were be been being this that these those it its as about into your you i me my we our what why how where when".split(" "));

function terms(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9.+-]{2,}/g)?.filter((word) => !STOP.has(word)) || [],
  );
}

function chunks(text, size = 1800, overlap = 240) {
  const out = [];
  const clean = String(text || "").replace(/\r/g, "").trim();
  for (let start = 0; start < clean.length; start += size - overlap) {
    out.push(clean.slice(start, start + size));
    if (start + size >= clean.length) break;
  }
  return out;
}

function relevantCourseContext(course, question, limit = 6) {
  if (!course) return "";
  const query = terms(question);
  const candidates = [];
  const dateIntent = /\b(due|when|date|schedule|syllabus|exam|midterm|final|quiz|assignment|deadline|recent|latest)\b/i.test(question);
  for (const material of course.materials || []) {
    for (const chunk of chunks(material.text)) {
      const words = terms(chunk);
      let score = 0;
      for (const word of query) if (words.has(word)) score += word.length > 6 ? 3 : 1;
      if (dateIntent && material.category === "syllabus") score += 8;
      const ageDays = Math.max(0, (Date.now() - new Date(material.sourceDate || material.addedAt || 0).valueOf()) / 86_400_000);
      const recency = Number.isFinite(ageDays) ? Math.max(0, 1.5 - ageDays / 240) : 0;
      candidates.push({ score: score + recency, label: `${material.name} · ${material.category || material.kind} · dated ${String(material.sourceDate || material.addedAt || "unknown").slice(0, 10)}`, chunk });
    }
  }
  for (const memory of course.memory || []) {
    const words = terms(memory.text);
    let score = 1;
    for (const word of query) if (words.has(word)) score += 2;
    candidates.push({ score, label: "Course memory", chunk: memory.text });
  }
  for (const review of course.reviewItems || []) {
    const words = terms(`${review.concept} ${review.prompt}`);
    let score = 0.5;
    for (const word of query) if (words.has(word)) score += 2;
    candidates.push({ score, label: `Review item · ${review.status}`, chunk: `${review.concept}: ${review.prompt}` });
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => `--- ${item.label} ---\n${item.chunk}`)
    .join("\n\n");
}

module.exports = { relevantCourseContext, terms, chunks };
