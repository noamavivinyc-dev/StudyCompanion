const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { inferCategory, extractTimeline } = require("./syllabus");

const run = promisify(execFile);

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function readMaterial(file) {
  const ext = path.extname(file).toLowerCase();
  const name = path.basename(file);
  const sourceDate = fs.statSync(file).mtime.toISOString();
  let text;
  if ([".txt", ".md", ".markdown", ".csv"].includes(ext)) {
    text = fs.readFileSync(file, "utf8");
  }
  else if (ext === ".pdf") {
    try {
      const { stdout } = await run("/opt/homebrew/bin/pdftotext", ["-layout", file, "-"], { maxBuffer: 20 * 1024 * 1024 });
      text = stdout;
    } catch {
      throw new Error(`Couldn't extract ${name}. Install pdftotext with Homebrew or export the document as text.`);
    }
  }
  else if (ext === ".docx" || ext === ".doc" || ext === ".rtf") {
    const { stdout } = await run("/usr/bin/textutil", ["-convert", "txt", "-stdout", file], { maxBuffer: 20 * 1024 * 1024 });
    text = stdout;
  }
  else if (ext === ".pptx") {
    try {
      const { stdout } = await run("/usr/bin/unzip", ["-p", file, "ppt/slides/slide*.xml"], { maxBuffer: 30 * 1024 * 1024 });
      text = [...stdout.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])).join("\n");
      if (!text.trim()) throw new Error("No slide text found");
    } catch {
      throw new Error(`Couldn't extract ${name}. Export the deck as PDF and add that copy instead.`);
    }
  }
  else throw new Error(`Unsupported material: ${name}`);

  const category = inferCategory(name, text);
  return {
    name,
    kind: ext.slice(1),
    category,
    sourceDate,
    text,
    timeline: category === "syllabus" ? extractTimeline(text, sourceDate) : [],
  };
}

module.exports = { readMaterial };
