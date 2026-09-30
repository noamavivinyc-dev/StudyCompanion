const path = require("path");
const fs = require("fs");
const { fork } = require("child_process");
const crypto = require("crypto");

class AsrService {
  constructor({ cacheDir, onState }) {
    this.cacheDir = cacheDir;
    this.onState = onState;
    this.worker = null;
    this.pending = new Map();
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  ensureWorker() {
    if (this.worker) return;
    this.worker = fork(path.join(__dirname, "asr-worker.mjs"), [], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", STUDY_MODEL_CACHE: path.join(path.dirname(this.cacheDir), "models") },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    this.worker.on("message", (message) => this.handle(message));
    this.worker.on("exit", () => {
      this.worker = null;
      for (const pending of this.pending.values()) pending.reject(new Error("Local transcription stopped."));
      this.pending.clear();
    });
  }

  handle(message) {
    if (message?.type === "state") this.onState?.(message.state);
    if (!message?.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.type === "result") pending.resolve(message.text || "");
    else pending.reject(new Error(message.error || "Couldn't transcribe that."));
  }

  transcribe(wavBuffer) {
    this.ensureWorker();
    const id = crypto.randomUUID();
    const file = path.join(this.cacheDir, `${id}.wav`);
    fs.writeFileSync(file, Buffer.from(wavBuffer));
    this.onState?.("transcribing");
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (text) => {
          fs.rm(file, { force: true }, () => {});
          resolve(text);
        },
        reject: (error) => {
          fs.rm(file, { force: true }, () => {});
          reject(error);
        },
      });
      this.worker.send({ type: "transcribe", id, file });
    });
  }

  dispose() {
    this.worker?.kill();
    this.worker = null;
  }
}

module.exports = { AsrService };
