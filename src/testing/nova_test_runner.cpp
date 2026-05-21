// Synthetic entry point mounted into the compiler's in-memory FS only in
// test mode. The user's own `int main(` (if any) is rewritten to
// `int nova_hidden_main(` by NpmDapEngine.compile so this becomes the
// program's sole `main()`; the student's main survives as dead code
// nothing calls. STUDENT_TEST blocks across every user .cpp register
// themselves via static-initialiser side effects, and we just iterate
// the resulting registry here.

#include "nova_test.h"

int main() {
    ::nova_test::run_all();
    return 0;
}
