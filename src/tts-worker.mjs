import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";

if (process.env.STUDY_MODEL_CACHE) env.cacheDir = process.env.STUDY_MODEL_CACHE;

let modelPromise;

function model() {
  if (!modelPromise) {
    process.send?.({ type: "state", state: "downloading_voice" });
    modelPromise = KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "cpu",
    });
  }
  return modelPromise;
}

process.on("message", async (message) => {
  if (message?.type !== "speak") return;
  try {
    const tts = await model();
    const audio = await tts.generate(message.text, { voice: message.voice || "af_heart", speed: 1.03 });
    await audio.save(message.output);
    process.send?.({ type: "ready", id: message.id, path: message.output });
  } catch (error) {
    process.send?.({ type: "error", id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
});
