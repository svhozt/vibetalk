# VibeTalk

**Real-time voice dictation from your terminal — speak, and the words appear wherever your cursor is.**
VS Code, Cursor, a terminal, the browser, Slack, any text field.

Everything runs on your machine with a streaming speech model. No API key, no cloud, no audio ever leaves your computer.

```bash
npx vibetalk
```

The first run downloads a **68 MB** model (one time). There is nothing to compile.

## What's new in 1.0

VibeTalk 0.2 used Voxtral through `voxtral.c`, which meant a git clone, a C build and an **8.9 GB** model download. Version 1.0 replaces that engine with [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) streaming models:

|  | 0.2 (Voxtral) | 1.0 |
|---|---|---|
| First-run setup | clone + compile voxtral.c, ~8.9 GB download | **68 MB** download, prebuilt binaries |
| Memory while dictating | — | **~280 MB** (default model) |
| Typing | — | **word by word while you speak** |
| Languages | — | English by default; light DE / FR / ES models; 28 languages with Nemotron |

## How it works

1. Run `vibetalk`. Press **Enter** to start listening, then click into the app you want to type in.
2. Speak. Each word is typed at the cursor as soon as the model is sure of it, about a second after you say it (about 0.3 s with `nemotron`). When you pause, the rest of the phrase is typed too.
3. Pause for a moment, then go back to the VibeTalk terminal and press **Enter** to stop.
4. **Ctrl+C** (or Ctrl+D) quits.

Because Enter is pressed *in the VibeTalk terminal*, anything still unfinished at that moment (usually just a final period) is shown in the terminal rather than typed into it. If words were left, VibeTalk says so.

To avoid switching windows, use a global hotkey: `vibetalk --hotkey` (default **Ctrl+Shift+Space**). Stopping with the hotkey types everything, because your cursor never left the target app. The hotkey only listens: the key combination still reaches the focused app as well, so pick one your apps don't use (`--hotkey ctrl+alt+f9`, or save it with `vibetalk config set hotkey …`).

## Models

All models are *streaming*: they transcribe while you are still speaking, and they only ever append text, so nothing typed has to be taken back. Files are pinned to an exact revision, downloaded from Hugging Face on first use and checked against a SHA-256 hash.

| Model | Download | RAM | Speed* | Word latency* | WER* clean / noisy | Languages |
|---|---|---|---|---|---|---|
| **`kroko-en`** (default) | 68 MB | ~280 MB | ~70× real time | ~0.9 s | 7.7 % / 7.5 % | English |
| `kroko-de` / `kroko-fr` | 68 MB | ~280 MB | ~70× real time | — | — | German / French |
| `kroko-es` | 149 MB | ~450 MB | ~55× real time | — | — | Spanish |
| `nemotron` | 651 MB | ~1.5 GB | ~6× real time | **~0.3 s** | 6.9 % / 8.0 % | 28 languages + auto-detect |

\* Measured on an Apple M4 Pro CPU. RAM is the peak for the whole process. Word latency is the median delay from speaking a word to it being recognised, with frames fed at microphone pace. WER is on a 73-utterance LibriSpeech sample (`hf-internal-testing/librispeech_asr_dummy`), with a pink-noise copy at about 10 dB SNR. The sample is audiobook text full of unusual proper nouns, so for everyday dictation expect better and don't compare with leaderboard numbers.

- **`kroko-*`**: [Kroko](https://huggingface.co/Banafo/Kroko-ASR) streaming Zipformer community models. They are tiny, fast on any CPU and include punctuation and casing. On short real-speech clips the DE, FR and ES models transcribed correctly, but they haven't been benchmarked on a dataset.
- **`nemotron`**: [NVIDIA Nemotron 3.5 ASR Streaming 0.6B](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b) (int8, 160 ms chunks). It's the most responsive, with words appearing about 0.3 s after you say them, and it's multilingual with automatic language detection. It needs about 10× the download and 5× the memory of Kroko, and on the English sample its accuracy was similar.

```bash
vibetalk models                        # list models, show what's installed
vibetalk --model nemotron              # use a model for this run
vibetalk config set model nemotron     # make it the default
vibetalk models download nemotron      # pre-download (e.g. before going offline)
vibetalk models remove nemotron
```

### Languages

```bash
vibetalk --language de      # picks the lightest German model (kroko-de)
vibetalk --language ja      # picks nemotron (Japanese)
vibetalk --model nemotron   # auto-detects the spoken language
```

`--language auto` (the default) means "the model's own language", or automatic detection on multilingual models. Nemotron supports en, es, fr, it, pt, nl, de, tr, ru, ar, hi, ja, ko, vi, uk, pl, sv, cs, nb, da, bg, fi, hr, sk, zh, hu, ro and et.

## Usage

```
vibetalk [start] [options]        Start dictation (default command)
  -m, --model <id>                kroko-en | kroko-de | kroko-fr | kroko-es | nemotron | auto
  -l, --language <code>           en, de, … or auto
  -d, --device <index>            microphone (see `vibetalk devices`)
  --hotkey [combo]                also toggle with a global hotkey (default ctrl+shift+space)
  --type-mode <live|phrase>       live: type words as you speak (default)
                                  phrase: type each phrase when you pause
  --typing-strategy <s>           auto | robotjs | clipboard | none (show transcript only)
  --typing-delay <ms>             delay between typed characters (default 8)
  --threads <n>                   CPU threads for recognition
  --verbose                       debug logging

vibetalk transcribe <file> [--json]   Transcribe an audio file (WAV; other formats need ffmpeg)
vibetalk models [list|download|remove]
vibetalk devices                      List microphones
vibetalk config [list|set|get|reset]  Saved settings, e.g. `vibetalk config set language de`
vibetalk cleanup                      Delete the ~9 GB of Voxtral files left by VibeTalk 0.2
```

### Typing strategies

- **`robotjs`** (default): synthetic keystrokes, one character at a time. Works in nearly every app.
- **`clipboard`**: pastes each phrase with Cmd/Ctrl+V and then restores your clipboard. Use it where keystrokes are unreliable, such as some Wayland or remote-desktop setups. It always types phrase by phrase.
- **`none`**: types nothing and only shows the live transcript in the terminal.

## Permissions

**macOS** asks your terminal app (Terminal, iTerm2, VS Code, Ghostty, …) for two permissions:

- **Microphone**: System Settings → Privacy & Security → Microphone.
- **Accessibility**, needed to type into other apps: System Settings → Privacy & Security → Accessibility. Without it, macOS silently drops the keystrokes. Restart the terminal after granting it.
- With `--hotkey`, also **Input Monitoring**: System Settings → Privacy & Security → Input Monitoring.

If VibeTalk warns that the microphone *delivers pure silence*, the permission is usually missing or the wrong input is selected (`vibetalk devices`).

**Linux**: on X11 typing works out of the box. On Wayland, use `--typing-strategy clipboard` with `ydotool` installed (VibeTalk picks it automatically).

## Platform support

| Platform | Status |
|---|---|
| macOS Apple Silicon | ✅ tested end to end (microphone → model → typing) |
| macOS Intel, Linux x64, Windows x64 | Prebuilt binaries exist for all native dependencies, but these platforms are **untested**. Please report issues. |
| Linux arm64, Windows arm64 | Untested. The speech engine has prebuilt binaries; robotjs does not, so typing falls back to `--typing-strategy clipboard` if it can't be compiled. |

Requires Node.js 20 or newer.

## Upgrading from 0.2

- Your saved settings are kept. Settings from older engines (such as a cloud model name or API key) are ignored. `vibetalk config reset` removes them.
- If you saved `hotkey ctrl+shift+v` with 0.2, note that the new hotkey listener doesn't swallow the key, so apps will also paste. Choose another combo with `vibetalk config set hotkey ctrl+shift+space`.
- The old Voxtral engine and its weights in `~/.vibetalk/voxtral` are no longer used. Free about 9 GB with `vibetalk cleanup`.

## Privacy and network

Audio is processed in memory and never stored or sent anywhere. The only network access is the one-time model download from Hugging Face. Set `HF_ENDPOINT` to use a mirror.

| Variable | Purpose |
|---|---|
| `VIBETALK_HOME` | Where models (and, when set, the config) live. Default `~/.vibetalk` |
| `HF_ENDPOINT` | Hugging Face mirror for model downloads |

## Development

```bash
npm install
npm run build
npm test                        # unit tests (no models needed)
VIBETALK_MODEL_TESTS=1 npm test # + real-model tests on macOS (downloads ~1 GB)

# macOS end-to-end checks
node test/e2e/mic-loopback-macos.mjs              # mic path, via the BlackHole virtual device
node test/e2e/typing-textedit-macos.mjs file.wav  # real keystrokes into a TextEdit document
```

## Credits and licenses

VibeTalk is MIT-licensed. It builds on [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0), [PvRecorder](https://github.com/Picovoice/pvrecorder) (Apache-2.0), [robotjs](https://github.com/hurdlegroup/robotjs) (MIT) and [uiohook-napi](https://github.com/SnosMe/uiohook-napi) (MIT).

The models are downloaded separately and carry their own licenses:

- Kroko community models: CC-BY-SA, © [Banafo](https://kroko.ai). The publisher doesn't state a version, and the LICENSE file in their repo is empty.
- Nemotron 3.5 ASR Streaming: [OpenMDW-1.1](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b), © NVIDIA
