const path = require("path");
const fs = require("fs");
const { fork, spawn } = require("child_process");
const crypto = require("crypto");

class VoiceService {
  constructor({ cacheDir, onState }) {
    this.cacheDir = cacheDir;
    this.onState = onState;
    this.worker = null;
    this.player = null;
    this.pending = new Map();
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  ensureWorker() {
    if (this.worker) return;
    const script = path.join(__dirname, "tts-worker.mjs");
    this.worker = fork(script, [], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", STUDY_MODEL_CACHE: path.join(path.dirname(this.cacheDir), "models") },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    this.worker.stderr?.on("data", () => {});
    this.worker.on("message", (message) => this.handle(message));
    this.worker.on("exit", () => {
      this.worker = null;
      for (const pending of this.pending.values()) pending.reject(new Error("Kokoro stopped unexpectedly."));
      this.pending.clear();
    });
  }

  handle(message) {
    if (message?.type === "state") this.onState?.(message.state);
    if (!message?.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.type === "ready") pending.resolve(message.path);
    else pending.reject(new Error(message.error || "Kokoro could not synthesize speech."));
  }

  async speak(text) {
    this.stop();
    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1200);
    if (!clean) return;
    this.ensureWorker();
    const id = crypto.randomUUID();
    const output = path.join(this.cacheDir, `${id}.wav`);
    this.onState?.("loading");
    try {
      const audioPath = await new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.send({ type: "speak", id, text: clean, output, voice: "af_heart" });
      });
      await this.play(audioPath);
    } catch {
      await this.systemFallback(clean);
    }
  }

  play(file) {
    return new Promise((resolve, reject) => {
      this.onState?.("speaking");
      this.player = spawn("/usr/bin/afplay", [file]);
      let settled = false;
      this.player.once("error", (error) => {
        if (settled) return;
        settled = true;
        this.player = null;
        reject(error);
      });
      this.player.once("close", () => {
        if (settled) return;
        settled = true;
        this.player = null;
        this.onState?.("idle");
        fs.rm(file, { force: true }, () => {});
        resolve();
      });
    });
  }

  systemFallback(text) {
    return new Promise((resolve, reject) => {
      this.onState?.("speaking");
      this.player = spawn("/usr/bin/say", ["-v", "Samantha", "-r", "190", text]);
      let settled = false;
      this.player.once("error", (error) => {
        if (settled) return;
        settled = true;
        this.player = null;
        this.onState?.("error");
        reject(error);
      });
      this.player.once("close", () => {
        if (settled) return;
        settled = true;
        this.player = null;
        this.onState?.("idle");
        resolve();
      });
    });
  }

  stop() {
    if (this.player) {
      this.player.kill("SIGTERM");
      this.player = null;
      this.onState?.("idle");
    }
  }

  dispose() {
    this.stop();
    this.worker?.kill();
    this.worker = null;
  }
}

module.exports = { VoiceService };
