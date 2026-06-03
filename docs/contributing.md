---
sidebar_position: 7
description: Development setup, coding standards, testing, PR process
---

# Contributing to NumCore

## Development environment

### Required tools

```bash
# Rust toolchain
rustup target add thumbv7m-none-eabi

# QEMU for ARM
apt install qemu-system-arm       # Debian/Ubuntu
pacman -S qemu-system-arm         # Arch
brew install qemu                 # macOS

# ARM cross-tools (for binary analysis)
apt install binutils-arm-none-eabi gcc-arm-none-eabi
```

### IDE setup

The workspace root `.cargo/config.toml` does **not** set a default build target
(because it breaks host-side test compilation).

**VS Code with rust-analyzer:**
```json
{
    "rust-analyzer.cargo.target": "thumbv7m-none-eabi",
    "rust-analyzer.checkOnSave.allTargets": false
}
```

## Code conventions

### Style

- `cargo fmt` before every commit
- `snake_case` for functions/variables, `CamelCase` for types,
  `SCREAMING_SNAKE_CASE` for constants
- Maximum line length: 100 characters
- No trailing whitespace
- Alphabetise module declarations, match arms, and import lists

### No comments

Do not add comments unless the code cannot be made self-documenting. Prefer
meaningful identifier names, small single-purpose functions, and clear type
systems. Existing doc comments on modules, types, and public functions are
exceptions.

### Safety contract

- **Only `hal-<mcu>/`** may perform MMIO via `unsafe`
- **`numcore-<mcu>/src/boot.rs`** is the only exception (`.bss`/`.data` init)
- **`runtime/`, `math/`, `ui/` must contain zero `unsafe` blocks**
- Every `unsafe` block must have a `// SAFETY:` comment

### Layer rules

| Layer     | Location              | May import                         | Must not import               |
|-----------|-----------------------|------------------------------------|-------------------------------|
| Boot      | `numcore-<mcu>/boot.rs` | `core`                           | `hal-*`, `numcore::*`         |
| HAL       | `hal-<mcu>/src/*`     | `core`, `numcore::hal`, submodules | `runtime`, `math`, `ui`       |
| Runtime   | `numcore/src/runtime/` | `numcore::hal`, `math`, `ui`      | Concrete HAL crates           |
| Math      | `numcore/src/math/`   | `core` only                        | Any HAL, `runtime/`, `ui/`    |
| UI        | `numcore/src/ui/`     | `numcore::hal` (`Display`), `core` | Any HAL, `runtime/`, `math/`  |

### Math function contract

All math functions must:

1. Accept and return `i64` (Q31.32) or `Option<i64>` / `Option<Complex>`
2. Never panic — all errors are domain errors returning `None`
3. Use saturating arithmetic for addition and subtraction
4. Use i128 intermediates for multiplication and division
5. Handle `None` propagation via `?`

## Testing

### Host-side suite (300 tests)

```bash
cargo test -p numcore_math --tests
```

### Adding new tests

Add tests to `test-suite/tests/math.rs` covering:

- Expected values for representative inputs (verify against Python Decimal)
- Domain errors (invalid inputs returning `None`)
- Overflow/underflow at Q31.32 boundaries
- Edge cases (zero, negative, min/max values)

Do not use `approx::assert_relative_eq` — fixed-point arithmetic is exact;
use `assert_eq!` directly.

### Verifying against Python

```python
SCALE = 2**32
def to_q3132(x: float) -> int: return round(x * SCALE)
def from_q3132(x: int) -> float: return x / SCALE
```

### CI pipeline

GitHub Actions runs on every PR:
1. `cargo fmt --check` — formatting
2. `cargo build --release --target thumbv7m-none-eabi` — firmware builds
3. `cargo test -p numcore_math --tests` — 300 tests pass
4. QEMU smoke tests via `test_inputs.txt`

## Pull request process

1. Create a feature branch from `main`
2. Run `cargo test -p numcore_math --tests` — all pass
3. Run `make build` — firmware compiles
4. Run in QEMU — existing functionality works
5. Open a PR with clear description of what, why, and how tested

### Code review checklist

- [ ] No new `unsafe` blocks outside HAL or boot
- [ ] `// SAFETY:` comment on every `unsafe` block
- [ ] All math functions return `Option` for error cases
- [ ] No heap allocation or `extern crate alloc`
- [ ] Tests cover: expected values, domain errors, overflow
- [ ] `cargo fmt` has been run
- [ ] `cargo test -p numcore_math --tests` passes
- [ ] Firmware builds with `make build`
- [ ] Verified in QEMU
