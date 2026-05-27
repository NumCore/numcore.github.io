---
sidebar_position: 3
description: Q31.32 contract, pipeline, design decisions, function reference
---

# Math Engine

## Pipeline

The evaluation pipeline consists of five stages: raw expression bytes are tokenized by `lexer::tokenise_expression()`, the resulting token stream is parsed by `parser::parse_token_stream()` into a flat-arena AST, `evaluator::evaluate_tree()` walks the AST computing the result, and `engine::format_result()` renders the numeric outcome as a string. The lexer enforces a hard cap of 32 tokens. The parser enforces a hard cap of 64 AST nodes in the `ParseTree` arena. The public API exposed to callers consists of exactly two entry points: `evaluate_expression()` and `format_result()`.

## Q31.32 Contract

All numeric values are stored as signed 64-bit integers under the Q31.32 fixed-point convention, with the binary point positioned between bits 31 and 32. The constant `FIXED_ONE` equals `1 << 32` = 4,294,967,296, giving a precision of 1/2³² ≈ 2.33 × 10⁻¹⁰, or approximately nine decimal digits.

Multiplication promotes to i128: `(a as i128) * (b as i128)`, then shifts right by 32. Symmetric rounding (half away from zero) is applied via absolute-value arithmetic before the final truncation. Division computes `((a as i128) << 32) / (b as i128)`, also in i128, and truncates toward zero. Both return `None` on overflow or division by zero. Addition and subtraction use saturating arithmetic (`saturating_add`, `saturating_sub`) so overflow clamps to i64::MIN or i64::MAX instead of wrapping.

The error model is `Option<T>` throughout — `None` signals a domain error and is propagated via `?`, so a single invalid input collapses the entire computation to `None`. Display formatting rounds to six decimal places, strips trailing zeros, and suppresses the minus sign when a negative value rounds to zero (avoiding `-0.000000` output).

Constants from `fixed_point.rs` (exact Q31.32 values):

| Constant | Decimal value | Q31.32 value |
|---|---|---|
| `FIXED_PI` | 3.14159265 | 13,493,037,705 |
| `FIXED_E` | 2.71828183 | 11,674,931,555 |
| `FIXED_LN2` | 0.69314718 | 2,977,044,472 |
| `FIXED_PI_OVER_180` | π/180 | 74,961,321 |
| `FIXED_180_OVER_PI` | 180/π | 246,083,499,208 |

## CORDIC — Sine, Cosine, Arctan

CORDIC rotation mode computes sin and cos in 24 iterations. The initial state is x = `CORDIC_GAIN` (2,608,131,496 ≈ 0.607252935), y = 0, z = angle. At each iteration i (0..23): if z ≥ 0, rotate counter-clockwise (x -= y>>i, y += x>>i, z -= atan(2⁻ⁱ)); otherwise rotate clockwise with opposite signs. After 24 iterations, y holds sin and x holds cos. `CORDIC_GAIN` is the product ∏cos(atan(2⁻ⁱ)), pre-multiplied into the initial x so the result is already gain-compensated.

The arctan table has 24 entries consuming 192 bytes. The first entry is 3,373,259,426 (atan(2⁰) = π/4), and the last is 512 (atan(2⁻²³)).

Angles outside (−π/2, π/2) are folded using quadrant reduction: `cordic_sin_cos` maps angles > π/2 or < −π/2 into (−π/2, π/2) via reflection identities — sin(π−a)=sin(a), cos(π−a)=−cos(a), sin(−a)=−sin(a). The function `reduce_angle_to_principal` normalises any angle to [−π, π] using `angle % FIXED_TWO_PI` then at most one conditional add or subtract.

Inverse arctangent uses CORDIC vectoring mode: starts with x = `FIXED_ONE`, y = input, z = 0. At each iteration, if y > 0, rotate clockwise (x += y>>i, y -= x>>i, z += atan(2⁻ⁱ)); if y ≤ 0, rotate counter-clockwise. After 24 iterations, z holds atan(input).

## Exponential — `natural_exp`

The exp function uses a 12-term Taylor series with range reduction. Given x, compute k = floor(x / ln2) and r = x − k·ln2 so that `|r| < ln2` ≈ 0.693 and eˣ = 2ᵏ · eʳ.

The series eʳ = 1 + r + r²/2! + r³/3! + ... + r¹²/12! is evaluated entirely in i128 to preserve precision. Each term is computed as termₙ = termₙ₋₁ · r / n, maintaining Q31.32 scaling throughout.

The polynomial result is then shifted left by k (multiplied by 2ᵏ). If k < 0 or k > 30 (the maximum shift before Q31.32 overflow), the function returns `None`. If x < −MAX_POS_EXP_ARG (approximately −21.5), the result underflows to 0 and returns `Some(0)`. Negative x is handled via the identity eˣ = 1/e⁻ˣ.

## Natural Logarithm — `natural_log`

The ln function uses a 20-term alternating Taylor series with range reduction. The input x = 2ᵏ · m is reduced so that m lies in [1/√2, √2) (found via shift loops plus a conditional check against √2). This bounds t = m − 1 to |t| ≤ √2 − 1 ≈ 0.414, guaranteeing rapid series convergence.

The series ln(m) = t − t²/2 + t³/3 − t⁴/4 + ... + t²⁰/20 is evaluated with each term computed as t_power / n, where t_power is reduced by (t_power · t) >> 32 each iteration. The final result is k · `FIXED_LN2` + series. Input x ≤ 0 returns `None`.

## Square Root — `sqrt`

Square root uses Newton-Raphson with 10 iterations. The initial guess is `u64::isqrt(x) << 16`, which is within a factor of √2 of the true result for all x ≥ 1 and exactly correct for perfect squares.

Each iteration computes quotient = `(x << 32) / guess` (in i128), then guess = guess/2 + quotient/2. Negative x returns `None`.

## Power and Nth Root — `power`, `nthroot`

The `power(base, exp)` function checks whether the exponent is an exact integer (fractional bits zero). If so, it delegates to `integer_power` which uses binary exponentiation: result = 1, b = base, e = exp; while e > 0, if e & 1 then result *= b; b = b²; e >>= 1. Negative exponents are handled via 1/result.

For non-integer exponents, power computes exp(exp · ln(base)) and snaps the result to the nearest integer if it falls within 1 × 10⁻⁴ (threshold 429,497 in Q31.32) to catch cases like 27^(1/3).

The `nthroot(x, n)` function has a separate dedicated path for integer n ≥ 2: Newton iteration with 12 iterations using the formula xₖ₊₁ = ((n−1)·xₖ + x/xₖⁿ⁻¹)/n. Even roots of negative x return `None`. Negative n is handled as 1/nthroot(x, −n). Non-integer n falls through to exp(ln(x)/n).

Hyperbolic functions: sinh(x) = (eˣ − e⁻ˣ)/2, cosh(x) = (eˣ + e⁻ˣ)/2, tanh(x) saturates to ±1 for |x| ≥ 12.

## Complex Arithmetic — `complex.rs`

The `Complex(i64, i64)` type mirrors the real Q31.32 contract. Addition and subtraction use saturating arithmetic. Multiplication and division compute i128 intermediates before scaling back to Q31.32. No real-only fast paths exist in mul/div — the generic implementation covers all cases.

All transcendental functions use analytic continuations:
- sin(z) = sin(re)·cosh(im) + i·cos(re)·sinh(im)
- cos(z) = cos(re)·cosh(im) − i·sin(re)·sinh(im)
- asin(z) = −i·ln(i·z + √(1−z²))
- acos(z) = −i·ln(z + i·√(1−z²))
- atan(z) = (i/2)·ln((i+z)/(i−z))
- sqrt(z): real non-negative → fp::sqrt; real negative → i·√|re|; complex → via √((|z|+re)/2)
- integer_pow: binary exponentiation, negative via 1/z⁻ᵉˣᵖ

## Lexer — `lexer.rs`

The lexer tokenises expressions via `parse_identifier()`, which returns direct function tokens (`Token::FuncSin`, `Token::FuncBinomP`, etc.) — the parser does NOT reassemble identifiers from raw characters. Identifiers are case-sensitive: all function names and constants (`sin`, `pi`, `e`, `ans`) are lowercase; single uppercase letters A–Z are variable registers.

Unary minus detection checks whether the previous token is an operator, opening parenthesis, comma, or the start of expression. Numbers are parsed as integer plus optional fractional part, converted to Q31.32 via i128 arithmetic. The `i` suffix for the imaginary unit is emitted as `Token::ConstI` in Advanced mode only.

## Parser — `parser.rs`

The parser uses recursive descent following PEMDAS precedence: expression (add/sub) → term (mul/div/mod) → power (right-associative ^) → unary (−) → primary. Implicit multiplication is detected when `is_primary_start()` returns true for the next token after a primary expression (e.g., `3(5)`, `(a)b`, `2sin(x)`).

The AST is a flat arena: `[AstNode; 64]` allocated in `.bss`, never heap-allocated. Child references are array indices. AstNode variants: `Literal`, `Constant`, `Variable`, `BinaryOperation`, `UnaryNegation`, `FunctionCall`, `ThreeArgFunction`, `TwoArgFunction`, `Store`, `LoopAggregate`.

## Evaluator — `evaluator.rs`

The recursive `evaluate_node` dispatches on the AstNode variant. For real-argument sin/cos/tan/asin/acos/atan, the evaluator applies deg↔rad conversion via `degrees_to_radians` or `radians_to_degrees` when `AngleMode` is `Degrees`. Complex-argument and hyperbolic functions always use radians.

- `sum(body, var, a, b)`: iterates k from a to b, writes k as a Q31.32 integer into the loop-variable register, evaluates the body, and accumulates the sum.
- `int(body, var, a, b)`: Simpson's rule with 100 intervals. h = (b−a)/100. Sum = f(a) + f(b) + 4·Σf(odd) + 2·Σf(even). Result = h · sum / 3. Snaps to integer if within threshold.
- `sto(value, var)`: writes value to the register identified by var, returns the value.

Loop variables use closure-wrap save/restore — one `Complex` (16 bytes) is saved on the stack before the loop and restored after, rather than cloning the entire `VariableStore` (448 bytes).

## Function Reference

All function names in the expression language are lowercase. The actual tokens emitted by the lexer match these names exactly.

| Expression | What it does |
|---|---|
| `sin(x)` | Sine of x (radians or degrees) |
| `cos(x)` | Cosine of x |
| `tan(x)` | Tangent of x (returns None near ±π/2) |
| `asin(x)` | Inverse sine, result in current angle mode |
| `acos(x)` | Inverse cosine, result in current angle mode |
| `atan(x)` | Inverse tangent, result in current angle mode |
| `sinh(x)` | Hyperbolic sine (always radians) |
| `cosh(x)` | Hyperbolic cosine (always radians) |
| `tanh(x)` | Hyperbolic tangent (always radians) |
| `asinh(x)` | Inverse hyperbolic sine |
| `acosh(x)` | Inverse hyperbolic cosine (domain: x ≥ 1) |
| `atanh(x)` | Inverse hyperbolic tangent (domain: \|x\| < 1) |
| `sqrt(x)` | Square root |
| `abs(x)` | Absolute value |
| `exp(x)` | eˣ |
| `ln(x)` | Natural log (x > 0) |
| `log(x)` | Base-10 log (x > 0) |
| `log2(x)` | Base-2 log (x > 0) |
| `floor(x)` | Round toward −∞ |
| `ceil(x)` | Round toward +∞ |
| `round(x)` | Round to nearest (half away from zero) |
| `deg(x)` | Convert degrees → radians (input is degrees, output is radians) |
| `rad(x)` | Convert radians → degrees (input is radians, output is degrees) |
| `nthroot(x,n)` | n-th root of x |
| `lngamma(x)` | Natural log of Γ(x) (x > 0) |
| `binomp(n,k,p)` | Binomial PMF: P(X=k), X~Binomial(n,p) |
| `poissonp(λ,k)` | Poisson PMF: P(X=k), X~Poisson(λ) |
| `chicdf(x,k)` | Chi-squared CDF: P(X≤x), X~χ²(k) |
| `sum(body,var,a,b)` | Σ: sum body over [a, b] |
| `int(body,var,a,b)` | ∫: Simpson's rule over [a, b] |
| `sto(v,reg)` | Store v into register reg |
| `Ans` | Last computed answer |
| `A`–`Z` | User registers (26 registers) |
| `pi` | π constant |
| `e` | Euler's number |

## Deg / Rad Mode

The evaluator automatically applies angle-mode conversion for real-argument sin, cos, tan, asin, acos, and atan. When `AngleMode` is `Degrees`, sin/cos/tan convert the input from degrees to radians before calling the CORDIC routines, and asin/acos/atan convert the radian result back to degrees afterward. Hyperbolic functions and complex-argument trigonometric functions ignore angle mode entirely and always operate in radians.

The `deg(x)` function explicitly converts a value from degrees to radians (multiplies by π/180, or 74,961,321 in Q31.32). The `rad(x)` function converts from radians to degrees (multiplies by 180/π, or 246,083,499,208 in Q31.32).

## Key Design Decisions

**CORDIC over LUT**: The CORDIC arctan table consumes only 192 bytes of storage, whereas a full kilobyte-scale LUT would be needed to cover all transcendental functions at comparable precision. Twenty-four iterations converge to full Q31.32 precision and complete in interactive time on a 12 MHz Cortex-M3.

**Taylor over CORDIC for exp/ln**: CORDIC can compute exp and ln via hyperbolic modes, but Taylor series give predictable iteration counts independent of input value. Twelve terms for exp and 20 terms for ln are sufficient for Q31.32 precision, and the implementation is simpler than the mixed-mode state machine that CORDIC would require.

**Log-space probability**: Computing C(1000, 500) directly overflows Q31.32, but ln(C(1000, 500)) fits easily. Every binomial and Poisson PMF accumulates in the log domain and exponentiates only at the final step.

**Hybrid ln_factorial**: A 21-entry lookup table (168 bytes) covers k = 0..20 with zero computation. A 5-term Stirling approximation handles k ≥ 21 with less than 1 × 10⁻⁸ relative error. This eliminates Lanczos for the most common path.

**Flat arena AST**: The `[AstNode; 64]` arena occupies 3,088 bytes in `.bss`, never allocates, uses index-based child references instead of pointers, and provides bounded worst-case parse time — the parser simply rejects expressions exceeding 64 nodes.

**Closure-wrap over VariableStore clone**: Saving one `Complex` (16 bytes) for loop variable shadowing avoids cloning the entire `VariableStore` (448 bytes) on each loop invocation.

**No real fast-paths in complex mul/div**: Skipping specialised real-only branches in complex multiplication and division saves 864–928 bytes of Flash, at the cost of approximately 100 bytes of extra stack usage — an acceptable trade-off on a device with generous RAM but constrained program memory.
