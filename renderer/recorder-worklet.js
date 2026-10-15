class LectureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(16000);
    this.offset = 0;
    this.paused = true;
    this.port.onmessage = ({ data }) => {
      if (data.type === "flush") {
        this.emit();
        this.port.postMessage({ type: "flushed", id: data.id });
      }
      if (data.type === "pause") { this.paused = true; this.emit(); }
      if (data.type === "resume") this.paused = false;
    };
  }
  emit() {
    if (!this.offset) return;
    const chunk = this.samples.slice(0, this.offset);
    this.offset = 0;
    this.port.postMessage({ type: "pcm", buffer: chunk.buffer }, [chunk.buffer]);
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!this.paused && input) {
      for (const value of input) {
        const sample = Math.max(-1, Math.min(1, value));
        this.samples[this.offset++] = sample * (sample < 0 ? 32768 : 32767);
        if (this.offset === this.samples.length) this.emit();
      }
    }
    return true;
  }
}
registerProcessor("lecture-pcm", LectureProcessor);
