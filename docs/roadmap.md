---
sidebar_position: 5
description: Past milestones and future development plans
---

# Roadmap

## Recent milestones (v0.2 → v0.4)

- [x] Math engine: Q31.32 fixed-point, lexer, parser, evaluator, distributions
- [x] Boot layer: vector table, `.bss`/`.data` init, Reset handler
- [x] HAL: UART, I2C, GPIO, clock configuration, OLED driver
- [x] Runtime: event loop, state machine, input handling
- [x] UI: 5×7 bitmap font, formula renderer, Σ/∫ glyphs
- [x] `nthroot(x,n)` with proper domain checking
- [x] `natural_log` range reduction fix for sub-ppm accuracy
- [x] Trailing-zero stripping in formatted output
- [x] Full documentation: README, ARCHITECTURE, CONTRIBUTING, HACKING, ROADMAP
- [x] Case-sensitive identifiers — `e` is Euler's constant, `E` is register E
- [x] `sto(value, var)` — store value into register A–Z
- [x] Implicit multiplication — `3(5)`, `(a)b`, `(x)(y)`, `2sin(x)`
- [x] Complex numbers — full arithmetic, transcendental functions, `a+bi` display
- [x] Mode switching — Escape toggles Standard / Advanced
- [x] Scrollable results on 96×16 OLED
- [x] Cursor-based input editing

## Short-term

### Testing infrastructure
- [x] Host-side unit test suite for `math/`
- [x] CI pipeline: host-side tests on every PR
- [ ] Test-vector generator script (Python `Decimal`)

### Math engine hardening
- [ ] Fractional display mode (`1/3` instead of `0.333333`)
- [ ] Overflow detection in more paths
- [ ] Configurable output precision

### Developer experience
- [ ] `.vscode/` configuration
- [ ] `cargo run` wrapper that starts QEMU automatically

## Medium-term

### Port to modern hardware

The math engine and runtime are already hardware-independent. Candidate targets:
- **RP2040** (Raspberry Pi Pico) — \$4, dual-core Cortex-M0+
- **STM32F4** — Cortex-M4F with FPU, \$5–15
- **ESP32** — dual-core LX6, Wi-Fi/BT
- **ATSAMD51** — Cortex-M4F, used in Adafruit boards

For each port: rewrite `hal/`, update `boot.rs` + `link.x`. Zero `numcore/` changes.

### Reference hardware design
- [ ] Open-source KiCad PCB (mechanical keyswitches, OLED, USB-C)
- [ ] 3D-printable enclosure
- [ ] BOM targeting \$20–30

### Graphing mode
- [ ] Function plotting on display
- [ ] Pan/zoom with register-based viewport
- [ ] Multiple simultaneous plots
- [ ] Table of values

### Matrix operations
- [ ] Matrix type (fixed-size buffer)
- [ ] Addition, multiplication, transpose, determinant, inverse
- [ ] Solve linear systems

### Standalone math crate
- [ ] Extract `math/` as `numcore-math` on crates.io
- [ ] Platform-agnostic (including `std` environments)

## Long-term

### Advanced calculator modes
- [ ] Scientific mode: unit conversions, physical constants
- [ ] Programming mode: HEX/DEC/OCT/BIN, bitwise ops
- [ ] Statistics mode: data entry, linear regression
- [ ] CAS basics: symbolic diff/integration, simplification

### Ecosystem
- [ ] Curriculum alignment (IB, A-level, AP, SAT)
- [ ] Flash-based storage across reboots
- [ ] USB virtual serial port + firmware updates
- [ ] Open source textbook companion

### Community
- [x] **Dedicated documentation site** ← you are here
- [ ] Community port catalogue
- [ ] Web-based WASM simulator
- [ ] Internationalisation (i18n)
- [ ] SPI flash image builder

### Distributions
- [ ] CE/FCC-certified reference design
- [ ] Kickstarter / group-buy
- [ ] School pilot programme
- [ ] Exam-board approval (1–3 year lead time)

## Non-goals

- **Touchscreen UI** — hurts battery life and cost
- **Full CAS like Mathematica** — calculator-grade scope only
- **Proprietary lock-in** — open-source hardware (CERN-OHL-S)
- **Mobile app** — dedicated hardware project
- **Wireless exam cheating vectors** — no Wi-Fi/BT in exam modes
