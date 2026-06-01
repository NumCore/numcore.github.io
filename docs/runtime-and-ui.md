---
sidebar_position: 5
description: Event loop, CalcState, event dispatch, display pipeline
---

# Runtime & UI

## Runtime Overview

The runtime is the firmware control centre. It is generic over `<U: Uart, D: Display>` and contains zero unsafe code. It lives in `numcore/src/runtime/` across three files — `mod.rs` (event loop and handlers), `state.rs` (CalcState), and `event.rs` (event translation).

The single unsafe block in the runtime is in `handle_expression_submission`, which uses raw pointer reborrowing (`as *mut _`) to simultaneously access different fields of CalcState. This is safe because each pointer targets a distinct struct field — the borrow checker cannot prove this statically with a single `&mut CalcState`, but the aliasing is benign.

## CalcState (state.rs)

`CalcState` is the single source of all mutable state, held as a `static mut` in `.bss`. Its fields are:

| Field | Type | Purpose |
|-------|------|---------|
| `input_buffer` | `[u8; 64]` | Expression being composed |
| `input_length` | `usize` | Valid byte count in input buffer |
| `cursor_position` | `usize` | Insertion point (0..=input_length) |
| `last_result` | `[u8; 48]` | Last formatted answer for scrolling |
| `last_result_len` | `usize` | Valid byte count in result |
| `result_scroll_offset` | `usize` | Horizontal scroll offset for result |
| `variables` | `VariableStore` | Ans + 26 registers A-Z |
| `active_mode` | `CalculatorMode` | Standard or Advanced |
| `angle_mode` | `AngleMode` | Radians or Degrees |
| `lex_scratch` | `LexResult` | Reusable lexer output (avoids stack alloc) |
| `parse_scratch` | `ParseTree` | Reusable AST arena (avoids stack alloc) |
| `expr_scratch` | `[u8; 64]` | Scratch copy of expression for submission |

**Input buffer operations** — `append_character_to_input` shifts bytes right from cursor and inserts; `remove_last_input_character` shifts bytes left from before cursor; `clear_input` zeroes the buffer and resets length and cursor. Cursor movement is bounded by 0 and `input_length`.

**Result scrolling** — `scroll_result_left` and `scroll_result_right` adjust `result_scroll_offset` within the range $0..\max(0, \text{last\_result\_len} - 13)$. The display shows 13 visible characters plus a scroll indicator arrow at column 14 when the result overflows 15 characters.

## Event Loop (mod.rs)

The startup sequence is: initialise UART $\to$ initialise I2C (via `D::init()`) $\to$ initialise OLED $\to$ print welcome banner $\to$ enter event loop.

The event dispatch table is:

| Input | Event | Action |
|-------|-------|--------|
| Printable ASCII (0x20–0x7E) | `DigitOrOperator` | Append character to input buffer |
| Enter (0x0A / 0x0D) | `Submit` | Evaluate expression, store result, display |
| Backspace (0x7F / 0x08) | `Backspace` | Remove character before cursor |
| Escape (0x1B) | `ToggleMode` | Standard $\leftrightarrow$ Advanced |
| Ctrl+D (0x04) | `ToggleAngleMode` | Radians $\leftrightarrow$ Degrees |
| Arrow keys | `CursorLeft` / `CursorRight` | Move cursor or scroll result |

ANSI escape sequence parsing uses a 3-state machine (`None` $\to$ `PendingEscape` $\to$ `PendingBracket`) with a 3-byte buffer. A standalone `0x1B` fires `ToggleMode` after 2 consecutive idle poll cycles, giving a second byte (like `[`) time to arrive. Arrow keys send `0x1B [ D` (left) or `0x1B [ C` (right).

## Expression Submission

`handle_expression_submission` copies `input_buffer` into `expr_scratch`, then calls `engine::evaluate_expression` with raw pointers to `variables`, `lex_scratch`, and `parse_scratch`. If evaluation returns `Some(result)`, the answer is stored via `record_answer` and formatted through `engine::format_result` for display. On `None`, the runtime prints `! error`. The input buffer is cleared and the OLED is refreshed with the result.

## UI Layer

The UI layer is generic over `<D: Display>` and contains zero unsafe code. It lives in `numcore/src/ui/` across three files: `mod.rs` (module declarations), `font.rs` (bitmap font), and `formula.rs` (screen layout and rendering).

### Font (font.rs)

A 5$\times$7 monospace bitmap font stored as one byte per row (5 bits used per byte). The table holds 95 glyphs covering ASCII 0x20 (space) through 0x7E (tilde), each glyph stored as 7 bytes for a total of 665 bytes in `.rodata`. Characters outside this range render as a solid 5$\times$7 replacement block. The effective advance width is 6 pixels per character (5 glyph columns + 1 pixel gap), giving 16 characters per 96-pixel line.

### Display Layout

The 96$\times$16 OLED is organised as two 8-pixel-tall pages:

- **Page 0** — expression line with cursor (inverted character at cursor position)
- **Page 1** — result line, prefixed with `=`, supporting horizontal scroll when the rendered result exceeds 15 characters

A scroll indicator arrow (left or right) is shown at column 14 when the result overflows. Aggregate expressions (`sum(...)`, `int(...)`) use a special two-line layout with a tall glyph (integral or sigma symbol) spanning both pages, upper/lower bounds on separate pages, and the body to the right.

### Custom Glyphs

Sentinel bytes replace standard ASCII with mathematical symbols:

| Sentinel | Glyph | Meaning |
|----------|-------|---------|
| `0x01` | $\to$ | Right scroll arrow |
| `0x02` | $\gets$ | Left scroll arrow |
| `*` | $\times$ | Multiplication |
| `/` | $\div$ | Division |
| `-` | $-$ | Minus |
| `pi` digraph | $\pi$ | Pi constant |

### Rendering Pipeline

`formula::render_screen` draws the current `CalcState` into a display framebuffer allocated via `D::new_buffer()`. It clears the buffer, renders the expression line with cursor inversion, optionally renders the result line, then calls `D::render(&framebuffer)` to upload to the SSD0303 GDDRAM via I2C.
