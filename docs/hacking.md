---
sidebar_position: 3
description: Day-to-day commands, QEMU tips, debugging, adding features
---

# Hacking on NumCore

A practical guide for working on the firmware day-to-day.

## Build commands

```bash
# Build firmware (release, optimised for size)
make build
# or
cargo build -p numcore-lm3s811 --release --target thumbv7m-none-eabi

# Build firmware (debug, faster iteration)
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi

# Run host-side unit tests
make test
# or
cargo test -p numcore_math --tests

# Run everything (firmware build + host tests)
make all

# Clean build artifacts
cargo clean
```

The release build uses `opt-level = "z"` (minimise code size) and LTO because the firmware must fit in 64 KB Flash. Debug builds omit optimisation for faster compile times during development.

### Why no default target?

Previously `.cargo/config.toml` set `[build] target = "thumbv7m-none-eabi"` at the workspace level, which broke IDE support and `cargo test` for the host-side test-suite. The fix was to remove the default target. Use `--target thumbv7m-none-eabi` for firmware builds, or use `make build`.

## Running in QEMU

### Development (fast iteration)

```bash
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi && qemu-system-arm \
  -M lm3s811evb \
  -serial mon:stdio \
  -display none \
  -kernel target/thumbv7m-none-eabi/debug/NumCore
```

### With OLED display

```bash
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi && qemu-system-arm \
  -M lm3s811evb \
  -serial mon:stdio \
  -display gtk \
  -kernel target/thumbv7m-none-eabi/debug/NumCore
```

### Release testing

```bash
make build && qemu-system-arm \
  -M lm3s811evb \
  -serial mon:stdio \
  -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore
```

## Quick expression tests

```bash
# Pipe a single expression
echo "2+2" | cargo run -p numcore-lm3s811 --release --target thumbv7m-none-eabi
# → = 4

# Interactive session
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore
# Type: sin(45)   → = 0.850903 (sin of 45 radians)
# Type: sin(deg(45)) → = 0.707106 (sin of 45 degrees)
```

## Host-side unit tests

The `test-suite/` workspace member includes every `numcore/src/math/*.rs` file via `#[path]` attributes and compiles them for the host. 250 tests exercise the entire math engine:

```bash
# Run all tests
cargo test -p numcore_math --tests

# Run a specific test
cargo test -p numcore_math --tests test_sqrt_perfect_squares

# List all tests
cargo test -p numcore_math --tests -- --list
```

11 tests are ignored on the host due to differences in overflow behaviour (CORDIC overflow, integrator limits, Stirling/Lanczos precision). They pass correctly on the embedded target.

## Debugging

### Binary size

```bash
cargo size -p numcore-lm3s811 --release --target thumbv7m-none-eabi
```

### Disassembly

```bash
arm-none-eabi-objdump -d target/thumbv7m-none-eabi/release/NumCore | less
arm-none-eabi-objdump -s -j .vector_table target/thumbv7m-none-eabi/release/NumCore
```

### GDB in QEMU

```bash
# Terminal 1: start QEMU with GDB stub
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/debug/NumCore \
  -s -S

# Terminal 2: connect GDB
arm-none-eabi-gdb target/thumbv7m-none-eabi/debug/NumCore
(gdb) target remote localhost:1234
(gdb) break numcore::runtime::start
(gdb) continue
```

## Verifying Q31.32 constants

All mathematical constants are computed as `round(value × 2³²)`. Verify with Python:

```python
import math
scale = 2**32
pi = round(math.pi * scale)
e  = round(math.e * scale)
```

To convert back: `val / 2**32` (or `(val + 2**64) / 2**32` for negative values).

## Memory budgeting

| Region               | Usage          | Budget | Usage |
|----------------------|----------------|--------|-------|
| Flash                | 50 343 bytes   | 64 KB  | 77%   |
| .data                | 0 bytes        | —      | —     |
| .bss (statics)       | 2 128 bytes    | 8 KB   | 26%   |
| Stack (reserved)     | 3 072 bytes    | 8 KB   | 37%   |
| Stack (actual max)   | 3 064 bytes    | 3 KB   | 99%   |
| **Peak RAM**         | **5 192 bytes**| **8 KB** | **63%** |

### Measuring peak stack usage

Peak stack depth is measured by instrumenting `evaluate_node` to track the minimum SP seen:

1. Add a global SP watermark to `numcore/src/math/mod.rs`
2. Call `track_sp()` from `evaluate_node`
3. Build without stripping and run the workload in QEMU with GDB
4. Read the watermark: `gdb -batch -nx -ex "target remote :1234" -ex "x/gx &MIN_SP"`
5. Stack used = `0x20002000 - MIN_SP`

## Adding a new math function

1. Add the function token to `Token` in `lexer.rs`
2. Add the identifier match in `parse_identifier()` (case-sensitive, lowercase)
3. Add the AST node variant in `parser.rs` (or reuse an existing pattern)
4. Add the function to `MathFunction` enum in `evaluator.rs`
5. Implement the logic in `fixed_point.rs` or `distributions.rs`
6. Wire it up in `apply_function()` in `evaluator.rs`
7. Add to the welcome banner in `runtime/mod.rs`
8. Add test cases in `test-suite/tests/math.rs`

## Adding support for a new MCU

1. Create `hal-<mcu>/` implementing `numcore::hal::Uart` and `numcore::hal::Display`
2. Create `numcore-<mcu>/` with `Cargo.toml`, `main.rs`, `boot.rs`, `link.x`
3. Add target-specific rustflags in `.cargo/config.toml`
4. Add to workspace `Cargo.toml` and `Makefile`

No changes to `numcore/` required.
