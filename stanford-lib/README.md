# Stanford C++ Library (CS 106B) — Nova Build

This directory contains the Stanford CS 106B C++ library, modified for compilation to WebAssembly (WASM) targeting WASI preview1.

## What's Here

- **`stanford_lib.cpp`** — All `.cpp` implementations merged into a single translation unit for precompilation as a single `.o` file.
- **`*.h`** — Header files for Stanford ADTs (`Vector`, `Grid`, `Map`, `Set`, `Stack`, `Queue`, etc.) and utilities (`strlib`, `random`, `simpio`, etc.).

## Modifications for Nova

The original Stanford library was modified for the WASM/WASI target:

- **`error()`** calls `std::abort()` instead of throwing (compiled with `-fno-exceptions`)
- **Random functions** use `__nova_random_u32()`, a custom WASM import backed by `crypto.getRandomValues()` on the JS side. The standard `rand()`/`srand()` are broken in WASM because `time(nullptr)` returns 0.
- Removed Qt/GUI dependencies (`gtypes.h` → inline `GPoint` struct)
- Removed `tokenscanner.h` dependency from `direction.cpp`
- Removed `filelib.h` dependency from `simpio.cpp`
- Removed `sys/time.h` from `timer.cpp` (uses `<chrono>` instead)

## How It Gets Into the App

1. These files live in the `stanford/` subdirectory inside `public/sysroot.zip`
2. At app startup, `sysroot-loader.ts` fetches and extracts the zip into a virtual filesystem
3. The compiler worker precompiles `stanford_lib.cpp` into `stanford_lib.o` during sysroot seeding
4. The `.o` is linked into every user program

## Rebuilding After Changes

After editing any files in this directory, run the build script to update `public/sysroot.zip`:

```bash
./stanford-lib/build-sysroot.sh
```

Then hard-refresh the browser to re-fetch the updated zip.
