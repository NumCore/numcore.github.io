---
sidebar_position: 1
slug: /
---

# NumCore

**Bare-metal scientific calculator firmware** for the **LM3S811** ARM Cortex-M3 microcontroller, written entirely in Rust with `#![no_std]` and `#![no_main]`. Features a complete Q31.32 fixed-point math engine, an interactive UART console, and an I2C-driven OLED display.

[![Build Status](https://github.com/NumCore/NumCore/actions/workflows/ci.yml/badge.svg)](https://github.com/NumCore/NumCore/actions/workflows/ci.yml)

## Project highlights

* **Q31.32 fixed-point engine** — i64 storage, i128 intermediates, ~9 decimal digits precision
* **CORDIC** for sin/cos/tan/atan (24 iterations, full precision)
* **Taylor series** for exp (12 terms) and ln (20 terms, range-reduced)
* **Complete expression parser** — recursive-descent, PEMDAS, right-associative `^`, implicit multiplication
* **Complex number support** — full arithmetic + transcendental functions via mode switching
* **Loop aggregates** — `sum()` and `int()` (Simpson's rule)
* **Statistical distributions** — binomial, Poisson, chi-squared (all log-space)
* **No heap, no allocator** — all memory static, fully deterministic
* **255/255 host-side tests** covering the entire math engine

## Firmware metrics

| Metric                           | Value              | Budget | Usage |
|----------------------------------|--------------------|--------|-------|
| Flash (text)                     | 50,343 bytes       | 64 KB  | 77%   |
| RAM (.data + .bss)               | 0 + 2,128 bytes    | 8 KB   | 26%   |
| Stack (reserved / actual max)    | 3,072 / 3,064 B    | 3 KB   | 99%   |
| **Peak RAM**                     | **5,192 bytes**    | **8 KB** | **63%** |

## Repository

The source code lives at **[github.com/NumCore/NumCore](https://github.com/NumCore/NumCore)**.

## Quick start

```bash
# Build firmware
cargo build -p numcore-lm3s811 --release --target thumbv7m-none-eabi

# Run host-side unit tests
cargo test -p numcore_math --tests

# Run in QEMU
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore
```
