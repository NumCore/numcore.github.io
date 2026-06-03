---
sidebar_position: 5
description: Event loop, CalcState, event dispatch, display pipeline
---

# Runtime & UI

## Runtime Overview

The runtime is the firmware control centre. It is generic over
`<U: Uart, D: Display>` and contains zero unsafe code. It lives in
`numcore/src/runtime/` across three files — `mod.rs` (event loop and
handlers), `state.rs` (CalcState), and `event.rs` (event translation).

The single unsafe block in the runtime is in `handle_expression_submission`,
which uses raw pointer reborrowing (`as *mut _`) to simultaneously access
different fields of CalcState. This is safe because each pointer targets a
distinct struct field — the borrow checker cannot prove this statically with
a single `&mut CalcState`, but the aliasing is benign.

## CalcState (state.rs)

`CalcState` is the single source of all mutable state, held as a `static mut`
in `.data`. Its fields are:

| Field | Type | Purpose |
|-------|------|---------|
| `input_buffer` | `[u8; 64]` | Expression being composed |
| `input_length` | `usize` | Valid byte count in input buffer |
| `cursor_position` | `usize` | Insertion point (0..=input_length) |
| `last_result` | `[u8; 48]` | Last formatted answer for scrolling |
| `last_result_len` | `usize` | Valid byte count in result |
| `result_scroll_offset` | `usize` | Horizontal scroll offset for result |
| `matrix_scroll_offset` | `usize` | Vertical scroll for matrix viewport |
| `matrix_col_offset` | `usize` | Horizontal scroll for matrix viewport |
| `variables` | `VariableStore` | Ans + 26 scalar registers + 3 matrix registers |
| `active_mode` | `CalculatorMode` | Standard, Advanced, Matrix, or Scientific |
| `angle_mode` | `AngleMode` | Radians or Degrees |
| `lex_scratch` | `LexResult` | Reusable lexer output (avoids stack alloc) |
| `parse_scratch` | `Bytecode` | Reusable bytecode buffer (avoids stack alloc) |
| `expr_scratch` | `[u8; 64]` | Scratch copy of expression for submission |

**Input buffer operations** — `append_character_to_input` shifts bytes right
from cursor and inserts; `remove_last_input_character` shifts bytes left from
before cursor; `clear_input` zeroes the buffer and resets length and cursor.
Cursor movement is bounded by 0 and `input_length`.

**Result and matrix scrolling** — Results longer than 15 characters use
horizontal scroll via `scroll_result_left`/`scroll_result_right`. Matrix
results use both vertical scroll (row-by-row via up/down arrows) and
horizontal scroll (character-by-character via left/right arrows).

## Four-Mode Cycle

The calculator cycles through four modes via the Escape key:

```
Standard → Advanced → Matrix → Scientific → Standard
```

| Mode | Scope | Features |
|------|-------|----------|
| Standard | Real arithmetic + transcendentals | All functions, scalar results only |
| Advanced | Standard + complex | Imaginary unit `i`, complex arithmetic |
| Matrix | Standard + matrix ops | Matrix literals `[(a,b)(c,d)]`, 4×4 limit |
| Scientific | Standard + E-notation | `1.5E+10` literal syntax, exponent arithmetic |

The `!mode` command (available in debug builds) switches modes by name:
`!mode Standard`, `!mode Advanced`, `!mode Matrix`, `!mode Scientific`.

## Event Loop (mod.rs)

The startup sequence is: initialise UART → initialise I2C (via `D::init()`)
→ initialise OLED → print welcome banner → enter event loop.

The event dispatch table is:

| Input | Event | Action |
|-------|-------|--------|
| Printable ASCII (0x20–0x7E) | `DigitOrOperator` | Append character to input buffer |
| Enter (0x0A / 0x0D) | `Submit` | Evaluate expression, store result, display |
| Backspace (0x7F / 0x08) | `Backspace` | Remove character before cursor |
| Escape (0x1B) | `ToggleMode` | Cycle Standard → Advanced → Matrix → Scientific |
| Ctrl+D (0x04) | `ToggleAngleMode` | Radians ↔ Degrees |
| Arrow keys | `CursorLeft`/`CursorRight`/`CursorUp`/`CursorDown` | Move cursor, scroll result, or scroll matrix |

ANSI escape sequence parsing uses a 3-state machine
(`None` → `PendingEscape` → `PendingBracket`) with a 3-byte buffer. A
standalone `0x1B` fires `ToggleMode` after 2 consecutive idle poll cycles.
Arrow keys send `0x1B [ D` (left) or `0x1B [ C` (right).

## Expression Submission

`handle_expression_submission` copies `input_buffer` into `expr_scratch`,
then calls `engine::evaluate_expression`. The engine returns one of three
`EvalResult` variants:

- **`Matrix`** — a normal result. Single-path dispatch based on `mat.kind`:
  - `Scalar`: formatted as a plain decimal number (e.g. `42`, `3.141593`)
  - `Complex`: formatted as `a+bi` in Advanced mode
  - `Scientific`: formatted as `1.5E+10`; if `|exponent| > 99`, displays
    `! overflow`
  - `Mat`: formatted with brackets for the UART output (`[ 1 2; 3 4 ]`);
    displayed on the OLED via the matrix viewport with box-drawing glyphs
- **`Overflow`** — the result exceeds Q31.32 range. `format_overflow`
  renders it as scientific notation (e.g. `1.34406E+43`).
- **`DomainError`** — an invalid input (e.g. `sqrt(-1)` in Standard mode).
  The runtime prints `! error`.

The input buffer is cleared and the OLED is refreshed after every submission.

## UI Layer

The UI layer is generic over `<D: Display>` and contains zero unsafe code.
It lives in `numcore/src/ui/` across four files: `mod.rs` (module
declarations), `font.rs` (bitmap font), `formula.rs` (screen layout), and
`matrix_display.rs` (matrix viewport).

### Font (font.rs)

A 5×7 monospace bitmap font, 95 glyphs, 475 bytes in Flash. Advance width:
6 pixels (5 glyph + 1 gap), giving 16 characters per 96-pixel line.

### Display Layout

The 96×16 OLED is organised as two 8-pixel-tall pages:

- **Page 0** — expression line with cursor (inverted character)
- **Page 1** — result line prefixed with `=`, or matrix viewport

Custom glyphs replace ASCII: `*` → ×, `/` → ÷, `-` → −, `pi` digraph → π.
Integral and summation symbols span both pages in tall-glyph mode.

### Matrix Display (matrix_display.rs)

A virtual character buffer `DisplayGrid` (5 rows × 80 columns, 402 B on the
C stack) pre-formats the entire matrix at result time. A 14-character viewport
is blitted to the display with box-drawing glyphs for brackets. Arrow keys
scroll the viewport (character-by-character horizontally, row-by-row
vertically). Column 15 shows scroll-direction indicators when content exceeds
the viewport.
