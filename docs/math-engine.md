---
sidebar_position: 3
description: Q31.32 contract, pipeline, algorithms with equations, function reference
---

# Math Engine

## Pipeline

The evaluation pipeline consists of five stages: raw expression bytes are tokenized by `lexer::tokenise_expression()`, the resulting token stream is parsed by `parser::parse_token_stream()` into a flat-arena AST, `evaluator::evaluate_tree()` walks the AST computing the result, and `engine::format_result()` renders the numeric outcome as a string. The lexer enforces a hard cap of 32 tokens. The parser enforces a hard cap of 64 AST nodes in the `ParseTree` arena. The public API exposed to callers consists of exactly two entry points: `evaluate_expression()` and `format_result()`.

## Q31.32 Contract

All numeric values are stored as signed 64-bit integers under the Q31.32 fixed-point convention, with the binary point positioned between bits 31 and 32:

$$x_{\text{real}} = \frac{x_{\text{stored}}}{2^{32}}$$

The constant `FIXED_ONE` equals $1 \ll 32 = 4\,294\,967\,296$, giving a precision of $2^{-32} \approx 2.33 \times 10^{-10}$, or approximately nine decimal digits. The representable range is $[-2^{31},\,2^{31}-1]$ in Q31.32 units, corresponding to $[-2^{31} \cdot 2^{-32},\,(2^{31}-1)\cdot 2^{-32}] \approx [-2.147,\,2.147)$ billion in real terms.

**Multiplication** promotes to i128:

$$(a \cdot b)_{\text{Q31.32}} = \left\lfloor\frac{a \cdot b}{2^{32}} + \frac{1}{2}\right\rfloor$$

Symmetric rounding (half away from zero) is applied via absolute-value arithmetic before the final truncation.

**Division** computes:

$$(a / b)_{\text{Q31.32}} = \left\lfloor\frac{a \ll 32}{b}\right\rfloor$$

Both return `None` on overflow or division by zero. Addition and subtraction use saturating arithmetic (`saturating_add`, `saturating_sub`) so overflow clamps to `i64::MIN` or `i64::MAX` instead of wrapping.

The error model is `Option<T>` throughout — `None` signals a domain error and is propagated via `?`, so a single invalid input collapses the entire computation to `None`. Display formatting rounds to six decimal places, strips trailing zeros, and suppresses the minus sign when a negative value rounds to zero (avoiding `-0.000000` output).

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

## CORDIC — Sine and Cosine

CORDIC (COordinate Rotation DIgital Computer) computes $\sin\theta$ and $\cos\theta$ simultaneously using only shifts, adds, and a small lookup table.

### Algorithm

The rotation-mode CORDIC iteratively rotates a vector $(x,y)$ toward the target angle $z$. Starting from:

$$x_0 = K \approx 0.60725,\quad y_0 = 0,\quad z_0 = \theta$$

where $K = \prod_{i=0}^{n-1} \cos(\arctan 2^{-i})$ is the CORDIC gain pre-multiplied into $x_0$ so the result is gain-compensated. At each iteration $i = 0,\dots,21$:

$$
\begin{aligned}
\sigma_i &= \operatorname{sign}(z_i) \\
x_{i+1} &= x_i - \sigma_i \cdot y_i \cdot 2^{-i} \\
y_{i+1} &= y_i + \sigma_i \cdot x_i \cdot 2^{-i} \\
z_{i+1} &= z_i - \sigma_i \cdot \arctan(2^{-i})
\end{aligned}
$$

After 22 iterations the residual angle is $|\delta| = |z_{22}| < 2^{-21} \approx 4.77 \times 10^{-7}$ radians.

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

This reduces worst-case error from $|\delta| < 4.77 \times 10^{-7}$ to $O(\delta^2) < 2.3 \times 10^{-13}$ — well below the $10^{-6}$ requirement.

### Quadrant Folding

Angles outside $(-\pi/2, \pi/2)$ are folded using reflection identities:

$$
\begin{aligned}
\sin(\pi - a) &= \sin a, \quad \cos(\pi - a) = -\cos a \\
\sin(-\pi + a) &= -\sin a, \quad \cos(-\pi + a) = -\cos a
\end{aligned}
$$

The function `reduce_angle_to_principal` normalises any angle to $[-\pi, \pi]$ using `angle % TWO_PI` then at most one conditional add or subtract.

### Arctan Table

22 entries for $i = 0,\dots,21$ (176 bytes):

| $i$ | $\arctan(2^{-i})$ | Q31.32 value |
|-----|-------------------|--------------|
| 0   | $0.78539816$      | 3,373,259,426 |
| 1   | $0.46364761$      | 1,991,351,318 |
| 2   | $0.24497866$      | 1,052,175,346 |
| 3   | $0.12435499$      | 534,100,635   |
| 4   | $0.06241881$      | 268,086,748   |
| 5   | $0.03123983$      | 134,174,063   |
| 6   | $0.01562373$      | 67,103,403    |
| 7   | $0.00781234$      | 33,553,749    |
| 8--21 | (halving)     | 16,777,131 down to 2,048 |

## Arctangent — Rational Minimax

The arctangent uses a rational minimax approximation (Ganssle-Homer form) rather than CORDIC vectoring mode, saving $\sim 700$ cycles.

### Algorithm

For $|x| \le 1$:

$$r = |x|, \quad t = r^2$$

$$
\begin{aligned}
P(t) &= p_0 + p_2 t + p_4 t^2 + p_6 t^3 + p_8 t^4 \\
Q(t) &= 1 + q_2 t + q_4 t^2 + q_6 t^3 + q_8 t^4
\end{aligned}
$$

$$\operatorname{atan}(r) = r \cdot \frac{P(t)}{Q(t)}$$

Both polynomials are evaluated via Horner's method:

```
P = (((p8·t + p6)·t + p4)·t + p2)·t + p0
Q = (((q8·t + q6)·t + q4)·t + q2)·t + 1
```

For $|x| > 1$, the identity $\operatorname{atan}(x) = \pi/2 - \operatorname{atan}(1/x)$
is used. The result is negated if the input was negative.

### Coefficients

Least-squares fit on Chebyshev nodes, Q31.32 quantised:

| Constant | Float value |
|----------|-------------|
| $p_0$    | $1.0000000000$ |
| $p_2$    | $2.0163416525$ |
| $p_4$    | $1.2131029095$ |
| $p_6$    | $0.2162130075$ |
| $p_8$    | $0.0052570247$ |
| $q_2$    | $2.3496750128$ |
| $q_4$    | $1.7963273742$ |
| $q_6$    | $0.4879158549$ |
| $q_8$    | $0.0331622299$ |

Max error: $< 1.6 \times 10^{-10}$ radians. Cycle count: $\sim 700$ (was $\sim 1400$ for CORDIC vectoring).

## $\operatorname{atan2}(y, x)$

Four-quadrant arctangent using the smaller of $|y/x|$ or $|x/y|$ to avoid divide overflow:

$$
\text{ratio} = \frac{\min(|y|, |x|)}{\max(|y|, |x|)},\quad \text{angle} = \operatorname{atan}(\text{ratio})
$$

The angle is then corrected into the proper quadrant based on the signs of $y$ and $x$.

Special cases: $x = 0, y > 0 \to \pi/2$; $x = 0, y < 0 \to -\pi/2$; $x = 0, y = 0 \to 0$.

## $\operatorname{asin}(x)$ and $\operatorname{acos}(x)$

$$
\operatorname{asin}(x) = \operatorname{atan}\left(\frac{x}{\sqrt{1 - x^2}}\right), \quad
\operatorname{acos}(x) = \frac{\pi}{2} - \operatorname{asin}(x)
$$

Domain: $|x| \le 1$. Returns `None` otherwise.

## Tangent

$$\tan\theta = \frac{\sin\theta}{\cos\theta}$$

Returns `None` if $|\cos\theta| < 10^{-4}$ (safety margin near $\pi/2$ poles).

## Exponential — $e^x$

### Range reduction

$$x = k \cdot \ln 2 + r, \quad |r| \le \frac{\ln 2}{2}$$

where $k = \lfloor x / \ln 2 \rfloor$ (truncated toward zero). Then:

$$e^x = e^r \cdot 2^k$$

### Minimax polynomial

$e^r$ is evaluated via a degree-7 minimax polynomial in Horner form:

$$
e^r \approx c_0 + r(c_1 + r(c_2 + r(c_3 + r(c_4 + r(c_5 + r(c_6 + r \cdot c_7))))))
$$

Maximum error $\sim 5.95 \times 10^{-11}$. For $x < 0$, the identity $e^x = 1/e^{-x}$ is used.

### Overflow/underflow

- $k < 0$ or $k > 30$: returns `None` (overflow)
- $x < -31\ln 2 \approx -21.5$: returns `Some(0)` (underflow)

## Natural Logarithm — $\ln x$

### Range reduction

Normalise $x = 2^k \cdot m$ where $m \in [1/\sqrt{2}, \sqrt{2})$ via shift loops
and a conditional check against $\sqrt{2}$. Then $t = m - 1$ so:

$$|t| \le \sqrt{2} - 1 \approx 0.414$$

### Minimax polynomial

Evaluated as $t \cdot p(t)$ where $p(t) \approx \ln(1+t)/t$ via degree-9 polynomial (degree-10 overall):

$$
\ln(1+t) \approx c_0 + t(c_1 + t(c_2 + t(c_3 + t(c_4 + t(c_5 + t(c_6 + t(c_7 + t(c_8 + t(c_9 + t \cdot c_{10}))))))))))
$$

$c_0 = 0$ ensures $\ln(1) = 0$ exactly. Maximum error $\sim 1.62 \times 10^{-9}$.

### Final result

$$\ln x = k \cdot \ln 2 + \ln(1 + t)$$

Returns `None` for $x \le 0$.

## $\log_{10} x$ and $\log_2 x$

$$\log_{10} x = \frac{\ln x}{\ln 10}, \quad \log_2 x = \frac{\ln x}{\ln 2}$$

## Square Root — $\sqrt{x}$

Uses a CLZ-based initial guess for the reciprocal square root, followed by
Newton-Raphson refinement.

### Initial guess

Normalise $x = 2^p \cdot m$ where $m \in [1, 2)$ via `leading_zeros()`. Index
a 32-entry midpoint LUT for $1/\sqrt{m}$, then apply exponent scaling:

$$
y_0 = \begin{cases}
\text{LUT}[i] \gg e/2               & e \ge 0,\ e\ \text{even} \\
\text{LUT}[i] \cdot 1/\sqrt{2} \gg (e-1)/2 & e \ge 0,\ e\ \text{odd} \\
\text{LUT}[i] \ll -e/2              & e < 0,\ -e\ \text{even} \\
\text{LUT}[i] \cdot \sqrt{2} \ll (-e-1)/2  & e < 0,\ -e\ \text{odd}
\end{cases}
$$

where $e = p - 32$. Initial error $< 2\%$.

### Newton-Raphson on $1/\sqrt{x}$

Three iterations of:

$$y_{n+1} = \frac{1}{2} \cdot y_n \cdot (3 - x \cdot y_n^2)$$

### Final Newton step on $\sqrt{x}$

$$s = x \cdot y_3, \quad s \leftarrow \frac{1}{2}\left(s + \frac{x}{s}\right)$$

Max relative error $\sim 3.7 \times 10^{-8}$. Cycle count $\sim 250$ (was $\sim 800$).

## Integer Power

Binary exponentiation (exponentiation by squaring):

```
function integer_power(base, exp):
    result = 1
    while exp > 0:
        if exp & 1: result *= base
        base *= base
        exp >>= 1
    return result
```

For negative exponents, compute $1/\text{integer\_power}(base, -\exp)$.

## Nth Root

For integer $n \ge 3$, Newton iteration:

$$x_{k+1} = \frac{(n-1) \cdot x_k + x / x_k^{n-1}}{n}$$

12 iterations, initial guess $x_0 = \max(x/2, 1)$. Delegates to `sqrt` for $n=2$,
to `exp(ln(x)/n)` for non-integer $n$, and to $1/\text{nthroot}(x, -n)$ for negative $n$.

## Hyperbolic Functions

$$
\begin{aligned}
\sinh x &= \frac{e^x - e^{-x}}{2} \\
\cosh x &= \frac{e^x + e^{-x}}{2} \\
\tanh x &= \frac{e^x - e^{-x}}{e^x + e^{-x}} = \frac{\sinh x}{\cosh x}
\end{aligned}
$$

$\tanh$ saturates: $|x| \ge 12 \to \pm 1$ (correction term $< 1$ ULP).

### Inverse Hyperbolic Functions

$$
\begin{aligned}
\operatorname{asinh} x &= \ln\left(x + \sqrt{x^2 + 1}\right) \\
\operatorname{acosh} x &= \ln\left(x + \sqrt{x^2 - 1}\right),\quad x \ge 1 \\
\operatorname{atanh} x &= \frac{1}{2} \ln\left(\frac{1 + x}{1 - x}\right),\quad |x| < 1
\end{aligned}
$$

## Complex Arithmetic — `complex.rs`

The `Complex(i64, i64)` type mirrors the real Q31.32 contract. Addition and
subtraction use saturating arithmetic.

### Smith's Complex Division

The naive formula $(a+bi)/(c+di) = (ac+bd)/(c^2+d^2) + (bc-ad)/(c^2+d^2)i$
overflows when $|c|,|d| > \sqrt{2^{31}} \approx 46340$. Smith's robust
algorithm avoids this by dividing through by the larger component:

If $|c| \ge |d|$:

$$r = \frac{d}{c},\quad \text{den} = c + d \cdot r$$

$$
\operatorname{Re} = \frac{a + b \cdot r}{\text{den}},\quad
\operatorname{Im} = \frac{b - a \cdot r}{\text{den}}
$$

If $|d| > |c|$:

$$r = \frac{c}{d},\quad \text{den} = c \cdot r + d$$

$$
\operatorname{Re} = \frac{a \cdot r + b}{\text{den}},\quad
\operatorname{Im} = \frac{b \cdot r - a}{\text{den}}
$$

All intermediates bounded by $\max(|a|,|b|,|c|,|d|)$. Handles values up to
$\sim 10^9$ safely ($\sim 23000\times$ improvement over naive).

### Complex Transcendentals

All use analytic continuations. Key formulas:

| Function | Formula |
|----------|---------|
| $\sin(a+bi)$ | $\sin a \cosh b + i \cos a \sinh b$ |
| $\cos(a+bi)$ | $\cos a \cosh b - i \sin a \sinh b$ |
| $\tan(a+bi)$ | $\sin(a+bi) / \cos(a+bi)$ |
| $\operatorname{asin} z$ | $-i \ln(iz + \sqrt{1 - z^2})$ |
| $\operatorname{acos} z$ | $-i \ln(z + i\sqrt{1 - z^2})$ |
| $\operatorname{atan} z$ | $\frac{i}{2} \ln\frac{i+z}{i-z}$ |
| $\sinh(a+bi)$ | $\sinh a \cos b + i \cosh a \sin b$ |
| $\cosh(a+bi)$ | $\cosh a \cos b + i \sinh a \sin b$ |
| $\tanh z$ | $\sinh z / \cosh z$ |
| $\operatorname{asinh} z$ | $\ln(z + \sqrt{z^2 + 1})$ |
| $\operatorname{acosh} z$ | $\ln(z + \sqrt{z-1}\sqrt{z+1})$ |
| $\operatorname{atanh} z$ | $\frac{1}{2} \ln\frac{1+z}{1-z}$ |
| $\exp(a+bi)$ | $e^a(\cos b + i\sin b)$ |
| $\ln z$ | $\ln\lvert z\rvert + i \arg z$ |
| $z^w$ | $\exp(w \cdot \ln z)$ |

Complex square root:

$$
\sqrt{z} = \begin{cases}
\sqrt{\operatorname{Re}(z)} & \operatorname{Im}(z)=0,\ \operatorname{Re}(z)\ge 0 \\
i\sqrt{|\operatorname{Re}(z)|} & \operatorname{Im}(z)=0,\ \operatorname{Re}(z)<0 \\
\sqrt{\frac{|z|+\operatorname{Re}(z)}{2}} + i \cdot \operatorname{sign}(\operatorname{Im}(z)) \sqrt{\frac{|z|-\operatorname{Re}(z)}{2}} & \text{otherwise}
\end{cases}
$$

## Lexer — `lexer.rs`

The lexer tokenises expressions via `parse_identifier()`, which returns direct
function tokens (`Token::FuncSin`, `Token::FuncBinomP`, etc.) — the parser
does NOT reassemble identifiers from raw characters. Identifiers are
case-insensitive in practice (converted to lowercase for matching). Single
uppercase letters `A`–`Z` are variable registers.

Unary minus detection checks whether the previous token is an operator, opening
parenthesis, comma, or the start of expression. Numbers are parsed as integer
plus optional fractional part, converted to Q31.32 via i128 arithmetic. The `i`
suffix for the imaginary unit is emitted as `Token::ConstI` in Advanced mode only.

Max tokens: 32. Max identifier length: 8 bytes.

## Parser — `parser.rs`

The parser uses recursive descent following PEMDAS precedence:

```
expression  = term   (( '+' | '−' ) term)*
term        = power  (( '*' | '/' | '%' | implicit_mult ) power)*
power       = unary  ( '^' power )*              ← right-associative
unary       = '−' unary | primary
primary     = NUMBER | CONSTANT | VARIABLE
            | FUNC '(' expr ')'
            | THREE_ARG_FUNC '(' expr ',' expr ',' expr ')'
            | TWO_ARG_FUNC '(' expr ',' expr ')'
            | LOOP '(' expr ',' VAR ',' expr ',' expr ')'
            | sto '(' expr ',' VAR ')'
            | '(' expr ')'
```

The AST is a flat arena: `[AstNode; 64]` allocated in `.bss`, never
heap-allocated. Child references are array indices.

AstNode variants: `Literal`, `Constant`, `Variable`, `BinaryOperation`,
`UnaryNegation`, `FunctionCall`, `ThreeArgFunction`, `TwoArgFunction`,
`Store`, `LoopAggregate`.

## Evaluator — `evaluator.rs`

The recursive `evaluate_node` dispatches on the AstNode variant. For real-argument
sin/cos/tan/asin/acos/atan, the evaluator applies deg↔rad conversion via
`degrees_to_radians` or `radians_to_degrees` when `AngleMode` is `Degrees`.
Complex-argument and hyperbolic functions always use radians.

### Adaptive Simpson Integration

Replaces the original fixed 100-interval Simpson's rule. Uses recursive bisection
with error control:

$$S(a,b) = \frac{h}{6}\bigl(f(a) + 4f(m) + f(b)\bigr),\quad h = b-a,\ m = \frac{a+b}{2}$$

Error estimate:

$$\bigl|S(a,m) + S(m,b) - S(a,b)\bigr| < 15 \cdot \tau$$

If the estimate exceeds the tolerance, each half is subdivided recursively with
$\tau_{\text{child}} = \max(\tau/2, 1)$. Parameters:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| $\tau$ (ADAPTIVE_TOL) | 43 Q31.32 ULP ($\approx 10^{-8}$) | Per-subinterval tolerance |
| Max depth | 20 | Maximum bisection depth |
| Max evals | 2000 | Maximum function evaluations |
| Max stack | 24 | Maximum pending subintervals |

Results are snapped to the nearest integer when within `INTEGRATION_SNAP_THRESHOLD`
(4295 Q31.32 ULP, $\approx 10^{-6}$).

### Loop aggregates

- `sum(body, var, a, b)`: iterates $k$ from $a$ to $b$, writes $k$ as a Q31.32
  integer into the loop-variable register, evaluates the body, and accumulates
  the sum.
- `int(body, var, a, b)`: adaptive Simpson integration.
- `sto(value, var)`: writes value to the register identified by var, returns
  the value.

Loop variables use closure-wrap save/restore — one `Complex` (16 bytes) is saved
on the stack before the loop and restored after, rather than cloning the entire
`VariableStore` (~440 bytes).

## Statistical Distributions — `distributions.rs`

### $\ln(k!)$ — Log-Factorial

For $k \le 20$: exact lookup table (21 entries, 168 bytes).

For $k > 20$: Stirling's asymptotic series:

$$
\ln(k!) = k\ln k - k + \frac{1}{2}\ln(2\pi k) + \frac{1}{12k} - \frac{1}{360k^3} + \frac{1}{1260k^5}
$$

Higher-order terms are skipped if they would overflow; at $k \ge 21$ the omitted
terms are $< 10^{-10}$, well below the $10^{-6}$ requirement.

### $\ln\Gamma(z)$ — Log-Gamma

- **Integer $z$**: delegates to $\ln\Gamma(z) = \ln((z-1)!)$ via `ln_factorial`.
- **Half-integer $z = n + \tfrac{1}{2}$**: closed form:

$$\ln\Gamma\!\left(n+\frac{1}{2}\right) = \ln((2n)!) - n\ln 4 - \ln(n!) + \frac{1}{2}\ln\pi$$

- **$z < 0.5$**: Euler reflection formula:

$$\ln\Gamma(z) = \ln\pi - \ln(\sin(\pi z)) - \ln\Gamma(1-z)$$

- **$0.5 \le z < 5$**: recurrence $\ln\Gamma(z) = \ln\Gamma(z+1) - \ln z$ until $z \ge 5$.
- **$z \ge 5$**: Stirling's asymptotic expansion:

$$
\ln\Gamma(z) = (z-\tfrac{1}{2})\ln z - z + \tfrac{1}{2}\ln(2\pi) + \frac{1}{12z} - \frac{1}{360z^3} + \frac{1}{1260z^5} - \frac{1}{1680z^7}
$$

Correction terms computed as $(1/n) \times (1/z^p)$ to avoid overflow; terms that
overflow are skipped (negligible at overflow point).

### Binomial PMF

$$P(X=k) = \binom{n}{k} p^k (1-p)^{n-k}$$

Computed in log space:

$$\ln P = \ln(n!) - \ln(k!) - \ln((n-k)!) + k\ln p + (n-k)\ln(1-p)$$

$$P = \exp(\ln P)$$

### Poisson PMF

$$P(X=k) = \frac{\lambda^k e^{-\lambda}}{k!}$$

Log-space computation:

$$\ln P = k\ln\lambda - \lambda - \ln(k!)$$

$$P = \exp(\ln P)$$

### Chi-Squared CDF

$$P(X \le x; k) = \frac{1}{\Gamma(k/2)}\gamma\!\left(\frac{k}{2}, \frac{x}{2}\right)$$

where $\gamma$ is the lower incomplete gamma function. Implemented via series
expansion:

$$\gamma(a, x) = e^{-x} x^a \sum_{n=0}^{\infty} \frac{x^n}{a(a+1)\cdots(a+n)}$$

Prefactor computed in log space: $\exp(-x + a\ln x - \ln\Gamma(a))$. Series
converges when $|\text{term}| < |\text{sum}| / 10^9$. Max 60 terms.

## Function Reference

All function names in the expression language are lowercase.

| Expression | What it does |
|---|---|
| `sin(x)` | Sine of x (radians or degrees) |
| `cos(x)` | Cosine of x |
| `tan(x)` | Tangent of x (returns None near $\pm\pi/2$) |
| `asin(x)` | Inverse sine, result in current angle mode |
| `acos(x)` | Inverse cosine, result in current angle mode |
| `atan(x)` | Inverse tangent, result in current angle mode |
| `sinh(x)` | Hyperbolic sine (always radians) |
| `cosh(x)` | Hyperbolic cosine (always radians) |
| `tanh(x)` | Hyperbolic tangent (always radians) |
| `asinh(x)` | Inverse hyperbolic sine |
| `acosh(x)` | Inverse hyperbolic cosine (domain: $x \ge 1$) |
| `atanh(x)` | Inverse hyperbolic tangent (domain: $\lvert x\rvert < 1$) |
| `sqrt(x)` | Square root |
| `abs(x)` | Absolute value |
| `exp(x)` | $e^x$ |
| `ln(x)` | Natural log ($x > 0$) |
| `log(x)` | Base-10 log ($x > 0$) |
| `log2(x)` | Base-2 log ($x > 0$) |
| `floor(x)` | Round toward $-\infty$ |
| `ceil(x)` | Round toward $+\infty$ |
| `round(x)` | Round to nearest (half away from zero) |
| `deg(x)` | Convert degrees $\to$ radians |
| `rad(x)` | Convert radians $\to$ degrees |
| `nthroot(x,n)` | $n$-th root of x |
| `lngamma(x)` | $\ln\Gamma(x)$, $x > 0$ |
| `binomp(n,k,p)` | Binomial PMF: $P(X=k)$, $X\sim\text{Binomial}(n,p)$ |
| `poissonp(\lambda,k)` | Poisson PMF: $P(X=k)$, $X\sim\text{Poisson}(\lambda)$ |
| `chicdf(x,k)` | Chi-squared CDF: $P(X\le x)$, $X\sim\chi^2(k)$ |
| `sum(body,var,a,b)` | $\sum$: sum body over $[a, b]$ |
| `int(body,var,a,b)` | $\int$: adaptive Simpson integration over $[a, b]$ |
| `sto(v,reg)` | Store $v$ into register reg |
| `Ans` | Last computed answer |
| `A`–`Z` | User registers (26 registers) |
| `pi` | $\pi$ constant |
| `e` | Euler's number |

## Deg / Rad Mode

The evaluator automatically applies angle-mode conversion for real-argument
sin, cos, tan, asin, acos, and atan. When `AngleMode` is `Degrees`,
sin/cos/tan convert the input from degrees to radians before calling the
trig routines, and asin/acos/atan convert the radian result back to degrees
afterward. Hyperbolic functions and complex-argument trigonometric functions
ignore angle mode entirely and always operate in radians.

The `deg(x)` function explicitly converts from degrees to radians
($\times \pi/180$). The `rad(x)` function converts from radians to degrees
($\times 180/\pi$).

## Key Design Decisions

**CORDIC over LUT**: The CORDIC arctan table consumes only 176 bytes of
storage, whereas a full kilobyte-scale LUT would be needed to cover all
transcendental functions at comparable precision. Twenty-two iterations +
Taylor correction converge to full Q31.32 precision and complete in
interactive time on a 12 MHz Cortex-M3.

**Minimax over Taylor for exp/ln**: Minimax polynomials give the same accuracy
with fewer terms (7 vs 12 for exp, 10 vs 20 for ln) and simpler Horner
evaluation. The coefficients are precomputed via Chebyshev approximation and
hard-coded.

**Rational minimax over CORDIC for atan**: The rational approximation is $\sim
2\times$ faster ($\sim 700$ vs $\sim 1400$ cycles) and more accurate ($< 1.6
\times 10^{-10}$ vs $\sim 4.8 \times 10^{-7}$ rad residual).

**CLZ rsqrt over integer sqrt**: The CLZ + 32-entry LUT approach is $\sim
3.2\times$ faster ($\sim 250$ vs $\sim 800$ cycles) than `u64::isqrt` + 10
Newton iterations, with comparable accuracy.

**Smith's complex division**: Avoids overflow at $|c|,|d| > \sim 46000$ that
would plague the naive formula, extending safe division to $\sim 10^9$.

**Log-space probability**: Computing $C(1000, 500)$ directly overflows Q31.32,
but $\ln C(1000, 500)$ fits easily. Every binomial and Poisson PMF accumulates
in the log domain and exponentiates only at the final step.

**Hybrid ln_factorial**: A 21-entry lookup table (168 bytes) covers $k = 0..20$
with zero computation. Stirling's series handles $k \ge 21$ with overflow-safe
term computation. This eliminates Lanczos for the most common path.

**Flat arena AST**: The `[AstNode; 64]` arena occupies 3,088 bytes in `.bss`,
never allocates, uses index-based child references instead of pointers, and
provides bounded worst-case parse time — the parser simply rejects expressions
exceeding 64 nodes.

**Closure-wrap over VariableStore clone**: Saving one `Complex` (16 bytes) for
loop variable shadowing avoids cloning the entire `VariableStore` ($\sim 440$
bytes) on each loop invocation.
