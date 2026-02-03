"""
Local Whisper transcription service.

Requirements:
- Python 3.10+
- ffmpeg installed system-wide (brew install ffmpeg / apt install ffmpeg)
- pip install -r requirements.txt

Run: uvicorn server:app --host 0.0.0.0 --port 8000
"""

import tempfile
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import whisper

app = FastAPI(title="Whisper Transcription Service")

# Allow CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# Load model once at startup
model = None


@app.on_event("startup")
async def load_model():
    global model
    print("Loading Whisper turbo model...")
    model = whisper.load_model("turbo")
    print("Model loaded.")


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """
    Accepts audio file (wav, mp3, webm, etc.), returns transcript and detected language.
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    # Save uploaded file to temp location
    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = model.transcribe(tmp_path)
        return {
            "text": result["text"].strip(),
            "language": result.get("language", "unknown"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}
