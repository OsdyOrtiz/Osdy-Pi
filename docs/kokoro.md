# Optional local Spanish speech with Kokoro

Kokoro adds **Kokoro Dora**, **Kokoro Alex**, and **Kokoro Santa** to the existing Speech selector. Native macOS speech remains the default: **Paulina**, narration **off**, **180 wpm**. Native voices never need a server. Kokoro uses a free local model, not cloud speech or voice cloning; initial playback support is macOS only.

## Quick path

1. On an Apple Silicon Mac, explicitly prepare the isolated Python environment below and start the local MLX-Audio service in a separate terminal.
2. In Pi, open **`/osdyConfig` → Speech → Voice**, browse with **←/→**, then choose **Preview voice**. Kokoro previews use a fixed Spanish sample; native voices retain their fixed English sample. Preview uses the unsaved draft without saving it or enabling narration.
3. Return to **Voice** and press **Enter** to save the draft. **Read last response** uses the saved voice even while narration is disabled. Enable automatic narration only if wanted.
4. Use **Stop**, **Ctrl+Option+S** from chat, or **`/osdy-pi speech stop`** to cancel pending synthesis or playback. If the terminal cannot deliver the shortcut, use the command. Leaving Speech or closing its panel stops only its preview, not unrelated narration.

## Explicit environment setup

Prerequisites: an **Apple Silicon Mac** and **uv**. The example explicitly downloads a managed Python 3.11 interpreter inside the project rather than installing Python packages globally. No npm runtime dependency is added.

The isolated environment was prepared successfully on an **M3 Pro / 18 GiB RAM** with **Python 3.11.15**, **MLX-Audio 0.5.9**, **Misaki 0.9.4**, and **espeakng-loader 0.2.4**. A Spanish `EspeakG2P(language="es")` probe returned phonemes successfully. `espeakng-loader` supplies the native library used by Misaki in this setup; no separate global Homebrew install was needed. All three Spanish voices also produced valid 24 kHz mono WAV through the local HTTP server. Audible playback and subjective listening quality were not evaluated.

Run from the project root. These environment variables must also be set in every terminal that runs setup, model download, or the server:

```bash
export KOKORO_HOME="$PWD/.pi-dev/kokoro"
export UV_CACHE_DIR="$KOKORO_HOME/cache/uv"
export UV_PYTHON_INSTALL_DIR="$KOKORO_HOME/python"
export HF_HOME="$KOKORO_HOME/cache/huggingface"
export HF_HUB_CACHE="$HF_HOME/hub"
export HUGGINGFACE_HUB_CACHE="$HF_HUB_CACHE"
export XDG_CACHE_HOME="$KOKORO_HOME/cache/xdg"
export PIP_CACHE_DIR="$KOKORO_HOME/cache/pip"
export TORCH_HOME="$KOKORO_HOME/cache/torch"
export NUMBA_CACHE_DIR="$KOKORO_HOME/cache/numba"
export MPLCONFIGDIR="$KOKORO_HOME/cache/matplotlib"
export PYTHONPYCACHEPREFIX="$KOKORO_HOME/cache/pycache"
export HF_HUB_DISABLE_TELEMETRY=1
mkdir -p "$KOKORO_HOME"
uv --no-config venv --managed-python --python 3.11 "$KOKORO_HOME/venv"
uv --no-config pip install --python "$KOKORO_HOME/venv/bin/python" \
  'mlx-audio[server,tts]==0.5.9' 'misaki[en]==0.9.4' \
  'espeakng-loader==0.2.4' soundfile
# Explicitly download before playback: a first download can exceed the request timeout.
"$KOKORO_HOME/venv/bin/python" -c \
  'from huggingface_hub import snapshot_download; snapshot_download("mlx-community/Kokoro-82M-bf16")'
```

The managed interpreter, virtualenv, package caches, and model cache are explicitly project-contained. If you prefer an existing Python 3.10+ interpreter, omit `--managed-python` and supply its path to `--python`. Do not silently fall back to a global package environment. Keep any additional dependency caches project-local too.

### Start the server separately

With the same environment variables, start the server. These bind flags were exercised successfully with MLX-Audio 0.5.9; inspect `--help` when changing versions:

```bash
"$KOKORO_HOME/venv/bin/python" -m mlx_audio.server --help
"$KOKORO_HOME/venv/bin/python" -m mlx_audio.server --host 127.0.0.1 --port 8000
```

Bind only to **127.0.0.1:8000**, never `0.0.0.0` or a LAN address. Leave the process running to keep the model warm. Model files are downloaded only during explicit model setup or the first explicit Kokoro request, not by catalog browsing, selection, or native speech. The extension never installs Python packages, downloads models on startup, or launches the server automatically. Dependency/model setup can require internet access; synthesis sends response text only to the local service. Use a trusted local service that does not forward or log sensitive text.

## Integration contract

| Setting | Fixed behavior |
| --- | --- |
| Default origin | `http://127.0.0.1:8000` |
| Optional override | `OSDY_PI_KOKORO_URL`, set in Pi's launch environment |
| Allowed origins | HTTP with literal `127.0.0.1` or `[::1]` only; optional port, no path beyond `/`, credentials, query, or fragment. Hostnames including `localhost` are not accepted. Redirects are never followed. |
| Model | `mlx-community/Kokoro-82M-bf16` |
| Voices | `Kokoro Dora` → `ef_dora`; `Kokoro Alex` → `em_alex`; `Kokoro Santa` → `em_santa` |
| Language / format | Spanish `lang_code: "e"`; complete WAV generated before playback |
| Rate | Existing wpm setting mapped to bounded Kokoro `speed = rate / 180`; 180 maps to 1.0, not a measured words-per-minute promise |
| Settings | Existing v1 voice-name setting; no new engine selector, command grammar, or migration |

This is **not audio streaming**. Automatic speech waits for the successful settled final assistant response; it does not speak unfinished responses, thinking, tools, or fenced code. The first cold request may include model download/loading and be much slower than warm synthesis. Long responses also wait for the full WAV before playback; no latency or quality target is established here.

## Failures and verification

An unavailable server, missing Spanish dependency, rejected origin, synthesis failure, or playback failure is an error—not permission to silently substitute a native voice. Explicit playback reports failure; automatic speech failures do not interrupt the agent. Choose an installed native voice explicitly if you want to continue without Kokoro. Speech remains independent of Sounds mute.

### Observed local synthesis

An isolated MLX-Audio 0.5.9 server on an M3 Pro / 18 GiB generated the same short Spanish sample through `/v1/audio/speech` with the fixed model/language/WAV contract:

| Request | Complete WAV generation | Audio duration |
| --- | --- | --- |
| Dora, first inference after download | 5.664 s | 4.350 s |
| Dora, same sample with warm model | 0.268 s | 4.350 s |
| Alex | 1.176 s | 4.325 s |
| Santa | 1.123 s | 4.325 s |

The one-time model download took about 291 seconds. These are short-sample measurements, not general latency guarantees or time-to-first-stream benchmarks. Generated WAVs were validated without playing sound; no subjective naturalness or accent ranking is established. Automated tests and independent public-interface probes passed for request cancellation, native independence, selector drafts and settings preservation. The independent check also exercised a real filesystem and a harmless child process: private directory/file modes were 0700/0600, Stop terminated the process, and WAV cleanup waited for child close. No audible player was invoked.

**Long Spanish responses are not yet validated.** MLX-Audio's Spanish phonemizer warns: `Chunking logic not yet implemented, so long texts may be truncated unless you split them with '\n'.` Osdy currently normalizes newlines before synthesis, so adding newlines to a response is not an app-level workaround. Prefer a native voice for long responses until Kokoro chunking/completeness is evaluated. Listening quality, audible-device playback, physical shortcut delivery, clean-machine installation and installed-package execution remain unverified.

Primary references: [MLX-Audio server and TTS guidance](https://github.com/Blaizzy/mlx-audio) and [Kokoro-82M model/language documentation](https://huggingface.co/hexgrad/Kokoro-82M).
