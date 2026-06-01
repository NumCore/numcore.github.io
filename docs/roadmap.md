---
sidebar_position: 8
description: Past milestones and future development plans
---

# Roadmap

## Milestone: Core foundation (v0.1 -- v0.4) -- complete

- [x] Math engine: Q31.32 fixed-point with CORDIC, minimax, CLZ sqrt, rational atan2
- [x] Lexer: expression string to typed token stream (max 32 tokens)
- [x] Parser: recursive-descent PEMDAS with implicit multiplication, flat-arena AST (max 64 nodes)
- [x] Evaluator: full operator/function dispatch, sum/int loop aggregates
- [x] Complex numbers: Smith's robust division, all transcendental functions
- [x] Variable storage: Ans + 26 registers A-Z, copy-on-read for loop shadowing
- [x] Statistical distributions: Stirling log-gamma, log-factorial, binomial, Poisson, chi-squared CDF
- [x] Boot layer: vector table, .bss/.data init, Reset handler
- [x] HAL: UART, I2C, GPIO, clock, OLED driver (SSD0303)
- [x] Runtime: event loop, state machine, ANSI escape sequence parser
- [x] UI: 5x7 bitmap font, formula renderer, Sigma/Integral glyphs
- [x] nthroot with proper domain checking
- [x] natural_log range reduction fix for sub-ppm accuracy
- [x] Trailing-zero stripping in formatted output
- [x] Case-sensitive identifiers: e is Euler's constant, E is register E
- [x] sto(value, var) -- store value into register A-Z
- [x] Degrees mode (Ctrl+D toggle) with angle conversion rules
- [x] Scrollable results on 96x16 OLED
- [x] Cursor-based input editing
- [x] Host-side unit test suite (276 tests, 270 active)
- [x] CI pipeline: host-side tests on every PR
- [x] Dedicated documentation site (Docusaurus, GitHub Pages)
- [x] Memory optimisation: Flash 77% to 82%, stack headroom
- [x] zero-unsafe rule enforced in math/runtime/ui
- [x] Overflow detection in complex paths (Smith's division)
- [x] floor/ceil/round functions for user expressions

## Short-term

### Testing infrastructure

- [ ] Test-vector generator script (Python Decimal for exact reference values)
- [ ] CI: firmware build check on every PR
- [ ] Property-based tests for arithmetic roundtrips
- [ ] Coverage reporting

### Math engine hardening

- [ ] Fractional display mode ($1/3$ instead of $0.333333$)
- [ ] Configurable output precision (3-9 decimal places)

### Developer experience

- [ ] `.vscode/` configuration in repository
- [ ] `cargo run` wrapper that starts QEMU automatically
- [ ] GDB init script for quick debugging setup
- [ ] Release build CI artifact

## Medium-term

### Port to modern hardware

The math engine and runtime are already hardware-independent. Candidate targets:

| Target              | Core         | Flash  | RAM   | Price  |
|---------------------|-------------|--------|-------|--------|
| RP2040 (Pi Pico)   | Cortex-M0+  | 2 MB   | 264 KB| $4     |
| STM32F411          | Cortex-M4F  | 512 KB | 128 KB| $8     |
| STM32G431          | Cortex-M4F  | 128 KB | 32 KB | $5     |
| ESP32-C3           | RISC-V      | 4 MB   | 400 KB| $3     |
| ATSAMD51           | Cortex-M4F  | 512 KB | 192 KB| $10    |

For each port: rewrite `hal/`, update `boot.rs` + `link.x`. Zero `numcore/`
changes.

### Reference hardware design

- [ ] Open-source KiCad PCB (mechanical keyswitches, OLED, USB-C)
- [ ] 3D-printable enclosure
- [ ] BOM targeting \$20-30
- [ ] Cherry MX / Kailh Choc switch support
- [ ] Battery charging circuit (LiPo)

### Graphing mode

- [ ] Function plotting on OLED
- [ ] Pan/zoom with register-based viewport
- [ ] Multiple simultaneous plots (up to 3)
- [ ] Table of values
- [ ] Dynamic y-axis scaling

### Matrix operations

- [ ] Matrix type (fixed-size buffer, max 4x4)
- [ ] Addition, multiplication, transpose
- [ ] Determinant, inverse
- [ ] Solve linear systems (2x2, 3x3)

### Standalone math crate

- [ ] Extract `math/` as `numcore-math` on crates.io
- [ ] Platform-agnostic (std and no_std)
- [ ] Python/JS bindings for cross-validation

## Long-term

### Advanced calculator modes

- [ ] Scientific mode: unit conversions, physical constants
- [ ] Programming mode: HEX/DEC/OCT/BIN, bitwise ops
- [ ] Statistics mode: data entry, linear regression
- [ ] CAS basics: symbolic differentiation/integration, simplification

### Hardware milestones

- [ ] CE/FCC-certified reference design
- [ ] USB virtual serial port with firmware updates
- [ ] SPI flash for persistent storage across reboots
- [ ] Low-power mode for battery operation

### Ecosystem

- [ ] Curriculum alignment (IB, A-level, AP, SAT)
- [ ] Open source textbook companion
- [ ] Web-based WASM simulator
- [ ] Community port catalogue
- [ ] Internationalisation (i18n)

### Community

- [ ] Contribution guide for new function requests
- [ ] Web-based WASM simulator
- [ ] Internationalisation (i18n)
- [ ] SPI flash image builder

## Non-goals

- **Touchscreen UI** -- hurts battery life, increases BOM cost, reduces
  tactility
- **Full CAS like Mathematica** -- calculator-grade scope only; no symbolic
  heavy lifting
- **Proprietary lock-in** -- open-source hardware (CERN-OHL-S license)
- **Mobile app** -- this is a dedicated hardware project
- **Wireless exam cheating vectors** -- no Wi-Fi/BT in exam modes
- **Multi-line expression input** -- single-line with cursor editing is
  sufficient for calculator scope
- **Graphical function plotting on host** -- target is embedded OLED only
