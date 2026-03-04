"""
AI Study Buddy — Flask Backend
EduNet Internship Project

This server acts as a secure API proxy so the Anthropic API key
is never exposed in the frontend JavaScript.

Setup:
    pip install flask flask-cors requests python-dotenv
    
Run:
    python app.py
"""

import os
import json
import requests
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv

# ── Load environment variables from .env file ──────────────────
load_dotenv()

app = Flask(__name__, template_folder='.', static_folder='static')
CORS(app)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL             = "claude-haiku-4-5-20251001"


# ── Serve the frontend ─────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ── API Proxy: Standard (for JSON responses) ───────────────────
@app.route("/api/ask", methods=["POST"])
def ask():
    data   = request.get_json()
    prompt = data.get("prompt", "").strip()

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY not set in .env"}), 500

    payload = {
        "model":      MODEL,
        "max_tokens": 600,
        "messages":   [{"role": "user", "content": prompt}]
    }

    headers = {
        "Content-Type":         "application/json",
        "x-api-key":            ANTHROPIC_API_KEY,
        "anthropic-version":    "2023-06-01"
    }

    response = requests.post(ANTHROPIC_API_URL, json=payload, headers=headers)

    if response.status_code != 200:
        return jsonify({"error": "API request failed", "details": response.text}), response.status_code

    result = response.json()
    text   = "".join(block.get("text", "") for block in result.get("content", []))
    return jsonify({"text": text})


# ── API Proxy: Streaming (for explain & summarize) ────────────
@app.route("/api/ask/stream", methods=["POST"])
def ask_stream():
    data   = request.get_json()
    prompt = data.get("prompt", "").strip()

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY not set in .env"}), 500

    payload = {
        "model":      MODEL,
        "max_tokens": 600,
        "stream":     True,
        "messages":   [{"role": "user", "content": prompt}]
    }

    headers = {
        "Content-Type":         "application/json",
        "x-api-key":            ANTHROPIC_API_KEY,
        "anthropic-version":    "2023-06-01"
    }

    def generate():
        with requests.post(ANTHROPIC_API_URL, json=payload, headers=headers, stream=True) as r:
            for line in r.iter_lines():
                if line:
                    yield line.decode("utf-8") + "\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*"
        }
    )


# ── Health check ───────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({
        "status":    "ok",
        "model":     MODEL,
        "api_key":   "set" if ANTHROPIC_API_KEY else "missing"
    })


if __name__ == "__main__":
    print("=" * 50)
    print("  AI Study Buddy — Flask Server")
    print("  Running at: http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)
