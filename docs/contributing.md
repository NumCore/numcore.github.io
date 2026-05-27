---
sidebar_position: 4
description: Development setup, coding standards, testing, PR process
---

# Contributing to NumCore

## Development environment

### Required tools

```bash
# Rust toolchain
rustup target add thumbv7m-none-eabi

# QEMU for ARM
# Debian/Ubuntu:
apt install qemu-system-arm
# Arch Linux:
pacman -S qemu-system-arm
# macOS (Homebrew):
brew install qemu
```

### IDE setup

The workspace root `.cargo/config.toml` does **not** set a default build target (removed because it breaks host-side test compilation in IDEs).

**VS Code with rust-analyzer:**
```json
{
    "rust-analyzer.cargo.target": "thumbv7m-none-eabi",
    "rust-analyzer.checkOnSave.allTargets": false
}
```

**JetBrains RustRover:** Set default target to `thumbv7m-none-eabi` in **Settings → Languages & Frameworks → Rust → Cargo**.

## Code conventions

### Style

- Format all code with `rustfmt` (`cargo fmt` before every commit)
- `snake_case` for functions/variables, `CamelCase` for types, `SCREAMING_SNAKE_CASE` for constants
- Maximum line length: 100 characters
- No trailing whitespace
- Alphabetise module declarations, match arms, and import lists

### No comments

Do not add comments unless the code cannot be made self-documenting. Prefer meaningful identifier names, small single-purpose functions, and clear type systems. The existing doc comments on modules, types, and public functions are exceptions.

### Safety contract

- **Only `hal-<mcu>/`** may perform MMIO via `unsafe` — all `unsafe` for hardware is in `hal-<mcu>/src/mmio.rs`
- **`numcore-<mcu>/src/boot.rs`** is the only exception (`.bss`/`.data` init)
- **`runtime/`, `math/`, `ui/` must contain zero `unsafe` blocks**
- Every `unsafe` block must have a `// SAFETY:` comment

### Layer rules

| Layer | Location | May import | Must not import | Unsafe |
|-------|----------|------------|-----------------|--------|
| Boot | `numcore-<mcu>/src/boot.rs` | `core` | `hal-*`, `numcore::*` | Yes |
| HAL | `hal-<mcu>/src/*` | `core`, `numcore::hal`, submodules | `runtime`, `math`, `ui` | Yes |
| Runtime | `numcore/src/runtime/` | `numcore::hal`, `math`, `ui` | Concrete HAL crates | No |
| Math | `numcore/src/math/` | `core` only | Any HAL, `runtime/`, `ui/` | No |
| UI | `numcore/src/ui/` | `numcore::hal` (`Display`), `core` | Any HAL, `runtime/`, `math/` | No |

## Testing

### Host-side suite (250 tests)

```bash
cargo test -p numcore_math --tests
# Or via Makefile:
make test
# Single test:
cargo test -p numcore_math --tests test_sin_standard_angles
```

Covers: constants, arithmetic, rounding, sqrt, power, trig, inverse trig, hyperbolic, exp/log, complex numbers, variables, distributions, full pipeline, lexer edge cases.

11 tests are **ignored** on host due to overflow differences with the embedded target.

### Adding new tests

When adding a math function, add tests covering:
- Expected values for representative inputs
- Domain errors (invalid inputs → `None`)
- Overflow/underflow at boundaries
- Roundtrip consistency where applicable

Verify results against Python (`int(value * 2**32)` for Q31.32).

### Firmware integration (QEMU)

```bash
echo "sin(pi/2)" | cargo run -p numcore-lm3s811 --release --target thumbv7m-none-eabi
```

## Pull request process

1. Create a feature branch from `main`
2. Run `cargo test -p numcore_math --tests` — all pass
3. Run `make build` — firmware compiles
4. Run in QEMU — existing functionality works
5. Open a PR with clear description of what, why, and how tested

### What to include

- HAL features: register constants and bit masks
- Math functions: test cases (expected values, domain errors, overflow edges)
- Parser changes: example expressions exercising new grammar
- UI changes: screenshot or ASCII-art of display output
