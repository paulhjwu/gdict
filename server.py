#!/usr/bin/env python3
"""
Dictionary app server: serves static files and provides server-side Google TTS.
Usage: python3 server.py [port]   (default: 8765)
       or: uvicorn server:app --port 8765
"""
import base64, sys
from pathlib import Path

import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleRequest
from fastapi import FastAPI, Query
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).parent
WORD_AUDIO_DIR = BASE_DIR / "word_audio"
WORD_AUDIO_DIR.mkdir(exist_ok=True)
SA_KEY_FILE = BASE_DIR / "avian-casing-491003-p0-8361d893391b.json"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}

app = FastAPI()

_credentials = None

def get_credentials():
    global _credentials
    if _credentials is None or not _credentials.valid:
        creds = service_account.Credentials.from_service_account_file(
            str(SA_KEY_FILE),
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        creds.refresh(GoogleRequest())
        _credentials = creds
    elif _credentials.expired:
        _credentials.refresh(Request())
    return _credentials


@app.options("/api/word-audio")
def word_audio_preflight():
    return Response(headers=CORS)


@app.get("/api/word-audio")
def word_audio(translit: str = Query(...), text: str = Query(...)):
    cache_path = WORD_AUDIO_DIR / f"{translit}.mp3"
    if cache_path.exists():
        return Response(content=cache_path.read_bytes(), media_type="audio/mpeg", headers=CORS)

    try:
        creds = get_credentials()
        resp = requests.post(
            "https://texttospeech.googleapis.com/v1/text:synthesize",
            headers={"Authorization": f"Bearer {creds.token}"},
            json={
                "input": {"text": text},
                "voice": {"languageCode": "el-GR", "ssmlGender": "NEUTRAL"},
                "audioConfig": {"audioEncoding": "MP3"},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        audio_b64 = data.get("audioContent")
        if not audio_b64:
            msg = data.get("error", {}).get("message", "No audio returned")
            return Response(content=msg.encode(), status_code=500, headers=CORS)
        audio_bytes = base64.b64decode(audio_b64)
        cache_path.write_bytes(audio_bytes)
        return Response(content=audio_bytes, media_type="audio/mpeg", headers=CORS)
    except Exception as e:
        return Response(content=str(e).encode(), status_code=500, headers=CORS)


# Static file serving — must be mounted last so /api routes take precedence
app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"Dictionary server running at http://localhost:{port}")
    print("Press Ctrl-C to stop.")
    uvicorn.run(app, host="0.0.0.0", port=port)
