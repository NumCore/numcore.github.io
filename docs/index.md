---
sidebar_position: 1
slug: /
---

# NumCore

<div align="center" id="simulator-container" style="position:relative;max-width:700px;margin:0 auto">

<!-- Simulator placeholder (shown before launch) -->
<div id="simulator-placeholder" style="border:2px dashed #444;border-radius:8px;padding:48px 24px;cursor:pointer;background:#1a1a2e;transition:background 0.2s" onclick="launchSimulator()" onmouseover="this.style.background='#232340'" onmouseout="this.style.background='#1a1a2e'">
  <div style="font-size:48px;margin-bottom:12px">&#9000;</div>
  <div style="font-size:18px;color:#e94560;font-weight:700;margin-bottom:8px">Launch NumCore Simulator</div>
  <div style="font-size:13px;color:#888">Run the full firmware math engine in your browser<br>No download required &middot; 429 KB &middot; Works offline</div>
</div>

<!-- Simulator iframe (hidden until launched) -->
<iframe id="simulator-iframe" src="/simulator/index-standalone.html" width="700" height="600" title="NumCore Simulator"
  style="border:none;border-radius:8px;max-width:100%;display:none"></iframe>

<!-- Fullscreen button (hidden until launched) -->
<button id="fs-button" onclick="toggleFullscreen()" style="display:none;position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);color:#fff;border:1px solid #555;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:13px;z-index:10">⛶ Fullscreen</button>

</div>

<script>
function launchSimulator() {
  var p = document.getElementById('simulator-placeholder');
  var f = document.getElementById('simulator-iframe');
  var b = document.getElementById('fs-button');
  p.style.display = 'none';
  f.style.display = 'block';
  b.style.display = 'block';
}
function toggleFullscreen() {
  var c = document.getElementById('simulator-container');
  if (!document.fullscreenElement) {
    c.requestFullscreen().catch(function(){});
  } else {
    document.exitFullscreen().catch(function(){});
  }
}
</script>

**Bare-metal scientific calculator firmware** for the **LM3S811** ARM Cortex-M3
(64 KB Flash, 8 KB SRAM), written in Rust with `#![no_std]` `#![no_main]`.

Features a Q31.32 fixed-point math engine with CORDIC + Taylor-corrected trig,
minimax polynomial exp/log, CLZ-based square root, rational minimax arctangent,
Smith's robust complex division, Stirling's log-gamma, overflow-aware scientific
notation, adaptive Simpson integration, matrix operations up to 4x4, and a
bytecode VM evaluator with zero C stack growth. No heap, no allocator, no OS.

[![Build Status](https://github.com/NumCore/NumCore/actions/workflows/ci.yml/badge.svg)](https://github.com/NumCore/NumCore/actions/workflows/ci.yml)

## Project highlights

- **Bytecode VM evaluation** — recursive-descent compiler emits opcodes into a
  256 B buffer; flat `execute()` loop with 16-entry value stack eliminates all
  C recursion. Expressions like `1+1+1+1+1+1+1+1+1+1` work correctly (the
  previous recursive evaluator overflowed at depth 4, silently corrupting `.bss`).
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
- **Adaptive Simpson integration** — iterative bisection, $\tau\approx10^{-8}$,
  max depth 20; integrates $\int_0^{10}\sinh x\,dx$ accurate to $<2\times10^{-6}$
- **Overflow-aware scientific notation** — results exceeding Q31.32 range
  display as `1.34406E+43`; binary operations adjust the overflow estimate
- **Bytecode compiler** — same recursive-descent grammar, emits opcodes instead
  of AST nodes; 12 opcodes, 256 B fixed-size buffer
- **Complex numbers** — full arithmetic + analytic-continuation trig
- **Matrix operations** — 4x4 max, determinant, inverse, transpose, cofactor,
  adjugate, scalar broadcast, matrix multiplication
- **Scientific notation mode** — `1.5E+10` syntax, ±99 exponent hard limit,
  auto-conversion to Scalar when value fits Q31.32 exactly
- **Log-space distributions** — ln_gamma (Stirling), ln_factorial
  (hybrid table/Stirling), binomial/Poisson PMF, chi-squared CDF
- **300/300 host-side tests pass**, 6 pre-existing ignored
  (overflow/underflow at Q31.32 boundaries)

## Supported functions

**Arithmetic:** `+ - * / ^ %`. **Trigonometric:** `sin cos tan asin acos atan`.
**Hyperbolic:** `sinh cosh tanh asinh acosh atanh`.
**Other:** `sqrt abs exp ln log log2 floor ceil round deg rad nthroot lngamma`.
**Distributions:** `binompp poissonp chicdf`. **Loops:** `sum int`.
**Matrix:** `det transpose identity inv cofactor adjugate`.
**Storage:** `sto`. **Constants:** `pi e`. **Variables:** `Ans A-Z` (scalar),
`MatA MatB MatC` (matrix).

See [Math Engine](/math-engine) for full reference.

## Modes

| Mode | Scope | Key features |
|------|-------|-------------|
| Standard | Arithmetic + transcendentals | All functions, real numbers only |
| Advanced | Standard + complex | Imaginary unit `i`, complex arithmetic |
| Matrix | Standard + matrix ops | Matrix literals `[(a,b)(c,d)]`, 4x4 limit |
| Scientific | Standard + E-notation | `1.5E+10` literal syntax, exponent arithmetic |

Cycle modes with `Esc` key.

## Firmware metrics

| Metric | Value | Budget | Usage |
|--------|-------|--------|-------|
| Flash (.text + .data) | 63,029 B | 64 KB | 96.2% |
| SRAM (.data + .bss + .stack) | 4,312 B | 8 KB | 52.6% |

## Quick start

```bash
# Build firmware (release, size-optimised)
cargo build -p numcore-lm3s811 --release --target thumbv7m-none-eabi

# Run host-side unit tests (300 tests)
cargo test -p numcore_math --tests

# Run in QEMU
qemu-system-arm -M lm3s811evb -serial mon:stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore

# Pipe expression
echo "2+2" | timeout 5 qemu-system-arm -M lm3s811evb -serial stdio -display none \
  -kernel target/thumbv7m-none-eabi/release/NumCore
```

Source code: **[github.com/NumCore/NumCore](https://github.com/NumCore/NumCore)**
