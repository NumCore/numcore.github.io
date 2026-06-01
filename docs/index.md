---
sidebar_position: 1
slug: /
---

# NumCore

<p align="center">
  <img src="/img/demonstration.gif" alt="NumCore demonstration" />
</p>

**Bare-metal scientific calculator firmware** for the **LM3S811** ARM Cortex-M3
(64 KB Flash, 8 KB SRAM), written in Rust with `#![no_std]` `#![no_main]`.

Features a Q31.32 fixed-point math engine with CORDIC + Taylor-corrected trig,
minimax polynomial exp/log, CLZ-based square root, rational minimax arctangent,
Smith's robust complex division, Stirling's log-gamma, overflow-aware scientific
notation, and adaptive Simpson integration. No heap, no allocator, no OS.

[![Build Status](https://github.com/NumCore/NumCore/actions/workflows/ci.yml/badge.svg)](https://github.com/NumCore/NumCore/actions/workflows/ci.yml)

## Project highlights

- **Q31.32 fixed-point** — i64 storage, i128 intermediates, saturating
  arithmetic, `EvalResult` error model (`Value` / `Overflow` / `DomainError`),
  precision of $2^{-32}\approx2.33\times10^{-10}$ (~9 decimal digits)
- **CORDIC sin/cos** — 22 iterations + first-order Taylor correction on
  residual angle ($|\delta|<2^{-21}$, corrected to $O(\delta^2)<2.3\times10^{-13}$)
- **Rational minimax atan** — $\operatorname{atan}(r)=r\cdot P(r^2)/Q(r^2)$,
  Ganssle-Homer form, Horner evaluation, error $<1.6\times10^{-10}$ rad
- **Minimax exp** — degree-7 polynomial, max error $\sim5.95\times10^{-11}$
- **Minimax ln** — degree-10 polynomial, max error $\sim1.62\times10^{-9}$
- **CLZ reciprocal sqrt** — 32-entry LUT + 3 Newton iterations on $1/\sqrt{x}$
  + 1 final Newton refinement on $\sqrt{x}$
- **Smith's complex division** — overflow-safe branch on $|c|\ge|d|$,
  handles values up to $\sim10^9$ in Q31.32
- **Stirling's ln gamma** — asymptotic series $z\ge5$ with recurrence and
  reflection formula, $\sim6$ ULP worst-case error
- **Adaptive Simpson integration** — recursive bisection, $\tau\approx10^{-8}$,
  max depth 20; integrates $\int_0^{10}\sinh x\,dx$ accurate to $<2\times10^{-6}$
- **Overflow-aware scientific notation** — results exceeding Q31.32 range
  display as `1.34406E+43` instead of `! error`; binary operations adjust
  the overflow estimate (e.g. $\sinh(30)/2$ halves the mantissa)
- **Recursive-descent parser** — PEMDAS, right-associative `^`, implicit
  multiplication, flat-arena AST `[AstNode; 64]`
- **Complex numbers** — full arithmetic + analytic-continuation trig
- **Log-space distributions** — ln_gamma (Stirling), ln_factorial
  (hybrid table/Stirling), binomial/Poisson PMF, chi-squared CDF
- **275/275 host-side tests pass**, 6 pre-existing ignored
  (overflow/underflow at Q31.32 boundaries)

## Supported functions

Arithmetic: `+ - * / ^ %`.

Trigonometric: `sin cos tan asin acos atan`.

Hyperbolic: `sinh cosh tanh asinh acosh atanh`.

Other: `sqrt abs exp ln log log2 floor ceil round deg rad nthroot lngamma`.

Distributions: `binomialprob poissonprob chisqcdf`.

Loops: `sum int`.

Storage: `sto`. Constants: `pi e`. Variables: `Ans A-Z`.

See [Math Engine](/math-engine) for full reference.

## Firmware metrics

| Metric                         | Value              | Budget   | Usage |
|--------------------------------|--------------------|----------|-------|
| Flash (.vector_table + .text)  | 44,559 bytes       | 64 KB    | 68.0% |
| RAM (.bss + .stack)            | 5,272 bytes        | 8 KB     | 64.4% |
| — Static data (within .bss)    | 2,200 bytes        | 8 KB     | 26.9% |
| — Stack (reserved)             | 3,072 bytes        | 8 KB     | 37.5% |

The `.stack` section (NOLOAD) is included in the `.bss` measurement by the `size`
tool; actual static data is 2,200 bytes (end of `.bss` at `0x2000_0898`). The
stack is reserved at 3 KB (`_stack_size = 3K`) in the linker script, growing
downward from `0x2000_2000`.

## Quick start

```bash
# Build firmware (release, size-optimised)
cargo build -p numcore-lm3s811 --release --target thumbv7m-none-eabi

# Run host-side unit tests (275 tests)
cargo test -p numcore_math --tests

# Run in QEMU
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore

# Pipe expression
echo "2+2" | cargo run -p numcore-lm3s811 --release --target thumbv7m-none-eabi
```

Source code: **[github.com/NumCore/NumCore](https://github.com/NumCore/NumCore)**
