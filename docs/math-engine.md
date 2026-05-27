---
sidebar_position: 3
description: Q31.32 contract, pipeline, design decisions, function reference
---

# Math Engine

## Pipeline

The evaluation pipeline moves through five stages, converting user input into a computed result. Raw expression bytes enter the lexer, which produces a token stream via `lexer::tokenise_expression`. That stream feeds into the parser, which runs `parser::parse_token_stream` to build a flat-arena AST. The evaluator walks that tree in `evaluator::evaluate_tree`, dispatching to the appropriate arithmetic or transcendental routine. Finally, `engine::format_result` renders the numeric outcome as a display string. The entire pipeline enforces two hard bounds: a maximum of 32 tokens from the lexer, and a maximum of 64 AST nodes from the parser. The public API exposed to callers consists of exactly two entry points: `evaluate_expression()` and `format_result()`.

## Q31.32 Contract

All numeric values are stored as signed 64-bit integers under the Q31.32 fixed-point convention, with the binary point positioned between bits 31 and 32. The constant `FIXED_ONE` equals `1 << 32`, giving a precision of roughly 2.3 × 10⁻¹⁰, or approximately nine decimal digits. Every intermediate multiplication across the codebase promotes to 128-bit arithmetic (`i128`) to guard against overflow before scaling back down to Q31.32. Addition and subtraction use saturating semantics, clamping to `i64::MIN` or `i64::MAX` on overflow. Division by zero and any operation that produces a non-real result return `None` rather than panicking. The error model is `Option<T>` throughout — `None` signals a domain error, and every caller propagates it with the `?` operator, so a single invalid input (e.g. `sqrt(-1)` in real mode) collapses the entire computation to `None`. Display formatting rounds to six decimal places, strips trailing zeros, and suppresses the minus sign when a negative value rounds to zero, avoiding `-0.000000` output.

## Module Map

`fixed_point.rs` (974 lines) is the numeric engine. It provides Q31.32 multiplication and division, a full CORDIC implementation (24 iterations, powered by a 192-byte arctan lookup table), Taylor-series exponential (12 terms with range reduction via factor-of-2⁵ scaling), Taylor-series natural log (20 terms with mantissa-based range reduction), Newton-Raphson square root (10 iterations), atan2, hyperbolic sine and cosine via the exponential function, and nthroot via the identity exp(ln(a) / n). It also owns the display-formatting routine that rounds to six decimal places.

`complex.rs` (313 lines) wraps `Complex(i64, i64)` and mirrors the real fixed-point contract in the complex plane: saturating addition and subtraction, `i128`-mediated multiplication and division, and every transcendental function implemented via analytic continuations — complex log serves as the substrate for inverse trig functions, and the sinh/cosh decomposition of complex sinusoids drives trigonometric evaluation.

`lexer.rs` (363 lines) defines the `Token` enum and the tokenisation pass. It enforces case-sensitive identifiers, detects unary minus by peeking at the preceding token, and enforces the `MAX_TOKEN_COUNT = 32` cap so the parser never exceeds its bounded arena.

`parser.rs` implements a recursive-descent parser that respects PEMDAS precedence, treats exponentiation as right-associative, supports implicit multiplication (e.g. `2pi`), and reassembles multi-character identifiers into function names. The AST lives in a flat array `[AstNode; 64]` allocated in `.bss`, with index-based child references; the parser rejects any expression that exceeds this bound.

`evaluator.rs` (386 lines) provides the recursive AST walker that dispatches every node to the correct `fixed_point` or `complex` routine. It handles angle-mode conversion for real-argument trigonometric functions, evaluates loop constructs (`sum`, `int`) by aggregating over the specified range — Simpson's rule with 100 intervals for integration — and uses closure-wrap save/restore for loop variable management, costing only 16 bytes of stack overhead per loop invocation instead of cloning the full variable store.

`engine.rs` (108 lines) is the public face of the crate. It exposes `evaluate_expression()` and `format_result()`, and handles the `a+bi` display convention for complex results.

`vars.rs` (92 lines) implements `VariableStore` with an `Ans` guard that prevents the user from overwriting the implicit last-result register. It provides 26 named registers `A`–`Z` and derives `Clone + Copy` so that loop variable shadows can be saved and restored as cheap stack-local values.

`distributions.rs` provides the statistical backend. The log-gamma function uses a 6-term Lanczos approximation with a relative error below 2 × 10⁻¹⁰. The log-factorial function is hybrid: a 21-entry lookup table (indices 0–20, costing 168 bytes) plus a 5-term Stirling approximation for arguments greater than 21, yielding less than 1 × 10⁻⁸ relative error. Binomial and Poisson probability mass functions operate entirely in log-space to avoid overflow. The chi-squared CDF is computed via the regularised lower incomplete gamma series, summing up to 60 terms.

## Supported Functions

| Category | Functions |
|----------|-----------|
| Arithmetic | `+ - * / ^ %` |
| Trigonometric | `sin cos tan asin acos atan` |
| Hyperbolic | `sinh cosh tanh asinh acosh atanh` |
| Other | `sqrt abs exp ln log log2 deg rad nthroot lngamma` |
| Distributions | `binomialprob poissonprob chisqcdf` |
| Loops | `sum int` |
| Storage | `sto` |
| Constants | `pi e` |
| Variables | `Ans A-Z` |

## Degrees Mode

Real-argument sine, cosine, and tangent convert degrees to radians before computation, and the inverse functions (asin, acos, atan) convert their radian results back to degrees — but only when `AngleMode` is set to degrees. Complex-argument trigonometric functions and all hyperbolic functions ignore `AngleMode` entirely and always operate in radians. The mode is toggled at runtime by sending byte `0x04` (Ctrl+D) to the input handler.

## Key Design Decisions

CORDIC was chosen over precomputed lookup tables because its arctan table consumes only 192 bytes of Flash, whereas a kilobyte-scale LUT would have been needed to cover all transcendental functions. Twenty-four iterations produce results acceptable for interactive use with a single-cycle multiply-accumulate peripheral.

Taylor series won out over CORDIC for exp and ln because the iteration count is predictable and independent of the input value, and the accuracy at 12–20 terms is comparable to CORDIC without needing rotation-mode state machine complexity.

Log-space probability computation avoids catastrophic overflow for large arguments: `C(1000, 500)` exceeds the representable range of any Q31.32 value, but its logarithm fits comfortably. Every binomial and Poisson PMF is accumulated in the log domain and exponentiated only at the final step.

The hybrid ln_factorial strategy balances code size and accuracy: a 21-entry table (168 bytes) covers the common small-integer case with zero computation, and the 5-term Stirling approximation handles the tail with less than 1 × 10⁻⁸ relative error, avoiding a large precomputed table.

The flat-arena AST occupies 3,088 bytes in `.bss`, is never heap-allocated, uses index-based child references instead of pointers, and guarantees bounded worst-case parse time — the parser simply rejects expressions that would exceed 64 nodes.

Closure-wrap save/restore for loop variables costs only 16 bytes of stack per loop invocation. The alternative — cloning the entire `VariableStore` on each iteration — would consume 440 bytes and defeat the purpose of a fixed-stack embedded runtime.

Complex multiplication and division deliberately avoid real-argument fast paths. The generic implementation adds roughly 864–928 bytes less Flash consumption compared to a specialised path, at the cost of only about 100 extra bytes of stack, which was deemed an acceptable trade-off for a device with generous RAM but constrained program memory.
