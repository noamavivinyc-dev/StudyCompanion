class LectureRecorder {
  constructor() {
    this.queue = Promise.resolve();
    this.samples = 0;
    this.pendingCount = 0;
    this.paused = false;
    this.failure = null;
    this.flushes = new Map();
  }
  get duration() { return this.samples / 16000; }
  async prepare(deviceId) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } });
      this.context = new AudioContext({ sampleRate: 16000 });
      if (this.context.sampleRate !== 16000) throw new Error("This microphone cannot record at the required sample rate. Try another microphone.");
      await this.context.audioWorklet.addModule("recorder-worklet.js");
      this.source = this.context.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.context, "lecture-pcm");
      this.node.port.onmessage = ({ data }) => {
        if (data.type === "flushed") { this.flushes.get(data.id)?.(); this.flushes.delete(data.id); return; }
        if (data.type !== "pcm" || this.failure) return;
        const bytes = new Uint8Array(data.buffer);
        this.samples += bytes.length / 2;
        this.pendingCount++;
        if (this.pendingCount > 30) { this.fail(new Error("Saving is taking too long. Recording paused to protect the saved audio.")); return; }
        this.queue = this.queue.then(() => this.onChunk(bytes)).catch((error) => this.fail(error)).finally(() => this.pendingCount--);
      };
      this.stream.getTracks().forEach((track) => track.addEventListener("ended", () => this.fail(new Error("Microphone disconnected. Finish saving this recording, then reconnect your microphone."))));
      this.source.connect(this.node);
      this.node.connect(this.context.destination); // The worklet outputs silence, so there is no microphone echo.
      await this.context.resume();
    } catch (error) { await this.dispose(); throw error; }
  }
  begin(onChunk, onError) {
    this.onChunk = onChunk;
    this.onError = onError;
    this.node.port.postMessage({ type: "resume" });
  }
  fail(error) {
    if (this.failure) return;
    this.failure = error;
    this.paused = true;
    this.node?.port.postMessage({ type: "pause" });
    this.onError?.(error);
  }
  async flush() {
    if (!this.node) return;
    const id = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.flushes.delete(id); reject(new Error("The microphone stopped responding. Saved audio is still available.")); }, 3000);
      this.flushes.set(id, () => { clearTimeout(timer); resolve(); });
      this.node.port.postMessage({ type: "flush", id });
    });
    await this.queue;
  }
  async pause() { this.paused = true; this.node.port.postMessage({ type: "pause" }); await this.flush(); }
  resume() { if (this.failure) throw this.failure; this.paused = false; this.node.port.postMessage({ type: "resume" }); }
  async stop() {
    try { await this.pause(); } finally { await this.dispose(); }
  }
  async dispose() {
    this.source?.disconnect(); this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.stream = null; this.node = null; this.context = null;
  }
}
