/*
 * File: error.h
 * -------------
 * This file defines the error function used by the Stanford C++ libraries.
 *
 * NOVA MODIFICATION: Exceptions are not available in the WASM target.
 * error() prints to stderr and aborts instead of throwing.
 * ErrorException is kept as a simple struct for source compatibility
 * but is never thrown.
 */

#ifndef _error_h
#define _error_h

#include <iostream>
#include <string>
#include <cstdlib>

/*
 * ErrorException kept as a lightweight struct for source compatibility.
 * Code that declares ErrorException variables will still compile,
 * but catch blocks will never trigger since error() calls abort().
 */
class ErrorException {
public:
    ErrorException(std::string msg) : _msg(msg) {}
    virtual ~ErrorException() = default;
    virtual std::string getMessage() const { return _msg; }
    virtual const char* what() const noexcept { return _msg.c_str(); }
private:
    std::string _msg;
};

inline std::ostream& operator <<(std::ostream& out, const ErrorException& ex) {
    out << "ErrorException: " << ex.what();
    return out;
}

/**
 * Signals an error condition by printing the message to stderr and aborting.
 */
[[noreturn]] void error(const std::string& msg);

#endif // _error_h
