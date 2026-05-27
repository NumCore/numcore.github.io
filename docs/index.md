---
sidebar_position: 1
slug: /
---

# NumCore

**Bare-metal scientific calculator firmware** for the **LM3S811** ARM Cortex-M3
(64 KB Flash, 8 KB SRAM), written in Rust with `#![no_std]` `#![no_main]`.

Features a Q31.32 fixed-point math engine (i128 intermediates, ~9 decimal
digits), recursive-descent expression parser with implicit multiplication,
interactive UART console, and I2C-driven OLED display. No heap, no allocator,
no OS.

[![Build Status](https://github.com/NumCore/NumCore/actions/workflows/ci.yml/badge.svg)](https://github.com/NumCore/NumCore/actions/workflows/ci.yml)

## Project highlights

- **Q31.32 fixed-point** — i64 storage, i128 intermediates, saturating
  arithmetic, `Option<T>` error model
- **CORDIC** sin/cos/tan/atan (24 iterations, 192 B atan table)
- **Taylor** exp (12 terms, range-reduced) and ln (20 terms, range-reduced)
- **Newton-Raphson** sqrt (10 iterations, initial guess from `u64::isqrt`)
- **Recursive-descent parser** — PEMDAS, right-associative `^`, implicit
  multiplication, flat-arena AST `[AstNode; 64]`
- **Complex numbers** — full arithmetic + analytic-continuation trig
- **Degrees mode** — real-arg trig converts; complex/hyperbolic always rad
- **Loop aggregates** — `sum()` + Simpson's rule `int()` (100 intervals)
- **Log-space distributions** — ln_gamma (Lanczos 6-term), ln_factorial
  (hybrid table/Stirling), binomial/Poisson PMF, chi-squared CDF
- **255/255 host-side tests**, 11 ignored (overflow diff with embedded)

## Supported functions

Arithmetic: `+ - * / ^ %`. Trig: `sin cos tan asin acos atan`. Hyperbolic:
`sinh cosh tanh asinh acosh atanh`. Other: `sqrt abs exp ln log log2 deg rad
nthroot lngamma`. Distributions: `binomialprob poissonprob chisqcdf`. Loops:
`sum int`. Storage: `sto`. Constants: `pi e`. Variables: `Ans A-Z`.

See [Math Engine](/math-engine) for full reference.

## Firmware metrics

| Metric                   | Value              | Budget   | Usage |
|--------------------------|--------------------|----------|-------|
| Flash (.text + .rodata)  | 50,343 bytes       | 64 KB    | 77%   |
| RAM (.bss)               | 5,264 bytes        | 8 KB     | 64%   |
| Stack (actual peak)      | 3,032 bytes        | 3,072 B  | 99%   |

No `.data` section. The stack is measured by SP instrumentation at
`evaluate_node` entry via GDB.

## Quick start

```bash
# Build firmware (release, size-optimised)
cargo build -p numcore-lm3s811 --release --target thumbv7m-none-eabi

# Run host-side unit tests (255 tests)
cargo test -p numcore_math --tests

# Run in QEMU
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore

# Pipe expression
echo "2+2" | cargo run -p numcore-lm3s811 --release --target thumbv7m-none-eabi
```

Source code: **[github.com/NumCore/NumCore](https://github.com/NumCore/NumCore)**
