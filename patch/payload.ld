ENTRY(mt_report)
SECTIONS {
 . = PAYLOAD_ADDRESS;
 payload_anchor = .;
 .text : { *(.text .text.*) }
 .rodata : { *(.rodata .rodata.*) }
 .data : { *(.data .data.*) }
 .bss : { *(.bss .bss.* COMMON) }
 /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame*) }
}
