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
# Debian/Ubuntu:
apt install qemu-system-arm
# Arch Linux:
pacman -S qemu-system-arm
# macOS (Homebrew):
brew install qemu

# ARM cross-tools (for binary analysis)
# Debian/Ubuntu:
apt install binutils-arm-none-eabi gcc-arm-none-eabi
```

### IDE setup

The workspace root `.cargo/config.toml` does **not** set a default build target
(because it breaks host-side test compilation in IDEs).

**VS Code with rust-analyzer:**
```json
{
    "rust-analyzer.cargo.target": "thumbv7m-none-eabi",
    "rust-analyzer.checkOnSave.allTargets": false
}
```

**JetBrains RustRover:** Set default target to `thumbv7m-none-eabi` in
**Settings $\to$ Languages & Frameworks $\to$ Rust $\to$ Cargo**.

## Code conventions

### Style

- Format all code with `rustfmt` (`cargo fmt` before every commit)
- `snake_case` for functions/variables, `CamelCase` for types,
  `SCREAMING_SNAKE_CASE` for constants
- Maximum line length: 100 characters
- No trailing whitespace
- Alphabetise module declarations, match arms, and import lists

### No comments

Do not add comments unless the code cannot be made self-documenting. Prefer
meaningful identifier names, small single-purpose functions, and clear type
systems. The existing doc comments on modules, types, and public functions are
exceptions.

### Safety contract

- **Only `hal-<mcu>/`** may perform MMIO via `unsafe` -- all `unsafe` for
  hardware is in `hal-<mcu>/src/mmio.rs`
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

### Math function contract

All math functions must:

1. Accept and return `i64` (Q31.32) or `Option<i64>` / `Option<Complex>`
2. Never panic -- all errors are domain errors returning `None`
3. Use saturating arithmetic (`.saturating_add()`, `.saturating_sub()`) for
   addition and subtraction
4. Use i128 intermediates for multiplication and division (never overflow in
   intermediate computation)
5. Handle `None` propagation via `?` throughout

## Testing

### Host-side suite (275 tests)

```bash
# All tests
cargo test -p numcore_math --tests
```

### Adding new tests

When adding a math function, add tests to `test-suite/tests/math.rs` covering:

- Expected values for representative inputs (verify against Python Decimal)
- Domain errors (invalid inputs returning `None`)
- Overflow/underflow at Q31.32 boundaries
- Roundtrip consistency where applicable
- Edge cases (zero, negative, min/max values)

**Test pattern:**
```rust
#[test]
fn test_my_function_basic() {
    let input = Q31.32_from_float(2.0);
    let expected = Q31.32_from_float(4.0);
    let result = my_function(input);
    assert!(result.is_some());
    assert_eq!(result.unwrap(), expected);
}

#[test]
fn test_my_function_domain_error() {
    let input = Q31.32_from_float(-1.0);
    let result = my_function(input);
    assert!(result.is_none());
}
```

Do not use `approx::assert_relative_eq` or epsilon comparisons. Fixed-point
arithmetic is exact -- use `assert_eq!` directly.

### Verifying against Python

```python
SCALE = 2**32

def to_q3132(x: float) -> int:
    return round(x * SCALE)

def from_q3132(x: int) -> float:
    return x / SCALE

# Compute reference values
ref = to_q3132(math.sin(math.pi / 4))
print(f"Expected Q31.32: {ref}")
print(f"Expected float:  {from_q3132(ref)}")
```

### Firmware integration test

```bash
echo "my_function(42)" | cargo run -p numcore-lm3s811 --release --target thumbv7m-none-eabi
```

### CI pipeline

GitHub Actions runs on every PR:
1. `cargo test -p numcore_math --tests` -- all 275 tests
2. `cargo build -p numcore-lm3s811 --release --target thumbv7m-none-eabi` -- firmware builds

## Pull request process

1. Create a feature branch from `main`
2. Run `cargo test -p numcore_math --tests` -- all pass
3. Run `make build` -- firmware compiles
4. Run in QEMU -- existing functionality works
5. Open a PR with clear description of what, why, and how tested

### What to include in a PR

- **HAL features**: register constants and bit masks
- **Math functions**: test cases (expected values, domain errors, overflow
  edges)
- **Parser changes**: example expressions exercising new grammar
- **UI changes**: screenshot or ASCII-art of display output

## Code review checklist

- [ ] No new `unsafe` blocks outside HAL or boot
- [ ] `// SAFETY:` comment on every `unsafe` block
- [ ] All math functions return `Option` for error cases
- [ ] No heap allocation or `extern crate alloc`
- [ ] Tests cover: expected values, domain errors, overflow
- [ ] `cargo fmt` has been run
- [ ] `cargo test -p numcore_math --tests` passes
- [ ] Firmware builds with `make build`
- [ ] Verified in QEMU (basic expression evaluation)
