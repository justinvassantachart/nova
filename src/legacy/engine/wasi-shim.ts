// ── WASI Shim ─────────────────────────────────────────────────────
// Minimal WASI preview1 implementation for stdout/stderr → postMessage

export interface WasiShimOptions {
    memory: WebAssembly.Memory;
    onStdout: (text: string) => void;
    onExit: (code: number) => void;
}

export function createWasiShim({ memory, onStdout, onExit }: WasiShimOptions) {
    const decoder = new TextDecoder();

    return {
        // ── args_get ──
        args_get: () => 0,
        args_sizes_get: (argc_ptr: number, argv_buf_size_ptr: number) => {
            const view = new DataView(memory.buffer);
            view.setUint32(argc_ptr, 0, true);
            view.setUint32(argv_buf_size_ptr, 0, true);
            return 0;
        },

        // ── environ_get ──
        environ_get: () => 0,
        environ_sizes_get: (count_ptr: number, size_ptr: number) => {
            const view = new DataView(memory.buffer);
            view.setUint32(count_ptr, 0, true);
            view.setUint32(size_ptr, 0, true);
            return 0;
        },

        // ── clock_time_get ──
        clock_time_get: (
            _clock_id: number,
            _precision: bigint,
            time_ptr: number,
        ) => {
            const view = new DataView(memory.buffer);
            const now = BigInt(Date.now()) * 1000000n; // nanoseconds
            view.setBigUint64(time_ptr, now, true);
            return 0;
        },

        // ── fd_write (stdout / stderr) ──
        fd_write: (
            fd: number,
            iovs_ptr: number,
            iovs_len: number,
            nwritten_ptr: number,
        ) => {
            const view = new DataView(memory.buffer);
            let totalWritten = 0;

            for (let i = 0; i < iovs_len; i++) {
                const bufPtr = view.getUint32(iovs_ptr + i * 8, true);
                const bufLen = view.getUint32(iovs_ptr + i * 8 + 4, true);
                const bytes = new Uint8Array(memory.buffer, bufPtr, bufLen);
                const text = decoder.decode(bytes);

                if (fd === 1 || fd === 2) {
                    onStdout(text);
                }

                totalWritten += bufLen;
            }

            view.setUint32(nwritten_ptr, totalWritten, true);
            return 0;
        },

        // ── fd_close ──
        fd_close: () => 0,

        // ── fd_seek ──
        fd_seek: () => 0,

        // ── fd_read (stdin — stubbed) ──
        fd_read: () => 0,

        // ── fd_prestat_get ──
        fd_prestat_get: () => 8, // EBADF — no preopened dirs

        // ── fd_prestat_dir_name ──
        fd_prestat_dir_name: () => 8,

        // ── fd_fdstat_get ──
        fd_fdstat_get: () => 0,

        // ── path_open ──
        path_open: () => 44, // ENOSYS

        // ── proc_exit ──
        proc_exit: (code: number) => {
            onExit(code);
            throw new Error(`__wasi_proc_exit(${code})`);
        },

        // ── random_get ──
        random_get: (buf_ptr: number, buf_len: number) => {
            const bytes = new Uint8Array(memory.buffer, buf_ptr, buf_len);
            crypto.getRandomValues(bytes);
            return 0;
        },
    };
}
