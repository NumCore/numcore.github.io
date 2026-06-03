---
sidebar_position: 2
description: Layer diagram, safety contract, workspace structure, portability
---

# Architecture

NumCore is organised as a strict layered architecture with import rules
enforced at the Cargo crate boundary. Each layer has well-defined
responsibilities; the shared `numcore/` crate is entirely hardware-independent.

## Safety contract

1. **HAL crate** (`hal-lm3s811/`) is the **only** crate permitted MMIO. All
   `unsafe` for hardware register access is in `mmio.rs` (three functions:
   `read_register`, `write_register`, `set_register_bits`). Every other HAL
   module calls through these.
2. **`numcore-<mcu>/src/boot.rs`** uses `unsafe` for `.bss` zeroing and `.data`
   copying — unavoidable on bare metal.
3. **`runtime/`, `math/`, `ui/` contain zero `unsafe` code.** They interact with
   hardware only through `Uart` and `Display` traits in `numcore::hal`.
4. Every `unsafe` block has an adjacent `// SAFETY:` comment.

Porting to a new MCU means rewriting only the HAL crate and boot crate. Zero
changes to `numcore/`.

## Layer map

```
  ┌───────────────────────────────────────────────────┐
  │  Layer 7:  ui/  (numcore/src/ui/)                 │
  │  font.rs, formula.rs, matrix_display.rs            │
  ├───────────────────────────────────────────────────┤
  │  Layer 6:  math/  (numcore/src/math/)             │
  │  fixed_point, complex, distributions,             │
  │  lexer, compiler, vm, evaluator, engine, vars     │
  ├───────────────────────────────────────────────────┤
  │  Layer 5:  runtime/  (numcore/src/runtime/)       │
  │  mod.rs, state.rs, event.rs                       │
  ├───────────────────────────────────────────────────┤
  │  Layer 2:  hal::*  (numcore/src/hal.rs)           │
  │  Uart + Display traits — no concrete hardware     │
  ├───────────────────────────────────────────────────┤
  │  Layer 4:  HAL crate (hal-<mcu>/)                 │
  │  mmio, uart, i2c, gpio, clock, oled              │
  ├───────────────────────────────────────────────────┤
  │  Layer 3:  boot.rs (numcore-<mcu>/src/)           │
  └───────────────────────────────────────────────────┘
```

Layer 2 (traits) sits between Layers 4 and 5 logically, separating concrete
HAL from architecture-agnostic code.

## Evaluation pipeline

Input processing follows a three-stage pipeline:

```
  input bytes ──► lexer ──► tokens ──► compiler ──► bytecode ──► vm ──► result
```

The lexer produces a flat `[Token; 64]` array. The compiler emits opcodes
into a 256 B `Bytecode` buffer using the same recursive-descent grammar as the
original parser but producing a linear program instead of an AST. The VM
executes the bytecode in a flat `loop { match op { ... } }` with a 16-entry
value stack on the C stack — no recursive calls, no fixed stack depth limit.

## Workspace structure

```
NumCore/
├── Cargo.toml                    # Workspace root
├── .cargo/config.toml            # No default target
├── Makefile                      # build, test, clean
├── numcore/                      # Shared crate (MCU-agnostic)
│   └── src/
│       ├── lib.rs                # Module re-exports
│       ├── hal.rs                # Uart + Display traits
│       ├── math/                 # 10 modules:
│       │   fixed_point, complex, distrib, lexer,
│       │   parser (enums only), opcodes, compiler,
│       │   vm, evaluator, engine, vars
│       └── runtime/              # Event loop, CalcState
├── hal-lm3s811/                  # HAL crate (per-MCU)
│   ├── Cargo.toml
│   ├── link.x                    # Linker script
│   └── src/
│       ├── lib.rs
│       └── mmio.rs, uart.rs, i2c.rs, gpio.rs,
│           clock.rs, oled.rs
├── numcore-lm3s811/              # Per-MCU binary crate
│   ├── Cargo.toml                # version = "0.6.0"
│   └── src/
│       ├── main.rs               # Calls start()
│       └── boot.rs               # Vector table, Reset handler
    └── test-suite/               # Host-side test crate
        ├── Cargo.toml
        └── tests/math.rs         # 300 tests
```

| Member            | Target                  | Purpose                          |
|-------------------|-------------------------|----------------------------------|
| `numcore`         | any (host or embedded)  | MCU-agnostic lib                 |
| `numcore-lm3s811` | `thumbv7m-none-eabi`    | Per-MCU binary                   |
| `hal-lm3s811`     | `thumbv7m-none-eabi`    | LM3S811 HAL                      |
| `numcore_math`    | Host (x86_64)           | Host-side unit tests             |

## Portability

`numcore/` depends on no HAL crate. It imports `core` only.

- `numcore/src/hal.rs`: `Uart` (`putchar`, `getchar`) and `Display` (`init`,
  `clear`, `render`, `set_pixel`, associated `Buffer` type) traits. This is the
  only HAL dependency of shared code.
- `math/`: zero HAL imports, zero `unsafe`, zero platform dependencies.
- `runtime/`: generic over `<U: Uart, D: Display>`. Touches hardware only
  through trait methods.
- `ui/`: generic over `<D: Display>`.

To port to a new MCU: write a new HAL crate (implementing `Uart` + `Display`),
create a new binary crate with `boot.rs` + `link.x`. No `numcore/` changes.

## Key architecture-level decisions

1. **Q31.32 over Q20.12** — 32 fractional bits give $\sim9$ decimal digits.
   The Cortex-M3's `SMULL`/`UMULL` instructions make i64 arithmetic free in
   registers. Q20.12 would give only $\sim3.6$ digits — insufficient for
   scientific use.

2. **Bytecode over recursive AST** — The original recursive `evaluate_node`
   used ~550 B per call frame and overflowed the 1,536 B stack at depth 4.
   The bytecode VM uses a flat dispatch loop with a 16-entry explicit value
   stack (2,304 B on the C stack). Expression depth is bounded by the value
   stack size (16), not the call stack — no silent `.bss` corruption from
   deep recursion.

3. **Static scratch buffers over stack allocation** — All scratch memory
   (lexer output at 64 tokens, bytecode buffer at 256 B, expression copy)
   lives in `CalcState` (.bss). The bytecode buffer (256 B) is 1,584 B smaller
   than the old AST arena (1,840 B).

4. **No heap** — Zero dynamic allocation. All data structures are fixed-size
   arrays sized at compile time. No OOM, no fragmentation, no allocator.

5. **Trait-based HAL abstraction** — Shared `numcore/` depends only on `Uart`
   and `Display`. Verified: the shared crate has no imports from any `hal-*`
   crate.
