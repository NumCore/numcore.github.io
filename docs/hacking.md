---
sidebar_position: 3
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

# Run host-side unit tests (255 tests)
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

### Release profile (.cargo/config.toml + Cargo.toml)

The firmware must fit in 64 KB Flash with 8 KB SRAM. The release profile uses:

```toml
[profile.release]
opt-level = "z"       # minimise code size (vs "s" or "3")
lto = true            # fat LTO across all crates
codegen-units = 1     # single CGU for maximum optimisation
panic = "abort"       # no unwind tables
strip = "symbols"     # remove ELF symbol table
```

Debug builds omit all optimisation for faster compile-test cycles. They
produce binaries too large to fit in Flash (~90 KB vs 64 KB limit) — use only
for QEMU testing.

### No default target

`.cargo/config.toml` does **not** set a default build target. This allows
`cargo test` for the host-side test-suite to work without `--target`. Always
use `--target thumbv7m-none-eabi` for firmware builds.

## Running in QEMU

### Development (debug, fast iteration)

```bash
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi && \
qemu-system-arm \
  -M lm3s811evb \
  -serial mon:stdio \
  -display none \
  -kernel target/thumbv7m-none-eabi/debug/NumCore
```

### With simulated OLED display

```bash
cargo build -p numcore-lm3s811 --target thumbv7m-none-eabi && \
qemu-system-arm \
  -M lm3s811evb \
  -serial mon:stdio \
  -display gtk \
  -kernel target/thumbv7m-none-eabi/debug/NumCore
```

### Release testing

```bash
make build && \
qemu-system-arm \
  -M lm3s811evb \
  -serial mon:stdio \
  -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore
```

### Pipe expression

```bash
echo "2+2" | cargo run -p numcore-lm3s811 --release --target thumbv7m-none-eabi
# → = 4
```

## Quick expression tests

Once running in QEMU, type expressions and press Enter:

```text
> sin(pi/2)       → = 1
> cos(0)          → = 1
> sqrt(16)        → = 4
> 3(5)            → = 15 (implicit multiply)
> sto(42,A)       → = 42 (store)
> A               → = 42 (recall)
> ln(e)           → = 1
> sum(k,1,10,k)   → = 55 (summation)
> int(x,0,pi,sin(x)) → = 2.000000 (Simpson's rule)
> sqrt(-1)        → ! error (Standard mode)
> sqrt(-1)        → = i (Advanced mode, press Escape to toggle)
```

## Host-side unit tests

The test-suite (`test-suite/`) includes every `numcore/src/math/*.rs` file via
`#[path]` attributes and compiles for the host. 255 tests cover the entire math
engine:

### Test organisation (test-suite/tests/math.rs)

| Category             | Tests | Description                               |
|----------------------|-------|-------------------------------------------|
| Constants            | ~5    | pi, e, Q31.32 scale values                |
| Arithmetic           | ~15   | add, sub, mul, div edge cases             |
| Rounding             | ~8    | floor, ceil, round, trunc                 |
| sqrt                 | ~12   | perfect squares, zeros, negatives         |
| Power                | ~10   | integer powers, nthroot, negative exp     |
| Trigonometric        | ~25   | standard angles, edge cases, domain       |
| Inverse trig         | ~15   | asin(1), acos(0), atan(1), domain         |
| Hyperbolic           | ~10   | sinh, cosh, tanh, symmetry                |
| Exp/ln               | ~15   | exp of integers, ln of e, domain          |
| Complex              | ~30   | mul, div, pow, sqrt, trig, log           |
| Distributions        | ~15   | lngamma, factorial, binomial, Poisson, chisq |
| Full pipeline        | ~40   | end-to-end evaluate_expression tests      |
| Parser               | ~30   | error cases, unary minus, implicit mul    |
| Variables            | ~10   | Ans, register A-Z, sto                    |
| Loop aggregates      | ~15   | sum, int edge cases                       |

### Running tests

```bash
# All tests
cargo test -p numcore_math --tests

# Single test
cargo test -p numcore_math --tests test_sqrt_perfect_squares

# List tests
cargo test -p numcore_math --tests -- --list

# Run with output
cargo test -p numcore_math --tests -- --nocapture
```

### Ignored tests

11 tests are ignored on host due to differences in overflow behaviour between
the embedded target (Cortex-M3, saturating arithmetic) and the host (x86_64,
wrapping arithmetic). They pass correctly on the embedded target:

- `test_factorial_overflow` — Stirling overflow at k=400
- `test_chisq_cdf_accuracy` — Lanczos precision differences
- `test_integration_wide_range` — integrator limits
- `test_trig_cordic_overflow` — CORDIC edge case
- `test_power_overflow_negative` — exponentiation overflow

## Firmware metrics

### Flash budget

| Component            | Size (bytes) | % of Flash |
|----------------------|-------------|-----------|
| .vector_table        | 64          | 0.1%      |
| fixed_point.o        | ~12,000     | 18%       |
| complex.o            | ~4,000      | 6%        |
| parser.o             | ~6,000      | 9%        |
| evaluator.o          | ~5,000      | 8%        |
| lexer.o              | ~3,000      | 5%        |
| engine.o             | ~1,000      | 2%        |
| vars.o               | ~500        | 1%        |
| distributions.o      | ~2,000      | 3%        |
| runtime/mod.o        | ~4,000      | 6%        |
| runtime/state.o      | ~2,000      | 3%        |
| runtime/event.o      | ~500        | 1%        |
| ui/formula.o         | ~3,000      | 5%        |
| ui/font.o            | ~700        | 1%        |
| hal crates           | ~3,000      | 5%        |
| libcore / compiler_builtins | ~3,500 | 5%        |
| **Total**            | **50,343**  | **77%**   |

Module sizes are approximate and vary with compiler version. Get exact
numbers with:

```bash
arm-none-eabi-size target/thumbv7m-none-eabi/release/NumCore
arm-none-eabi-objdump -h target/thumbv7m-none-eabi/release/NumCore
```

### RAM budget

| Resource           | Size (bytes) | Address Range              |
|--------------------|-------------|----------------------------|
| .bss (statics)     | 5,264       | 0x2000_0000 - 0x2000_1490  |
| Stack (reserved)   | 3,072       | 0x2000_1400 - 0x2000_2000  |
| Stack (actual max) | 3,032       | (peak at evaluate_node)    |
| Stack headroom     | 40          | (reserved - actual)        |
| SRAM total         | 8,192       | 0x2000_0000 - 0x2000_2000  |

### Measuring peak stack usage

Peak stack depth is measured by SP instrumentation at `evaluate_node` entry:

1. Add a global SP watermark variable in `numcore/src/math/mod.rs`:
   ```rust
   #[no_mangle]
   pub static mut MIN_SP: u32 = 0x2000_2000;
   ```
2. Call `track_sp()` at the start of `evaluate_node`:
   ```rust
   fn track_sp() {
       let sp: u32;
       unsafe { core::arch::asm!("mov {}, sp", out(reg) sp) };
       unsafe {
           if sp < MIN_SP { MIN_SP = sp; }
       }
   }
   ```
3. Build without stripping:
   ```toml
   # Cargo.toml override for measurement build
   [profile.release]
   strip = "none"  # preserve symbols
   ```
4. Run the worst-case workload in QEMU with GDB:
   ```bash
   # Terminal 1
   qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
     -kernel target/thumbv7m-none-eabi/release/NumCore -s -S
   # Terminal 2
   arm-none-eabi-gdb target/thumbv7m-none-eabi/release/NumCore
   (gdb) target remote localhost:1234
   (gdb) hbreak numcore::math::evaluator::evaluate_node
   (gdb) continue
   (gdb) x/wx &MIN_SP
   ```
5. Stack used = `0x2000_2000 - MIN_SP`

The canary-based approach is unreliable on ARM Cortex-M3 because `sub sp,#N`
instructions jump over 4-byte canary words placed at the stack bottom.

## Verifying Q31.32 constants

All mathematical constants are computed as `round(value * 2^32)`:

```python
import math
SCALE = 2**32

def to_q3132(x):
    return round(x * SCALE)

# Constants from fixed_point.rs
FIXED_ONE   = to_q3132(1.0)
PI          = to_q3132(math.pi)
E           = to_q3132(math.e)
LN_2        = to_q3132(math.log(2))
CORDIC_GAIN = to_q3132(math.prod(math.cos(math.atan(2**-i)) for i in range(24)))

# Verify: Q31.32 → float
def from_q3132(x):
    return x / SCALE

print(from_q3132(PI))          # 3.141592653589793
print(from_q3132(E))           # 2.718281828459045
```

## LN_FACTORIAL_TABLE values

The precomputed ln(k!) table in `distributions.rs`:

```python
import math
SCALE = 2**32
for k in range(0, 21):
    val = round(math.lgamma(k + 1) * SCALE)
    print(f"k={k:2d}  ln({k}!)={math.lgamma(k+1):.10f}  Q31.32={val}")
```

For k > 20, the code uses a 5-term Stirling approximation:
```
ln(k!) ≈ k*ln(k) - k + 0.5*ln(2*pi*k) + 1/(12*k) - 1/(360*k^3)
```
Relative error < 1e-8 for k >= 21.

## ANTI_TAN (CORDIC arctan table) values

```python
import math
SCALE = 2**32
for i in range(24):
    val = round(math.atan(2**-i) * SCALE)
    print(f"i={i:2d}  atan(2^-{i})={math.atan(2**-i):.10f}  Q31.32={val}")
```

This table occupies 24 * 8 = 192 bytes in Flash (.rodata).

## ANSI escape sequence handling

The event loop in `runtime/mod.rs` parses ANSI escape sequences for arrow key
support. Physical arrow keys on a terminal emulator send:

```
Left:  0x1B [ D
Right: 0x1B [ C
Up:    0x1B [ A
Down:  0x1B [ B
```

The parser uses a 3-state machine (`None → PendingEscape → PendingBracket`) and
a 3-byte buffer. Standalone `0x1B` (Escape) fires `ToggleMode` when no second
byte follows within 2 poll cycles.

The `handle_expression_submission` function uses raw pointer reborrowing
(`as *mut _`) to avoid borrow-checker conflicts when simultaneously accessing
multiple fields of CalcState:

```rust
let variables = &mut state.variables as *mut _;
let lex_scratch = &mut state.lex_scratch as *mut _;
let parse_scratch = &mut state.parse_scratch as *mut _;
unsafe {
    engine::evaluate_expression(
        expr_slice,
        &mut *variables,
        &mut *lex_scratch,
        &mut *parse_scratch,
        ...
    )
}
```

This is the only `unsafe` block in the runtime. It is safe because each raw
pointer targets a different field of CalcState (no aliasing).

## Debugging with GDB + QEMU

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

# Debug commands
(gdb) info registers       # all CPU regs including sp, lr, pc
(gdb) x/8wx $sp            # examine stack
(gdb) x/8wx 0x20000000     # examine .bss
(gdb) monitor system_reset # reset from GDB
```

### Binary size and disassembly

```bash
# Section sizes
arm-none-eabi-size target/thumbv7m-none-eabi/release/NumCore

# Full disassembly
arm-none-eabi-objdump -d target/thumbv7m-none-eabi/release/NumCore | less

# Vector table hex dump
arm-none-eabi-objdump -s -j .vector_table target/thumbv7m-none-eabi/release/NumCore

# Symbol sizes (debug build only)
arm-none-eabi-nm -S --size-sort target/thumbv7m-none-eabi/debug/NumCore | tail -30
```

## Adding a new math function

1. **Add the function name to the lexer** (`numcore/src/math/lexer.rs`):
   - The lexer emits individual `Identifier` tokens; the parser reassembles
     them into function names. No lexer change needed for new names of 3+
     letters that don't collide with existing prefixes.

2. **Add the AST node variant** (`numcore/src/math/parser.rs`):
   - Add the new function to the `Function` enum
   - Add the string match in `parse_identifier()` — this function checks
     consecutive identifier tokens against known function names
   - Functions are case-sensitive, lowercase

3. **Add the function enum** (`numcore/src/math/evaluator.rs`):
   - Add variant to `OneArgMathFunction` or `TwoArgMathFunction`
   - Implement the logic in `apply_one_arg_function()` or
     `apply_two_arg_function()`

4. **Implement the maths** (`numcore/src/math/fixed_point.rs` or
   `distributions.rs`):
   - Write the Q31.32 fixed-point implementation
   - Handle domain errors by returning `None`
   - Handle overflow/underflow at Q31.32 boundaries

5. **Wire to evaluator** (`numcore/src/math/evaluator.rs`):
   - Match the function enum variant in the appropriate apply function
   - Call through `Complex::` or `fp::` implementation

6. **Add to welcome banner** (`numcore/src/runtime/mod.rs`):
   - Add the function name to `print_welcome_banner()`

7. **Add tests** (`test-suite/tests/math.rs`):
   - Expected values for representative inputs
   - Domain errors (invalid inputs)
   - Overflow/underflow at boundaries
   - Roundtrip consistency where applicable

## Adding a new MCU port

1. Create `hal-<mcu>/` implementing `numcore::hal::Uart` and
   `numcore::hal::Display` traits
2. Create `numcore-<mcu>/` with `Cargo.toml`, `main.rs`, `boot.rs`, `link.x`
3. Add target-specific rustflags in `.cargo/config.toml`
4. Add to workspace `Cargo.toml` and `Makefile`

No changes to `numcore/` required.

## Mathematical constant definitions

| Constant       | Q31.32 hex          | Q31.32 decimal     | Float equivalent  |
|----------------|---------------------|-------------------|-------------------|
| FIXED_ONE      | 0x0000_0001_0000_0000 | 4,294,967,296    | 1.0               |
| PI             | 0x0000_0003_243F_6A89 | 13,773,379,209   | 3.1415926535      |
| E              | 0x0000_0002_B7E1_5163 | 11,676,924,259   | 2.7182818284      |
| HALF_PI        | 0x0000_0001_921F_B544 | 6,886,689,604    | 1.5707963267      |
| LN_2           | 0x0000_0000_B172_17F8 | 2,979,496,312    | 0.6931471805      |
| CORDIC_GAIN    | 0x0000_0001_5B97_7CD6 | 5,828,261,334    | 1.3572343318      |
| DEG_TO_RAD     | 0x0000_0000_0477_D1A9 | 75,071,401       | 0.0174532925      |
| RAD_TO_DEG     | 0x0000_0000_394B_B8CC | 959,175,884      | 57.2957795130     |
