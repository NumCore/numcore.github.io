---
sidebar_position: 2
description: Layered architecture, data flow, memory layout, design decisions
---

# Architecture

NumCore is organised as a strict **layered architecture**. Each layer has well-defined responsibilities and import rules enforced at the Cargo crate boundary.

## Safety contract

NumCore's safety model is explicit and auditable:

1. **HAL crate** (`hal-lm3s811/`) is the **only** crate permitted to perform memory-mapped I/O. All `unsafe` for hardware register access is confined to `mmio.rs` (two functions: `read_register` and `write_register`). Every other HAL module calls through these primitives — no module outside `mmio.rs` issues raw pointer reads or writes.

2. **`numcore-<mcu>/src/boot.rs`** uses `unsafe` for a single, narrow purpose: zeroing `.bss` and copying `.data` from Flash to RAM before the HAL or any Rust code can run. This is unavoidable on bare metal — there is no OS loader to do it.

3. **`runtime/`, `math/`, and `ui/` contain zero `unsafe` code.** They interact with hardware exclusively through the `Uart` and `Display` traits defined in `numcore::hal`. This is verified by inspection and enforced at the crate boundary.

4. **Every `unsafe` block** in the codebase has an adjacent `// SAFETY:` comment explaining why the invariants hold.

Porting to a new MCU means auditing and rewriting only the HAL crate and boot crate. Everything in `numcore/` is architecture-agnostic.

## Cargo workspace structure

The project is a Cargo workspace with four members:

| Member | Path | Target | Purpose |
|--------|------|--------|---------|
| `numcore` | `numcore/` | any (host or embedded) | MCU-agnostic lib crate: traits, math engine, runtime, UI |
| `numcore-lm3s811` | `numcore-lm3s811/` | `thumbv7m-none-eabi` | Per-MCU binary crate for LM3S811 |
| `hal-lm3s811` | `hal-lm3s811/` | `thumbv7m-none-eabi` | HAL implementation + trait impls for LM3S811 |
| `numcore_math` | `test-suite/` | Host (e.g. `x86_64`) | Host-side unit tests for the math engine |

The shared crate (`numcore/`) depends on no HAL crate. Each per-MCU binary depends on `numcore` and its corresponding HAL crate.

## Portability

The firmware is currently developed and tested on the **Luminary Micro Stellaris LM3S811** (ARM Cortex-M3, 64 KB Flash, 8 KB SRAM). The layered design is explicitly engineered to support future ports to other architectures and microprocessors:

* **`numcore/src/hal.rs`** — `Uart` and `Display` traits. This is the only HAL dependency of the shared code.
* **`math/`** — zero HAL imports, zero `unsafe`, zero platform dependencies. Compiles on any target Rust supports.
* **`runtime/`** — generic over `<U: Uart, D: Display>`. Touches hardware only through trait method calls.
* **`ui/`** — generic over `<D: Display>`. Renders to `D::Buffer` via `AsMut<[u8]>` / `AsRef<[u8]>`.
* **HAL crate** (`hal-<mcu>/`) — the only crate that needs rewriting per target.
* **Per-MCU binary crate** (`numcore-<mcu>/`) — contains `boot.rs` (vector table, Reset handler) and `link.x` (memory map).

A port to a new architecture therefore involves: writing a new HAL crate (with trait impls), creating a new binary crate (with `boot.rs` + `link.x`), and adding the target triple. No application logic changes.

## Layer map

```
  ┌─────────────────────────────────────────────┐
  │  Layer 8:  modes/              [ROADMAP]    │
  │  Standard, Scientific, Graphing modes       │
  ├─────────────────────────────────────────────┤
  │  Layer 7:  ui/  (numcore/src/ui/)           │
  │  OLED rendering, font, formula pretty-print │
  ├─────────────────────────────────────────────┤
  │  Layer 6:  math/  (numcore/src/math/)       │
  │  Fixed-point, lexer, parser, evaluator,     │
  │  variables, distributions                   │
  ├─────────────────────────────────────────────┤
  │  Layer 5:  runtime/  (numcore/src/runtime/) │
  │  Event loop, state machine, CalcState,      │
  │  event dispatch                             │
  ├─────────────────────────────────────────────┤
  │  Layer 4:  HAL crate (hal-<mcu>/)           │
  │  UART, I2C, GPIO, clock, OLED driver,       │
  │  MMIO primitives (only crate with unsafe)   │
  ├─────────────────────────────────────────────┤
  │  Layer 3:  boot.rs (numcore-<mcu>/src/)     │
  │  Vector table, Reset handler, .bss/.data    │
  └─────────────────────────────────────────────┘
```

## Layer details

### Layer 3 — Boot

The lowest software layer. Executes before any Rust code can safely run.

**Responsibilities:**
- Place the Cortex-M vector table at Flash address `0x0000_0000`
- Define the `Reset` handler (true entry point after power-on)
- Zero-initialise the `.bss` section
- Copy the `.data` section from Flash LMA to RAM VMA
- Jump to `crate::start()`

### Layer 4 — Hardware Abstraction Layer

The **only** crate permitted to touch hardware registers directly. All `unsafe` for MMIO access is confined to `mmio.rs`.

**Modules:**

| Module     | Contents                                                    |
|------------|-------------------------------------------------------------|
| `mmio.rs`  | `read_register`, `write_register`, `set_register_bits`      |
| `uart.rs`  | UART0 initialisation, transmit/receive, polling              |
| `i2c.rs`   | I2C0 initialisation, send byte/bytes                        |
| `gpio.rs`  | GPIO port base addresses, alternate function config          |
| `clock.rs` | System clock, clock gating, spin-loop delay                  |
| `oled.rs`  | SSD0303 OLED driver: init, clear, render, set pixel          |

### Layer 5 — Runtime

The control centre of the firmware. Generic over `<U: Uart, D: Display>`. Contains zero `unsafe` code.

**Modules:**

| Module    | Contents                                                  |
|-----------|-----------------------------------------------------------|
| `mod.rs`  | `start()`, hardware init, event loop, event handlers       |
| `state.rs`| `CalcState` — input buffer, variable store, scratch buffers |
| `event.rs`| `CalcEvent` enum, byte-to-event translation                |

### Layer 6 — Math Engine

Completely hardware-independent. Zero `unsafe`, zero HAL imports, zero heap allocation.

**Pipeline:**
```
expression bytes
    → lexer::tokenise_expression()   → Token stream
    → parser::parse_token_stream()   → AST (flat arena)
    → evaluator::evaluate_tree()     → Q31.32 result
```

**Modules:**

| Module           | Contents                                                     |
|------------------|--------------------------------------------------------------|
| `fixed_point.rs` | Q31.32 arithmetic: multiply, divide, sqrt, trig (CORDIC), exp/ln (Taylor), rounding, formatting |
| `lexer.rs`       | Expression string → typed `Token` stream (32-token budget)  |
| `parser.rs`      | Token stream → `AstNode` arena (64-node budget)              |
| `evaluator.rs`   | AST → Q31.32 result, operator/function dispatch, loops       |
| `engine.rs`      | Public API: `evaluate_expression()`, `format_result()`       |
| `vars.rs`        | `VariableStore`: Ans + 26 registers (uppercase A–Z)          |
| `distributions.rs` | Log-gamma, log-factorial, binomial, Poisson, chi-squared CDF |

### Layer 7 — UI

OLED display rendering. Generic over `<D: Display>`. Zero `unsafe` code.

**Modules:**

| Module     | Contents                                                    |
|------------|-------------------------------------------------------------|
| `font.rs`  | 5×7 bitmap font (95 printable ASCII glyphs)                 |
| `formula.rs`| `render_screen()`, aggregate Σ/∫ display, pretty-print      |

## Memory layout

```
Flash (0x0000_0000, 64 KB):
  [0x0000]  Vector table (initial SP + Reset vector + exceptions)
  [0x0040]  .text (code + rodata)  — 50 343 bytes used (77%)

RAM (0x2000_0000, 8 KB):
  [0x2000_0000]  .data (initialised statics, 0 bytes)
  [0x2000_0000]  .bss  (zero-initialised statics — CalcState, ~2 128 bytes)
  [0x2000_0850]  (gap, not used)
  [0x2000_1400]  .stack (3 KB, grows downward from 0x2000_2000)
  [0x2000_2000]  Top of SRAM (initial SP)
```

## Key design decisions

1. **Q31.32 over Q20.12**: 32 fractional bits give ~9 decimal digits of precision. The Cortex-M3's 64-bit multiply instructions make `i64` arithmetic free in registers.

2. **Static scratch buffers over stack allocation**: With only 8 KB SRAM, all scratch memory lives in `CalcState` (static `.bss`) to avoid stack overflow.

3. **CORDIC over lookup tables**: Uses ~200 bytes of constant data (atan table) versus kilobytes for a full sin/cos LUT.

4. **Log-space probability**: Binomial and Poisson probabilities computed in log space then exponentiated once, avoiding overflow for large `n`.

5. **No heap**: Zero dynamic allocation. All data structures are fixed-size arrays sized at compile time.

6. **Trait-based HAL abstraction**: Shared code depends on `Uart` and `Display` traits. Porting means creating a new HAL + binary crate — zero changes to `numcore/`.
