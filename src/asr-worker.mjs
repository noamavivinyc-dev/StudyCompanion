import { pipeline, env } from "@huggingface/transformers";
import fs from "node:fs";

if (process.env.STUDY_MODEL_CACHE) env.cacheDir = process.env.STUDY_MODEL_CACHE;

let transcriberPromise;

function transcriber() {
  if (!transcriberPromise) {
    process.send?.({ type: "state", state: "downloading_speech_model" });
    transcriberPromise = pipeline("automatic-speech-recognition", "onnx-community/whisper-base.en", {
      dtype: "q8",
      device: "cpu",
    });
  }
  return transcriberPromise;
}

function decodeWav(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Voice recording was not a valid WAV file.");
  }
  let format = 1;
  let channels = 1;
  let bits = 16;
  let dataStart = -1;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (name === "fmt " && size >= 16) {
      format = bytes.readUInt16LE(offset + 8);
      channels = bytes.readUInt16LE(offset + 10);
      bits = bytes.readUInt16LE(offset + 22);
    }
    if (name === "data") {
      dataStart = offset + 8;
      dataSize = Math.min(size, bytes.length - dataStart);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0 || !dataSize) throw new Error("Voice recording contained no audio.");
  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataSize / (bytesPerSample * channels));
  const audio = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const offset = dataStart + (frame * channels + channel) * bytesPerSample;
      if (format === 1 && bits === 16) sum += bytes.readInt16LE(offset) / 32768;
      else if (format === 3 && bits === 32) sum += bytes.readFloatLE(offset);
      else throw new Error(`Unsupported WAV encoding: format ${format}, ${bits}-bit.`);
    }
    audio[frame] = sum / channels;
  }
  return audio;
}

process.on("message", async (message) => {
  if (message?.type !== "transcribe") return;
  try {
    const asr = await transcriber();
    const result = await asr(decodeWav(message.file), { chunk_length_s: 20, stride_length_s: 3 });
    process.send?.({ type: "result", id: message.id, text: String(result?.text || "").trim() });
  } catch (error) {
    process.send?.({ type: "error", id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
});
