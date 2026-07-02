// Nova IDE test framework — single-TU definitions.
//
// registry() and current_failed() are defined here rather than inline in the
// header so that each compilation unit gets a proper external call instead of
// its own COMDAT copy with a duplicate static local.  Duplicate COMDAT
// definitions confuse wasm-ld's DWARF tables and cause the DAP adapter to
// trap when the debugger tries to look up addresses in a multi-file build.
#include "nova_test.h"

namespace nova_test {

std::vector<Entry>& registry() {
    static std::vector<Entry> r;
    return r;
}

bool& current_failed() {
    static bool f = false;
    return f;
}

}  // namespace nova_test
