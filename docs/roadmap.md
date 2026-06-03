---
sidebar_position: 8
description: Past milestones and future development plans
---

# Roadmap

## Milestone: Core foundation (v0.1 – v0.4) — complete

- [x] Math engine: Q31.32 fixed-point with CORDIC, minimax, CLZ sqrt, rational atan2
- [x] Lexer: expression string to typed token stream (max 64 tokens)
- [x] Parser: recursive-descent PEMDAS with implicit multiplication
- [x] Evaluator: full operator/function dispatch, sum/int loop aggregates
- [x] Complex numbers: Smith's robust division, all transcendental functions
- [x] Variable storage: Ans + 26 registers A-Z, copy-on-read for loop shadowing
- [x] Statistical distributions: Stirling log-gamma, log-factorial, binomial, Poisson, chi-squared CDF
- [x] Boot layer: vector table, .bss/.data init, Reset handler
- [x] HAL: UART, I2C, GPIO, clock, OLED driver (SSD0303)
- [x] Runtime: event loop, state machine, ANSI escape sequence parser
- [x] UI: 5x7 bitmap font, formula renderer, Sigma/Integral glyphs
- [x] Host-side unit test suite (300 tests)
- [x] Overflow-aware scientific notation display
- [x] Degrees mode (Ctrl+D toggle)

## Milestone: Bytecode VM & Matrix/Scientific modes (v0.5 – v0.6) — complete

- [x] Bytecode VM replacing recursive AST evaluator (flat dispatch, 16-entry value stack, zero C stack growth)
- [x] Compiler: recursive-descent emits opcodes into 256 B fixed buffer
- [x] 12 opcodes, `CallFunction(u8)` deduplicates 22 separate function call opcodes
- [x] Stack overflow eliminated: `1+1+1+1+1+1+1+1+1+1` now works (was silent `.bss` corruption)
- [x] Matrix type (fixed-size buffer, max 4×4)
- [x] Matrix addition, multiplication, transpose
- [x] Matrix determinant, inverse, cofactor, adjugate
- [x] Matrix literals: `[(a,b)(c,d)]` syntax
- [x] Matrix registers: `MatA`, `MatB`, `MatC`
- [x] Three-mode cycle (Standard, Advanced, Matrix)
- [x] Scientific notation (Scientific mode): `1.5E+10` syntax, ±99 exponent hard limit
- [x] Scientific arithmetic (multiply, divide, add, subtract, power)
- [x] Auto-conversion to Scalar when value fits Q31.32 exactly
- [x] Four-mode cycle (Standard, Advanced, Matrix, Scientific)
- [x] Overflow sentinel (bypasses LTO-corrupted `EvalResult::Overflow` enum layout)
- [x] Deduplication: 22 function opcodes → `CallFunction(u8)`, 6 matrix opcodes → `CallMatrixFunc(u8)`
- [x] Flash: 57,728 B → 63,029 B (96.2%)
- [x] SRAM: 5,088 B → 4,312 B (52.6%)

## Short-term

### Testing infrastructure

- [ ] Test-vector generator script (Python Decimal for exact reference values)
- [ ] Property-based tests for arithmetic roundtrips
- [ ] Coverage reporting

### Math engine hardening

- [ ] Fractional display mode ($1/3$ instead of $0.333333$)
- [ ] Configurable output precision (3–9 decimal places)
- [ ] `rand()` / `RanInt#(a,b)` — random number generation
- [ ] `d/dx(f(x), x, a)` — numerical differentiation
- [ ] `solve(f(x), x, a, b)` — numerical root finding

### Developer experience

- [ ] `.vscode/` configuration in repository
- [ ] GDB init script for quick debugging setup
- [ ] Release build CI artifact (GitHub Actions draft release)

## Medium-term

### Port to modern hardware

The math engine and runtime are already hardware-independent. Candidate targets:

| Target              | Core         | Flash  | RAM   | Price |
|---------------------|-------------|--------|-------|-------|
| RP2040 (Pi Pico)    | Cortex-M0+  | 2 MB   | 264 KB| $4    |
| STM32F411           | Cortex-M4F  | 512 KB | 128 KB| $8    |
| STM32G431           | Cortex-M4F  | 128 KB | 32 KB | $5    |
| ESP32-C3            | RISC-V      | 4 MB   | 400 KB| $3    |
| ATSAMD51            | Cortex-M4F  | 512 KB | 192 KB| $10   |

For each port: rewrite `hal/`, update `boot.rs` + `link.x`. Zero `numcore/` changes.

### Reference hardware design

- [ ] Open-source KiCad PCB (mechanical keyswitches, OLED, USB-C)
- [ ] 3D-printable enclosure
- [ ] BOM targeting $20–30
- [ ] Cherry MX / Kailh Choc switch support
- [ ] Battery charging circuit (LiPo)

### Graphing mode

- [ ] Function plotting on OLED
- [ ] Pan/zoom with register-based viewport
- [ ] Multiple simultaneous plots (up to 3)
- [ ] Table of values
- [ ] Dynamic y-axis scaling

### Standalone math crate

- [ ] Extract `math/` as `numcore-math` on crates.io
- [ ] Platform-agnostic (`std` and `no_std`)
- [ ] Python/JS bindings for cross-validation

## Long-term

### Advanced calculator modes

- [ ] Unit conversions, physical constants
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

## Non-goals

- **Touchscreen UI** — hurts battery life, increases BOM cost, reduces tactility
- **Full CAS like Mathematica** — calculator-grade scope only
- **Proprietary lock-in** — open-source hardware (CERN-OHL-S license)
- **Mobile app** — this is a dedicated hardware project
- **Wireless exam cheating vectors** — no Wi-Fi/BT in exam modes
- **Multi-line expression input** — single-line with cursor editing is sufficient for calculator scope
