# Offline timetable OCR runtime

The Java service still reads timetable anchors locally with Tesseract. Colored course text uses the pinned PP-OCRv5 recognition model through RapidOCR/ONNX Runtime on the same server. Neither an API key nor an external inference service is used. The worker rejects network connections and verifies the model SHA256 before reading private pixels.

`requirements.lock` pins the Python distributions; `runtime-manifest.json` pins the exact Linux CPython 3.12 wheels and the recognition model. The model comes from RapidAI's published model registry, derived from PaddlePaddle PP-OCRv5 under Apache-2.0. Wheel archives retain their upstream license files. See the model's upstream URL in the manifest and [RapidOCR's model attribution](https://rapidai.github.io/RapidOCRDocs/main/model_licenses/).

Prepare a `runtime-bundle/` directory with `manifest.json`, `wheels/`, and `models/`. Obtain the exact wheel filenames from PyPI using the locked versions and Linux x86_64 manylinux tags; obtain the model from the manifest URL. Check every file's size and SHA256 against the manifest before transfer. Do not include user screenshots or recognized course text in the bundle.

On the authorized host, run `python3 deploy/install-ocr-runtime.py --bundle runtime-bundle --manifest deploy/ocr-runtime/runtime-manifest.json`. The installer builds a separate virtual environment without pip or network access, verifies every artifact, imports the runtime, and installs it atomically at `/opt/campus-ai/ocr/ppocrv5-20261101-r1`. It does not change system Python, Caddy, environment files, database schema, or running services. Reinstallation over an existing runtime is refused; inspect its manifest first.

The application extracts its own versioned worker from the JAR into a private temporary job directory. Java owns the input pixels and region metadata and deletes them after success/failure. A missing or failed accurate runtime does not silently fall back to the former low-quality text path. Keep the previous application JAR for rollback; it does not consume this new runtime.
