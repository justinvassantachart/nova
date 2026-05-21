// Synthetic entry-point injected by the engine when "Run Tests" is invoked.
// The user's `int main(` is rewritten to `int nova_hidden_main(` so this
// function becomes the program's sole entry point; the student's main()
// survives as dead code that nothing calls.

#include "nova_test.h"

int main() {
    ::nova_test::run_all();
    return 0;
}
