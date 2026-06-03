---
sidebar_position: 4
description: Memory map, boot sequence, HAL modules, MMIO safety, porting checklist
---

# Boot & HAL

## Memory Map

```
Flash (0x0000_0000, 64 KB):
  [0x0000_0000 - 0x0000_003F]  .vector_table    (64 bytes)
  [0x0000_0040 - 0x0000_EAF8]  .text + .rodata  (60,261 bytes)
  [0x0000_EAF8 - 0x0000_F364]  .data (LMA copy) (2,768 bytes)
  Remaining: ~2.5 KB free

RAM (0x2000_0000, 8 KB):
  [0x2000_0000 - 0x2000_0ACE]  .data + .bss     (2,776 bytes)
  [0x2000_0ACE - 0x2000_1A00]  Unallocated gap  (3,880 bytes)
  [0x2000_1A00 - 0x2000_2000]  .stack           (1,536 bytes, grows down)
  [0x2000_2000]                 Top of SRAM     (initial SP)
```

Stack reserved: 1,536 B (1.5 KB). Stack grows downward from `0x2000_2000`.

## Boot Sequence (Layer 3)

The reset handler in `boot.rs` performs three steps: zero `.bss` via
`ptr::write_bytes`, copy `.data` from Flash LMA to RAM VMA via
`ptr::copy_nonoverlapping` (zero bytes in the current build — no
initialised data section), then jump to `crate::start()`.

The vector table occupies 64 bytes at Flash base — initial stack pointer,
Reset vector, and 14 exception handlers. Any unhandled exception spins in
`DefaultHandler`. There is no bootloader; firmware is loaded one-shot through
JTAG/SWD only. The linker script (`link.x`) defines `FLASH (0x0, 64K)`,
`RAM (0x20000000, 8K)`, and `_stack_size = 3K`.

## HAL Layer (Layer 4)

The HAL is the only crate permitted to touch hardware registers. All `unsafe`
MMIO is confined to `mmio.rs`, which exposes `read_register`, `write_register`,
and `set_register_bits` — thin wrappers around volatile pointer reads and writes.

| Module | Registers / Base | Protocol | Pins |
|--------|-----------------|----------|------|
| uart.rs | UART0 (0x4000_C000) | 8N1, 115200 baud, polling TX/RX | PA0=RX, PA1=TX |
| i2c.rs | I2C0 (0x4002_0000) | Master, 100 kHz, `send_byte`/`send_bytes` | PB2=SCL, PB3=SDA |
| gpio.rs | 6 ports (A-F) | AFSEL, DIR, DEN, ODR registers | Alt func config |
| clock.rs | RCC registers | 12 MHz internal oscillator (QEMU), RCGC gating | — |
| oled.rs | SSD0303 (0x3D) | I2C, 5-command init, render, clear, `set_pixel` | I2C0 |

**uart.rs** implements the `numcore::hal::Uart` trait (`putchar`, `getchar`,
`poll_byte`, `transmit_bytes`) by polling the FIFO status registers. Baud rate:
divisor = 12 MHz / (16 $\times$ 115200) $\approx$ 6.51; IBRD = 6, FBRD = 33.

**i2c.rs** provides master-mode sends to the OLED, handling START/ACK/STOP
protocol in software. Timer period: TPR = (12 MHz / (20 $\times$ 100 kHz)) $-$ 1 = 5.

**gpio.rs** holds port base addresses and configures alternate functions,
direction, digital enable, and open-drain mode.

**clock.rs** runs at 12 MHz (internal oscillator; no PLL configured). Gates
peripheral clocks via the RCGC registers and provides a spin-loop `delay`.

**oled.rs** drives an SSD0303 display at address 0x3D over I2C: sends the
5-command init sequence (DISPLAY_OFF, START_LINE_0, SEG_REMAP_NORMAL,
NORMAL_DISPLAY, DISPLAY_ON), uploads a 192-byte framebuffer on `render`,
blanks the screen on `clear`, and sets individual pixels. The visible column
offset is 36 (accounting for the SSD0303 controller RAM layout).

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
