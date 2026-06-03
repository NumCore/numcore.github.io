---
sidebar_position: 6
description: Build commands, QEMU, debugging, flash/stack budgets, adding features
---

# Hacking on NumCore

A practical guide for working on the firmware day-to-day.

## Build commands

```bash
# Build firmware (release, size-optimised)
make build
# or
cargo build -p numcore-lm3s811 --release --target thumbv7m-none-eabi

# Build firmware (debug — faster compile, larger Flash)
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi

# Run host-side unit tests (300 tests)
make test
# or
cargo test -p numcore_math --tests

# Build + test
make all

# Check compilation only
cargo check -p numcore-lm3s811 --release --target thumbv7m-none-eabi

# Clean
cargo clean
```

### Release profile

```toml
[profile.release]
opt-level = "z"       # minimise code size
lto = true            # fat LTO across all crates
codegen-units = 1     # single CGU for maximum optimisation
panic = "abort"       # no unwind tables
strip = "symbols"     # remove ELF symbol table
```

Debug builds omit all optimisation — use only for QEMU testing (debug
binaries exceed 64 KB Flash).

### No default target

`.cargo/config.toml` does **not** set a default build target, allowing
`cargo test` for the host-side test-suite to work without `--target`.
Always use `--target thumbv7m-none-eabi` for firmware builds.

## Running in QEMU

### Development (debug, fast iteration)

```bash
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi && \
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/debug/NumCore
```

### Release testing

```bash
make build && \
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore
```

### With simulated OLED display

```bash
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi && \
qemu-system-arm -M lm3s811evb -serial mon:stdio -display gtk \
  -kernel target/thumbv7m-none-eabi/debug/NumCore
```

### Pipe expression via stdin

```bash
echo "2+2" | timeout 5 qemu-system-arm -M lm3s811evb -serial stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore
```

## Quick expression tests

```text
> sin(pi/2)             → = 1
> cos(0)                → = 1
> sqrt(-1)              → ! error (Standard mode)
                         → = i   (Advanced mode, Esc to toggle)
> int(sin(X),X,0,pi)    → = 2
> sum(X,X,1,10)         → = 55
> sto(42,A)             → = 42
> A                     → = 42
> [(1,2)(3,4)]          → = [1 2; 3 4] (Matrix mode)
> det([(1,0)(0,1)])     → = 1
> !mode Scientific       → (switch to Scientific mode)
> 1.5E+10               → = 1.5E+10
> 9E99*9E-99            → = 81
```

## Host-side unit tests

The test-suite (`test-suite/`) includes every `numcore/src/math/*.rs` file via
`#[path]` attributes. 300 tests cover the entire math engine.

### Running tests

```bash
# All tests
cargo test -p numcore_math --tests

# Single test
cargo test -p numcore_math --tests test_sqrt_perfect_squares

# Run with output
cargo test -p numcore_math --tests -- --nocapture
```

### Ignored tests

6 tests are ignored on host due to differences between the embedded target
(Cortex-M3, saturating arithmetic) and the host (x86_64, wrapping arithmetic).
All pass correctly on the embedded target.

## Firmware metrics

### Flash budget

| Section     | Size (bytes) | % of Flash |
|-------------|-------------|-----------|
| .vector_table | 64         | 0.1%      |
| .text + .rodata | 60,261  | 92.0%     |
| .data (LMA) | 2,768       | 4.2%      |
| **Total**   | **63,029**  | **96.2%** |

Get exact numbers with:

```bash
rust-objdump -h target/thumbv7m-none-eabi/release/NumCore
llvm-size target/thumbv7m-none-eabi/release/NumCore
```

### RAM budget

| Resource           | Size (bytes) | Address Range              |
|--------------------|-------------|----------------------------|
| .data + .bss       | 2,776       | 0x2000_0000 - 0x2000_0AD8  |
| Unallocated gap    | 3,880       | 0x2000_0AD8 - 0x2000_1A00  |
| .stack (reserved)  | 1,536       | 0x2000_1A00 - 0x2000_2000  |
| SRAM total         | 8,192       | 0x2000_0000 - 0x2000_2000  |

## Debugging with GDB + QEMU

```bash
# Terminal 1: start QEMU with GDB stub
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/debug/NumCore -s -S

# Terminal 2: connect GDB
arm-none-eabi-gdb target/thumbv7m-none-eabi/debug/NumCore
(gdb) target remote localhost:1234
(gdb) hbreak numcore::runtime::start
(gdb) continue
(gdb) info registers
(gdb) x/8wx 0x20000000     # examine .bss
(gdb) monitor system_reset # reset from GDB
```

### Binary analysis

```bash
# Section sizes
llvm-size target/thumbv7m-none-eabi/release/NumCore

# Symbol sizes (debug build)
rust-nm --print-size target/thumbv7m-none-eabi/release/NumCore | sort -k2 -n -r

# Full disassembly
rust-objdump -d target/thumbv7m-none-eabi/release/NumCore | less
```

## Adding a new math function

### 1. Add the function token to the lexer

Add a new `Token::Func*` variant and a match arm in `parse_identifier()`.
The lexer maps the lowercase function name directly to the specific token
in one step — there is no intermediate identifier token.

### 2. Add the function enum variant

Add the function to `MathFunction` (single-argument), `TwoArgMathFunction`
(two-argument), or `ThreeArgMathFunction` (three-argument) in `parser.rs`.

### 3. Implement the maths

Write the Q31.32 implementation in `fixed_point.rs` or `distributions.rs`.
Return `Option` for domain errors. If the function can overflow, call
`set_overflow_info(log10_est, negative)` so the overflow subsystem can
display scientific notation.

### 4. Wire the opcode

In `opcodes.rs`, add `MathFunction::from_u8()` index support (the opcode
`CallFunction = 0x20` takes a function index byte — existing functions use
indices 0–23). If adding a truly new opcode, add it to the `Op` enum and
update `from_u8()`/`width()`.

### 5. Wire the compiler

In `compiler.rs`, add a match arm in `compile_primary()`:
```rust
Token::FuncMyFunc => compile_single_arg_fn(cursor, bc,
    Op::CallFunction as u8, MathFunction::MyFunc as u8)?,
```

### 6. Wire the VM

In `vm.rs`, the `Op::CallFunction` handler already dispatches via
`MathFunction::from_u8(fn_idx)` — no new match arm in the VM loop needed
unless you added a new opcode.

### 7. Wire the evaluator

Add the match arm in `apply_function()`, `apply_two_arg_function()`, or
`apply_three_arg_function()` in `evaluator.rs`.

### 8. Add to welcome banner

Add the function name to `print_welcome_banner()` in `runtime/mod.rs`.

### 9. Add tests

Add tests to `test-suite/tests/math.rs` covering expected values, domain
errors, overflow edges, and roundtrip consistency.

## Verifying Q31.32 constants

```python
import math
SCALE = 2**32

def to_q3132(x): return round(x * SCALE)
def from_q3132(x): return x / SCALE

FIXED_PI = to_q3132(math.pi)
FIXED_E  = to_q3132(math.e)
# Verify:
print(from_q3132(FIXED_PI))  # 3.141592653589793
print(from_q3132(FIXED_E))   # 2.718281828459045
```

## Matching Python reference values

```python
SCALE = 2**32
def to_q3132(x): return round(x * SCALE)
def from_q3132(x): return x / SCALE

# Generate expected values for CORDIC arctan table
for i in range(22):
    val = to_q3132(math.atan(2**-i))
    print(f"i={i:2d}  Q31.32={val}")

# Generate ln_factorial table
for k in range(0, 21):
    val = to_q3132(math.lgamma(k + 1))
    print(f"k={k:2d}  ln({k}!)={math.lgamma(k+1):.10f}  Q31.32={val}")
```
