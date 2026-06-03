---
sidebar_position: 3
description: Q31.32 contract, pipeline, algorithms with equations, function reference
---

# Math Engine

## Evaluation Pipeline

Input processing follows a three-stage pipeline:

```
  bytes ──► lexer ──► tokens ──► compiler ──► bytecode ──► vm ──► result
```

1. **Lexer** (`lexer::tokenise_expression`) — character-by-character state
   machine, emits up to 64 `Token` values into a flat `[Token; 64]` array.
   Numbers are converted to Q31.32 immediately. Unary minus detection uses
   context-sensitive lookback. Mode-gated tokens: `i` → imaginary unit only
   in Advanced mode; `[`/`]` → matrix brackets only in Matrix mode;
   `E` → exponent suffix only in Scientific mode.

2. **Compiler** (`compiler::compile`) — recursive-descent precedence climbing
   (same grammar as the original parser) emits opcodes into a 256 B
   `Bytecode` buffer. No AST is ever built in memory. 12 opcodes cover all
   operations, functions, and control flow. The bytecode is a linear program
   ending in `Halt`.

3. **VM** (`vm::execute`) — flat `loop { match op { ... } }` dispatch with a
   16-entry `Option<Matrix>` value stack on the C stack. Zero C recursion —
   all operand storage is in the explicit value stack. Overflow tracked via a
   local `overflow: Option<(i64, bool)>` variable rather than bubbling through
   call frames.

The private API exposed to the runtime consists of two entry points:
`engine::evaluate_expression()` and `engine::format_result()`.

## Q31.32 Contract

All numeric values are stored as signed 64-bit integers under the Q31.32
fixed-point convention, with the binary point positioned between bits 31 and 32:

$$x_{\text{real}} = \frac{x_{\text{stored}}}{2^{32}}$$

The constant `FIXED_ONE` equals $1 \ll 32 = 4\,294\,967\,296$, giving a
precision of $2^{-32} \approx 2.33 \times 10^{-10}$, or approximately nine
decimal digits. The representable range is approximately $[-2.147,\,+2.147)$
billion in real terms.

**Multiplication** promotes to i128:

$$(a \cdot b)_{\text{Q31.32}} = \left\lfloor\frac{a \cdot b}{2^{32}} + \frac{1}{2}\right\rfloor$$

Symmetric rounding (half away from zero) is applied via absolute-value
arithmetic before the final truncation.

**Division** computes:

$$(a / b)_{\text{Q31.32}} = \left\lfloor\frac{a \ll 32}{b}\right\rfloor$$

Both return `None` on overflow or division by zero. Addition and subtraction
use saturating arithmetic (`.saturating_add`, `.saturating_sub`) so overflow
clamps to `i64::MIN` or `i64::MAX` instead of wrapping.

### Error model: `EvalResult`

The evaluator returns `EvalResult`, a tri-state enum:

```rust
enum EvalResult {
    Matrix(Matrix),
    Overflow { mantissa: i64, exponent: i32, negative: bool },
    DomainError,
}
```

- **`Matrix`** — a normal result. The unified `Matrix` type can represent a
  scalar (1×1), complex number (1×2), matrix (up to 4×4), or scientific
  notation value (1×2 with `kind = Scientific`). Results are formatted to
  6 decimal places with trailing zeros stripped.
- **`Overflow`** — the result exceeds Q31.32 range or the scientific notation
  display limit (|exponent| > 99). The overflow subsystem stores a log10
  estimate and sign via a thread-local static, then computes a
  scientific-notation display at the top-level return.
- **`DomainError`** — an invalid input (e.g. `sqrt(-1)` in Standard mode),
  rendered as `! error`.

Constants from `fixed_point.rs` (exact Q31.32 values):

| Constant       | Decimal value    | Q31.32 value   |
|----------------|------------------|----------------|
| `FIXED_PI`     | $\pi$            | 13,493,037,705 |
| `FIXED_E`      | $e$              | 11,674,931,555 |
| `FIXED_LN2`    | $\ln 2$          | 2,977,044,472  |
| `FIXED_LN10`   | $\ln 10$         | 9,889,527,671  |
| `FIXED_SQRT2`  | $\sqrt{2}$       | 6,074,001,000  |
| `FIXED_PI_OVER_180` | $\pi/180$   | 74,961,321     |
| `FIXED_180_OVER_PI` | $180/\pi$   | 246,083,499,208 |
| `CORDIC_GAIN`  | $K \approx 0.60725$ | 2,608,131,496 |

## Opcodes

12 opcodes encoded in a single byte, some followed by operand bytes:

| Opcode | Byte | Followed by | Stack effect |
|--------|------|------------|--------------|
| `PushI64` | 0x01 | 8 bytes LE i64 | `→ val` |
| `PushReg` | 0x02 | 1 byte register | `→ val` |
| `PushAns` | 0x03 | — | `→ ans` |
| `PushConst*` | 0x04–0x06 | — | `→ π`/`e`/`i` |
| `PushMatReg` | 0x07 | 1 byte register | `→ matrix` |
| `PushMatLit` | 0x08 | 1 byte cache index | `→ matrix` |
| `ConstructSci` | 0x09 | — | `→ Scientific(mant, exp)` |
| `Add/Sub/Mul/Div/Mod/Pow/Neg` | 0x10–0x16 | — | pop 2 → push 1 |
| `CallFunction` | 0x20 | 1 byte function index | pop 1 → push 1 |
| `CallBinomP/PoissonP/ChiCDF/NthRoot` | 0x40–0x43 | — | pop 2–3 → push 1 |
| `CallMatrixFunc` | 0x50 | 1 byte function index | pop 1 → push 1 |
| `Sto/StoMat` | 0x60–0x61 | 1 byte register | pop 1 → push 1 |
| `LoopSum/LoopInt` | 0x70–0x71 | 5 bytes header | pop 2 → push 1 |
| `Halt` | 0xFF | — | — |

`CallFunction` replaces 22 individual opcodes (CallSin through CallLnGamma)
by encoding the function index as a second byte. `CallMatrixFunc` similarly
replaces 6 individual opcodes (CallDet through CallAdjugate).

## CORDIC — Sine and Cosine

CORDIC (COordinate Rotation DIgital Computer) computes $\sin\theta$ and
$\cos\theta$ simultaneously using only shifts, adds, and a small lookup table.

### Algorithm

The rotation-mode CORDIC iteratively rotates a vector $(x,y)$ toward the
target angle $z$. Starting from:

$$x_0 = K \approx 0.60725,\quad y_0 = 0,\quad z_0 = \theta$$

where $K = \prod_{i=0}^{n-1} \cos(\arctan 2^{-i})$ is the CORDIC gain
pre-multiplied into $x_0$ so the result is gain-compensated. At each
iteration $i = 0,\dots,21$:

$$
\begin{aligned}
\sigma_i &= \operatorname{sign}(z_i) \\
x_{i+1} &= x_i - \sigma_i \cdot y_i \cdot 2^{-i} \\
y_{i+1} &= y_i + \sigma_i \cdot x_i \cdot 2^{-i} \\
z_{i+1} &= z_i - \sigma_i \cdot \arctan(2^{-i})
\end{aligned}
$$

After 22 iterations the residual angle is $|\delta| = |z_{22}| < 2^{-21}
\approx 4.77 \times 10^{-7}$ radians.

### Taylor Correction

To eliminate the residual error, a first-order Taylor correction is applied:

$$
\begin{aligned}
\cos(\theta_0 + \delta) &\approx \cos\theta_0 - \delta \cdot \sin\theta_0 \\
\sin(\theta_0 + \delta) &\approx \sin\theta_0 + \delta \cdot \cos\theta_0
\end{aligned}
$$

In CORDIC coordinates $(x,y) = (K\cos\theta_0,\,K\sin\theta_0)$:

$$
\begin{aligned}
x_{\text{final}} &= x - y \cdot \delta \\
y_{\text{final}} &= y + x \cdot \delta
\end{aligned}
$$

This reduces worst-case error from $|\delta| < 4.77 \times 10^{-7}$ to
$O(\delta^2) < 2.3 \times 10^{-13}$.

### Quadrant Folding

Angles outside $(-\pi/2, \pi/2)$ are folded using reflection identities.
The function `reduce_angle_to_principal` normalises any angle to $[-\pi, \pi]$
using `angle % TWO_PI`.

### Arctan Table

22 entries for $i = 0,\dots,21$ (176 bytes), each entry $\arctan(2^{-i})$ in
Q31.32. Values range from 3,373,259,426 ($\arctan 1$) down to 2,048
($\arctan 2^{-21}$).

## Arctangent — Rational Minimax

The arctangent uses a rational minimax approximation (Ganssle-Homer form)
rather than CORDIC vectoring mode, saving $\sim 700$ cycles. Max error
$< 1.6 \times 10^{-10}$ radians.

For $|x| \le 1$:

$$r = |x|, \quad t = r^2$$

$$
\operatorname{atan}(r) \approx r \cdot \frac{p_0 + p_2 t + p_4 t^2 + p_6 t^3 + p_8 t^4}{1 + q_2 t + q_4 t^2 + q_6 t^3 + q_8 t^4}
$$

For $|x| > 1$, the identity $\operatorname{atan}(x) = \pi/2 - \operatorname{atan}(1/x)$
is used. Coefficients are least-squares fit on Chebyshev nodes, Q31.32 quantised.

## $\operatorname{atan2}(y, x)$

Uses the smaller of $|y/x|$ or $|x/y|$ to avoid divide overflow, then corrects
into the proper quadrant based on signs of $y$ and $x$.

## $\operatorname{asin}(x)$ and $\operatorname{acos}(x)$

$$
\operatorname{asin}(x) = \operatorname{atan}\left(\frac{x}{\sqrt{1 - x^2}}\right), \quad
\operatorname{acos}(x) = \frac{\pi}{2} - \operatorname{asin}(x)
$$

Domain: $|x| \le 1$. Returns `None` otherwise.

## Exponential — $e^x$

Range reduction to $x = k \cdot \ln 2 + r$, $|r| \le \ln 2 / 2$, then
degree-7 minimax polynomial via Horner. Max error $\sim 5.95 \times 10^{-11}$.
Returns `None` for overflow ($k > 30$), `Some(0)` for underflow
($x < -21.5$).

## Natural Logarithm — $\ln x$

Range reduction to $x = 2^k \cdot m$ with $m \in [1/\sqrt{2}, \sqrt{2})$,
then degree-10 minimax polynomial $\ln(1+t) \approx t \cdot p(t)$.
Max error $\sim 1.62 \times 10^{-9}$. Returns `None` for $x \le 0$.

## $\log_{10} x$ and $\log_2 x$

$$\log_{10} x = \frac{\ln x}{\ln 10}, \quad \log_2 x = \frac{\ln x}{\ln 2}$$

## Square Root — $\sqrt{x}$

CLZ-based initial guess via 32-entry LUT ($<2\%$ error), 3 Newton iterations
on $1/\sqrt{x}$, then 1 final Newton step on $\sqrt{x}$. Max relative error
$\sim 3.7 \times 10^{-8}$.

## Integer Power

Binary exponentiation (exponentiation by squaring), $O(\log |\exp|)$ multiplies.
Negative exponents compute $1/\text{integer\_power}(\text{base}, -\exp)$.

## Nth Root

Newton iteration for integer $n \ge 3$, delegates to `sqrt` for $n=2$, to
$\exp(\ln(x)/n)$ for non-integer $n$.

## Hyperbolic Functions

All identity-based: $\sinh x = (e^x - e^{-x})/2$,
$\cosh x = (e^x + e^{-x})/2$, $\tanh x = \sinh x / \cosh x$.
$\tanh$ saturates at $|x| \ge 12$ to $\pm 1$.

Inverse hyperbolic functions use standard logarithmic forms.

## Complex Arithmetic

Complex multiplication uses the direct formula. Complex division uses
**Smith's overflow-safe formula** — dividing through by the larger component
($|c|$ or $|d|$) avoids the intermediate overflow of the naive formula.
All complex transcendentals use analytic continuations (see the source for
the full formula table in `complex.rs`).

## Scientific Notation (Scientific mode)

Scientific notation stores values as a pair `(mantissa, exponent)` where the
mantissa is a Q31.32 value normalised to $[1.0, 10.0)$ and the exponent is an
integer in $[-99, 99]$.

### Literal syntax

```
1.5E+10     → mantissa = 1.5·SCALE, exponent = +10
2E-5        → mantissa = 2.0·SCALE, exponent = -5
9.99E+99    → mantissa = 9.99·SCALE, exponent = +99
```

Fractional exponents (e.g. `2E1.2`) are rejected as lex errors — the
exponent must be an integer.

### Arithmetic rules

| Operation | Formula | Renormalisation |
|-----------|---------|-----------------|
| $S_1 \cdot S_2$ | $(m_1 \cdot m_2) \times 10^{e_1+e_2}$ | Renormalise mantissa to $[1,10)$ |
| $S_1 / S_2$ | $(m_1 / m_2) \times 10^{e_1-e_2}$ | Renormalise mantissa to $[1,10)$ |
| $S_1 + S_2$ | Align exponents, add mantissas | Renormalise; small addend negligible if $|e_1-e_2| > 9$ |
| $S_1 - S_2$ | Align exponents, subtract mantissas | Renormalise; result is scalar 0 if mantissas cancel |
| $S^{\,k}$ | $(m^{\,k}) \times 10^{e \cdot k}$ | Compute via $pow(m, k)$, then multiply exponent |

### Auto-conversion to Scalar

When a Scientific result has a mantissa with no fractional bits
(`mantissa & (SCALE-1) == 0`) and exponent $0 \le e \le 8$, it is
automatically converted to a plain Scalar via $m \times 10^e$.
For example: `1E5` → `100000`, `9E99*9E-99` → `81`.
Fractional mantissas (like `8.1E7`) stay in Scientific notation to avoid
amplifying the inherent $1/10$ truncation error.

### Overflow

If a computation produces $|e| > 99$, the value cannot be stored or displayed.
The runtime prints `! overflow`. This is a hard limit enforced at every
arithmetic step and at literal construction.

## Matrix Operations (Matrix mode)

Matrices are stored as a single `Matrix` type with `kind = Mat`. Max
dimension 4×4 (16 cells). Operations:

| Operation | Description | Complexity |
|-----------|-------------|------------|
| $A + B$ | Elementwise saturating add | $O(n^2)$ |
| $A - B$ | Elementwise saturating subtract | $O(n^2)$ |
| $A \cdot B$ | Standard matrix multiply, i128 intermediates | $O(n^3)$ |
| $k \cdot A$ | Scalar broadcast (both orders) | $O(n^2)$ |
| $\det(A)$ | 1×1–3×3 direct formula, 4×4 Gaussian elimination | $O(n^3)$ |
| $A^\top$ | Transpose | $O(n^2)$ |
| $A^{-1}$ | Adjugate / determinant | $O(n^3)$ |
| $\operatorname{cofactor}(A)$ | Minor → determinant → sign | $O(n^4)$ |
| $\operatorname{adj}(A)$ | Transpose of cofactor | $O(n^3)$ |
| $\operatorname{identity}(n)$ | Generate $I_n$ | $O(n)$ |

### Matrix literal syntax

```
[(1, 2)(3, 4)]   → [1 2; 3 4]   (2×2)
[(1,2,3)]        → [1 2 3]      (1×3)
[(1)(2)(3)]      → [1; 2; 3]    (3×1)
```

Rows are comma-separated inside parentheses, cells are comma-separated inside
a row. The entire matrix is wrapped in square brackets.

## 4-Digit Constants

```python
SCALE = 2**32

def to_q3132(x: float) -> int:
    return round(x * SCALE)

def from_q3132(x: int) -> float:
    return x / SCALE
```

| Constant           | Q31.32 decimal       | Float equivalent           |
|--------------------|----------------------|---------------------------|
| FIXED_ONE          | 4,294,967,296        | 1.0                       |
| FIXED_PI           | 13,493,037,705       | $\pi$                     |
| FIXED_E            | 11,674,931,555       | $e$                       |
| FIXED_LN2          | 2,977,044,472        | $\ln 2$                   |
| FIXED_LN10         | 9,889,527,671        | $\ln 10$                  |
| FIXED_PI_OVER_180  | 74,961,321           | $\pi/180$                 |
| FIXED_180_OVER_PI  | 246,083,499,208      | $180/\pi$                 |
| CORDIC_GAIN        | 2,608,131,496        | $K \approx 0.60725$       |
