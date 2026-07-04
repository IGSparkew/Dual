# Dual

**Dual** is a visual DAW — a bidirectional graphical layer on top of [Strudel](https://strudel.cc/). The Strudel code is the single source of truth: every visual action generates code, and every code change updates the UI.

```
Visual UI ──generates──▶ Strudel code ──evaluates──▶ Events/Haps ──▶ superdough (audio)
                                                            │
                                                     Panel Registry ──▶ UI updates
```

[![Latest release](https://img.shields.io/github/v/release/IGSparkew/struddle-daw?label=latest%20release)](https://github.com/IGSparkew/struddle-daw/releases/latest)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

## Download

Grab the latest build for your platform (Windows, macOS, Linux) from the **[latest release](https://github.com/IGSparkew/struddle-daw/releases/latest)**.

## Features

- **Session View** — clip grid for launching and arranging patterns
- **Code Editor** — CodeMirror 6 editor with Strudel syntax highlighting
- **Visualizer** — piano roll and drum grid rendered from live haps
- **Mixer** — visual faders, knobs and meters synced to `.gain()` / `.pan()`
- **FX Rack** — visual effect chains (`.room()`, `.delay()`, ...)
- **Automation** — draw curves that compile to Strudel patterns
- **Browser** — sample browser with an offline, vendored sample library
- **Module system** — every panel (built-in or user-made) is a hot-loadable module with the same API

## Tech stack

| | |
|---|---|
| Bundler | Vite |
| Language | TypeScript |
| UI | React 18 + Zustand |
| Code editor | CodeMirror 6 |
| Audio | Strudel (`@strudel/core`, `@strudel/transpiler`, `@strudel/webaudio`, `@strudel/mini`) + superdough |
| Desktop | Electron |

## Development

```bash
npm install
npm run dev       # dev server (Vite, port 3000)
npm run build     # tsc && vite build
npm run dist      # package the Electron app (see electron-builder.json)
```

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and the module system.

## License

[AGPL-3.0](LICENSE)
