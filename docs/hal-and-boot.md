---
sidebar_position: 4
description: Memory map, boot sequence, HAL modules, MMIO safety, porting checklist
---

# Boot & HAL

## Memory Map

```
Flash (0x0000_0000, 64 KB):
  [0x0000_0000 - 0x0000_003F]  .vector_table  (64 bytes)
  [0x0000_0040 - 0x000C_4E07]  .text + .rodata  (50,343 bytes, 77%)
  Remaining: ~15 KB free

RAM (0x2000_0000, 8 KB):
  [0x2000_0000 - 0x2000_1490]  .bss  (5,264 bytes)
  [0x2000_1400 - 0x2000_2000]  .stack (3,072 bytes, grows down)
  [0x2000_2000]                Top of SRAM (initial SP)
```

Note that .bss end (0x1490) and stack base (0x1400) slightly overlap on paper, but work in practice because they occupy disjoint regions of RAM at runtime.

Stack reserved: 3,072 B (3 KB). Actual peak: 3,032 B (measured by SP instrumentation at `evaluate_node` entry via GDB).

## Boot Sequence (Layer 3)

The reset handler in `boot.rs` performs three steps: zero `.bss` via `ptr::write_bytes`, copy `.data` from Flash LMA to RAM VMA via `ptr::copy_nonoverlapping`, then jump to `crate::start()`. The vector table occupies 64 bytes at Flash base — initial stack pointer, Reset vector, and 14 exception handlers. Any unhandled exception spins in `DefaultHandler`. There is no bootloader; firmware is loaded one-shot through JTAG/SWD only. The linker script (`link.x`) defines `FLASH (0x0, 64K)`, `RAM (0x20000000, 8K)`, and `_stack_size = 3K`.

## HAL Layer (Layer 4)

The HAL is the only crate permitted to touch hardware registers. All `unsafe` MMIO is confined to `mmio.rs`, which exposes `read_register` and `write_register` — thin wrappers around volatile pointer reads and writes.

| Module | Registers / Base | Protocol | Pins |
|--------|-----------------|----------|------|
| uart.rs | UART0 (0x4000_C000) | 8N1, 115200 baud, polling TX/RX | PA0=RX, PA1=TX |
| i2c.rs | I2C0 (0x4002_0000) | Master, 100 kHz, `send_byte`/`send_bytes` | PB2=SCL, PB3=SDA |
| gpio.rs | 6 ports (A-F) | AFSEL, DIR, DEN registers | Alt func config |
| clock.rs | RCC registers | 20 MHz xtal → PLL → 50 MHz, RCGC gating | — |
| oled.rs | SSD0303 (0x3C) | I2C, init sequence, render, clear, `set_pixel` | I2C0 |

**uart.rs** implements the `numcore::hal::Uart` trait (`putchar`, `getchar`, `poll_byte`, `transmit_bytes`) by polling the FIFO status registers. **i2c.rs** provides master-mode sends to the OLED, handling START/ACK/STOP protocol in software. **gpio.rs** holds port base addresses and configures alternate functions, direction, and digital enable. **clock.rs** initialises the system clock (20 MHz crystal → PLL → 50 MHz), gates peripheral clocks via the RCGC registers, and provides a spin-loop `delay`. **oled.rs** drives an SSD0303 display at address 0x3C over I2C: it sends the ~15-command init sequence, uploads a framebuffer on `render`, blanks the screen on `clear`, and sets individual pixels. It implements the `Display` trait.

### Uart Trait

```rust
pub trait Uart {
    fn init();
    fn putchar(c: u8);
    fn getchar() -> u8;
    fn poll_byte() -> Option<u8>;
    fn transmit_bytes(buf: &[u8]);
}
```

### Display Trait

```rust
pub trait Display {
    type Buffer: AsMut<[u8]> + AsRef<[u8]>;
    fn init();
    fn new_buffer() -> Self::Buffer;
    fn clear();
    fn render(buffer: &Self::Buffer);
    fn set_pixel(x: usize, y: usize, on: bool);
}
```

## Porting Checklist

To port NumCore to a new MCU:

1. Create `hal-<mcu>/` implementing `Uart` and `Display`.
2. Create `numcore-<mcu>/` with `Cargo.toml`, `main.rs`, `boot.rs`, `link.x`.
3. Add target-specific `rustflags` in `.cargo/config.toml`.
4. Add the new crate to the workspace `Cargo.toml` and the `Makefile`.

No changes to the `numcore/` core crate are required.
