/*
 * File: stanford_lib.cpp
 * ----------------------
 * Merged implementation of the Stanford C++ library (CS 106B) for Nova.
 * This file combines all .cpp implementations into a single translation unit
 * for precompilation as a single .o file.
 *
 * MODIFICATIONS FOR NOVA (WASM target, -fno-exceptions):
 * - error() prints to stderr and calls std::abort() instead of throwing
 * - Removed Qt/GUI dependencies (gtypes.h → inline GPoint)
 * - Removed tokenscanner.h dependency from direction.cpp
 * - Removed filelib.h dependency from simpio.cpp
 * - Inlined private/static.h macros
 * - Removed sys/time.h from timer.cpp (use chrono instead)
 */

// ══════════════════════════════════════════════════════════════════
// INLINE: private/static.h macros (avoid extra dep)
// ══════════════════════════════════════════════════════════════════
#ifndef STATIC_CONST_VARIABLE_DECLARE
#define STATIC_VARIABLE_DECLARE(type, name, value) \
    static type & s_##name() { \
        static type __##name = (value); \
        return __##name; \
    }
#define STATIC_CONST_VARIABLE_DECLARE(type, name, value) \
    static const type & s_##name() { \
        static const type __##name = (value); \
        return __##name; \
    }
#define STATIC_VARIABLE(name) s_##name()
#endif

#include <cctype>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <queue>

// Include our Stanford headers (flat layout)
#include "error.h"
#include "hashcode.h"
#include "strlib.h"
#include "random.h"
#include "require.h"
#include "direction.h"
#include "gmath.h"
#include "gridlocation.h"
#include "collections.h"
#include "simpio.h"

// ══════════════════════════════════════════════════════════════════
//  error.cpp — NOVA: abort instead of throw
// ══════════════════════════════════════════════════════════════════

/* [[noreturn]] */ void error(const std::string& msg) {
    std::cerr << "STANFORD ERROR: " << msg << std::endl;
    std::abort();
}

// ══════════════════════════════════════════════════════════════════
//  hashcode.cpp
// ══════════════════════════════════════════════════════════════════

static const int HASH_SEED = 5381;
static const int HASH_MULTIPLIER = 33;
static const int HASH_MASK = unsigned(-1) >> 1;

int hashSeed() {
    return HASH_SEED;
}

int hashMultiplier() {
    return HASH_MULTIPLIER;
}

int hashMask() {
    return HASH_MASK;
}

int hashCode(int key) {
    return key & HASH_MASK;
}

int hashCode(bool key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(char key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(unsigned int key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(long key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(unsigned long key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(long long key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(unsigned long long key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(short key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(unsigned short key) {
    return hashCode(static_cast<int>(key));
}

int hashCode(const char* str) {
    unsigned hash = HASH_SEED;
    for (size_t i = 0; i < std::strlen(str); i++) {
        hash = HASH_MULTIPLIER * hash + str[i];
    }
    return int(hash & HASH_MASK);
}

int hashCode(const std::string& str) {
    unsigned hash = HASH_SEED;
    for (size_t i = 0; i < str.length(); i++) {
        hash = HASH_MULTIPLIER * hash + str[i];
    }
    return int(hash & HASH_MASK);
}

int hashCode(double key) {
    char* byte = (char*) &key;
    unsigned hash = HASH_SEED;
    for (size_t i = 0; i < sizeof(double); i++) {
        hash = HASH_MULTIPLIER * hash + (unsigned) byte[i];
    }
    return int(hash & HASH_MASK);
}

int hashCode(float key) {
    char* byte = (char*) &key;
    unsigned hash = HASH_SEED;
    for (size_t i = 0; i < sizeof(float); i++) {
        hash = HASH_MULTIPLIER * hash + (unsigned) byte[i];
    }
    return int(hash & HASH_MASK);
}

int hashCode(void* key) {
    return hashCode(reinterpret_cast<long>(key));
}

// ══════════════════════════════════════════════════════════════════
//  collections.cpp
// ══════════════════════════════════════════════════════════════════

STATIC_CONST_VARIABLE_DECLARE(std::string, STRING_DELIMITERS, ",:)}]\n")

bool stringNeedsQuoting(const std::string& str) {
    int n = str.length();
    for (int i = 0; i < n; i++) {
        char ch = str[i];
        if (isspace(ch)) return false;
        if (STATIC_VARIABLE(STRING_DELIMITERS).find(ch) != std::string::npos) return true;
    }
    return false;
}

bool readQuotedChar(std::istream& is, char& ch, bool throwOnError) {
    char temp;
    while (is.get(temp) && isspace(temp)) { }
    if (is.fail()) return true;

    if (temp == '\'' || temp == '"') {
        is.unget();
        std::string s;
        bool result = readQuotedString(is, s, throwOnError);
        if (result && !s.empty()) ch = s[0];
        return result;
    } else {
        if (temp == '\\') {
            char temp2;
            if (is.get(temp2)) {
                switch (temp2) {
                    case 'a':  ch = '\a'; break;
                    case 'b':  ch = '\b'; break;
                    case 'f':  ch = '\f'; break;
                    case 'n':  ch = '\n'; break;
                    case 'r':  ch = '\r'; break;
                    case 't':  ch = '\t'; break;
                    case 'v':  ch = '\v'; break;
                    case '0':  ch = '\0'; break;
                    case '\\': ch = '\\'; break;
                    case '\'': ch = '\''; break;
                    case '"':  ch = '"'; break;
                    default:   ch = '\0'; break;
                }
            }
        } else {
            ch = temp;
        }
        return true;
    }
}

bool readQuotedString(std::istream& is, std::string& str, bool throwOnError) {
    str = "";
    char ch;
    while (is.get(ch) && isspace(ch)) { }
    if (is.fail()) return true;

    if (ch == '\'' || ch == '"') {
        char delim = ch;
        while (true) {
            if (!is.get(ch) || is.fail()) {
                if (throwOnError) error("Unterminated string");
                return false;
            }
            if (ch == delim) break;
            if (ch == '\\') {
                if (!is.get(ch)) {
                    if (throwOnError) error("Unterminated escape sequence");
                    is.setstate(std::ios_base::failbit);
                    return false;
                }
                if (isdigit(ch) || ch == 'x') {
                    int maxDigits = 3;
                    int base = 8;
                    if (ch == 'x') {
                        base = 16; maxDigits = 2;
                        if (!is.get(ch)) {
                            if (throwOnError) error("Unterminated escape sequence");
                            is.setstate(std::ios_base::failbit);
                            return false;
                        }
                    }
                    int result = 0;
                    int digit = 0;
                    for (int i = 0; i < maxDigits && ch != delim; i++) {
                        if (isdigit(ch)) digit = ch - '0';
                        else if (base == 16 && isxdigit(ch)) digit = toupper(ch) - 'A' + 10;
                        else break;
                        result = base * result + digit;
                        if (!is.get(ch)) {
                            if (throwOnError) error("Unterminated string");
                            is.setstate(std::ios_base::failbit);
                            return false;
                        }
                    }
                    ch = char(result);
                    is.unget();
                } else {
                    switch (ch) {
                        case 'a': ch = '\a'; break;
                        case 'b': ch = '\b'; break;
                        case 'f': ch = '\f'; break;
                        case 'n': ch = '\n'; break;
                        case 'r': ch = '\r'; break;
                        case 't': ch = '\t'; break;
                        case 'v': ch = '\v'; break;
                        case '"': ch = '"'; break;
                        case '\'': ch = '\''; break;
                        case '\\': ch = '\\'; break;
                    }
                }
            }
            str += ch;
        }
    } else {
        str += ch;
        int endTrim = 0;
        while (is.get(ch) && STATIC_VARIABLE(STRING_DELIMITERS).find(ch) == std::string::npos) {
            str += ch;
            if (!isspace(ch)) endTrim = str.length();
        }
        if (is) is.unget();
        str = str.substr(0, endTrim);
    }
    return true;
}

std::ostream& writeQuotedChar(std::ostream& os, char ch, bool forceQuotes) {
    if (forceQuotes) os << '\'';
    switch (ch) {
        case '\a': os << "\\a"; break;
        case '\b': os << "\\b"; break;
        case '\f': os << "\\f"; break;
        case '\n': os << "\\n"; break;
        case '\r': os << "\\r"; break;
        case '\t': os << "\\t"; break;
        case '\v': os << "\\v"; break;
        case '\\': os << "\\\\"; break;
        default:
            if (isprint(ch) && ch != '\'') {
                os << ch;
            } else {
                std::ostringstream oss;
                oss << std::oct << std::setw(3) << std::setfill('0') << (int(ch) & 0xFF);
                os << "\\" << oss.str();
            }
    }
    if (forceQuotes) os << '\'';
    return os;
}

std::ostream& writeQuotedString(std::ostream& os, const std::string& str, bool forceQuotes) {
    if (!forceQuotes && stringNeedsQuoting(str)) forceQuotes = true;
    if (forceQuotes) os << '"';
    for (size_t i = 0; i < str.length(); i++) {
        char ch = str.at(i);
        switch (ch) {
            case '\a': os << "\\a"; break;
            case '\b': os << "\\b"; break;
            case '\f': os << "\\f"; break;
            case '\n': os << "\\n"; break;
            case '\r': os << "\\r"; break;
            case '\t': os << "\\t"; break;
            case '\v': os << "\\v"; break;
            case '\\': os << "\\\\"; break;
            default:
                if (isprint(ch) && ch != '"') {
                    os << ch;
                } else {
                    std::ostringstream oss;
                    oss << std::oct << std::setw(3) << std::setfill('0') << (int(ch) & 0xFF);
                    os << "\\" << oss.str();
                }
        }
    }
    if (forceQuotes) os << '"';
    return os;
}

// ══════════════════════════════════════════════════════════════════
//  gridlocation.cpp
// ══════════════════════════════════════════════════════════════════

#include "gridlocation.h"

GridLocation::GridLocation(int row, int col) : row(row), col(col) {}
GridLocation::GridLocation() : row(0), col(0) {}

std::string GridLocation::toString() const {
    std::ostringstream oss;
    oss << "r" << row << "c" << col;
    return oss.str();
}

bool operator ==(const GridLocation& loc1, const GridLocation& loc2) {
    return loc1.row == loc2.row && loc1.col == loc2.col;
}
bool operator !=(const GridLocation& loc1, const GridLocation& loc2) {
    return !(loc1 == loc2);
}
bool operator <(const GridLocation& loc1, const GridLocation& loc2) {
    if (loc1.row != loc2.row) return loc1.row < loc2.row;
    return loc1.col < loc2.col;
}
bool operator <=(const GridLocation& loc1, const GridLocation& loc2) {
    return !(loc2 < loc1);
}
bool operator >(const GridLocation& loc1, const GridLocation& loc2) {
    return loc2 < loc1;
}
bool operator >=(const GridLocation& loc1, const GridLocation& loc2) {
    return !(loc1 < loc2);
}
std::ostream& operator <<(std::ostream& os, const GridLocation& loc) {
    return os << loc.toString();
}

int hashCode(const GridLocation& loc) {
    return hashCode(loc.row, loc.col);
}

// ══════════════════════════════════════════════════════════════════
//  strlib.cpp
// ══════════════════════════════════════════════════════════════════

bool endsWith(const std::string& str, char suffix) {
    return !str.empty() && str[str.length() - 1] == suffix;
}

bool endsWith(const std::string& str, const std::string& suffix) {
    if (str.length() < suffix.length()) return false;
    return str.compare(str.length() - suffix.length(), suffix.length(), suffix) == 0;
}

bool startsWith(const std::string& str, char prefix) {
    return !str.empty() && str[0] == prefix;
}

bool startsWith(const std::string& str, const std::string& prefix) {
    if (str.length() < prefix.length()) return false;
    return str.compare(0, prefix.length(), prefix) == 0;
}

std::string integerToString(int n, int radix) {
    std::ostringstream stream;
    if (radix == 16) stream << std::hex << n;
    else if (radix == 8) stream << std::oct << n;
    else stream << n;
    return stream.str();
}

int stringToInteger(const std::string& str, int radix) {
    std::istringstream stream(str);
    int value;
    if (radix == 10) {
        stream >> value;
    } else {
        if (radix == 16) stream >> std::hex >> value;
        else if (radix == 8) stream >> std::oct >> value;
        else stream >> value;
    }
    if (stream.fail() || !stream.eof()) {
        error("stringToInteger: \"" + str + "\" is not a valid integer");
    }
    return value;
}

bool stringIsInteger(const std::string& str, int radix) {
    std::istringstream stream(str);
    int value;
    if (radix == 10) stream >> value;
    else if (radix == 16) stream >> std::hex >> value;
    else if (radix == 8) stream >> std::oct >> value;
    else stream >> value;
    return !stream.fail() && stream.eof();
}

std::string realToString(double d) {
    std::ostringstream stream;
    stream << d;
    return stream.str();
}

double stringToReal(const std::string& str) {
    std::istringstream stream(str);
    double value;
    stream >> value;
    if (stream.fail() || !stream.eof()) {
        error("stringToReal: \"" + str + "\" is not a valid real number");
    }
    return value;
}

bool stringIsReal(const std::string& str) {
    std::istringstream stream(str);
    double value;
    stream >> value;
    return !stream.fail() && stream.eof();
}

bool stringContains(const std::string& str, char ch) {
    return str.find(ch) != std::string::npos;
}

bool stringContains(const std::string& str, const std::string& substr) {
    return str.find(substr) != std::string::npos;
}

int stringIndexOf(const std::string& str, char ch) {
    size_t pos = str.find(ch);
    return pos == std::string::npos ? -1 : (int)pos;
}

int stringIndexOf(const std::string& str, const std::string& substr) {
    size_t pos = str.find(substr);
    return pos == std::string::npos ? -1 : (int)pos;
}

int stringLastIndexOf(const std::string& str, char ch) {
    size_t pos = str.rfind(ch);
    return pos == std::string::npos ? -1 : (int)pos;
}

int stringLastIndexOf(const std::string& str, const std::string& substr) {
    size_t pos = str.rfind(substr);
    return pos == std::string::npos ? -1 : (int)pos;
}

std::string stringReplace(const std::string& str, const std::string& old, const std::string& replacement, int limit) {
    std::string result = str;
    int count = 0;
    size_t pos = 0;
    while ((pos = result.find(old, pos)) != std::string::npos) {
        result.replace(pos, old.length(), replacement);
        pos += replacement.length();
        count++;
        if (limit > 0 && count >= limit) break;
    }
    return result;
}

std::string toLowerCase(const std::string& str) {
    std::string result = str;
    for (size_t i = 0; i < result.length(); i++) {
        result[i] = tolower(result[i]);
    }
    return result;
}

std::string toUpperCase(const std::string& str) {
    std::string result = str;
    for (size_t i = 0; i < result.length(); i++) {
        result[i] = toupper(result[i]);
    }
    return result;
}

std::string trim(const std::string& str) {
    size_t start = 0;
    while (start < str.length() && isspace(str[start])) start++;
    size_t end = str.length();
    while (end > start && isspace(str[end - 1])) end--;
    return str.substr(start, end - start);
}

std::string trimStart(const std::string& str) {
    size_t start = 0;
    while (start < str.length() && isspace(str[start])) start++;
    return str.substr(start);
}

std::string trimEnd(const std::string& str) {
    size_t end = str.length();
    while (end > 0 && isspace(str[end - 1])) end--;
    return str.substr(0, end);
}

char charToLower(char ch) { return (char)tolower(ch); }
char charToUpper(char ch) { return (char)toupper(ch); }

int charToInteger(char ch) {
    if (ch < '0' || ch > '9') error("charToInteger: '" + std::string(1, ch) + "' is not a numeric digit");
    return ch - '0';
}

char integerToChar(int n) {
    if (n < 0 || n > 9) error("integerToChar: number " + integerToString(n) + " is not a single digit");
    return char('0' + n);
}

// ══════════════════════════════════════════════════════════════════
//  random.cpp — NOVA: use JS bridge for true randomness
// ══════════════════════════════════════════════════════════════════

// rand()/srand() do not work in WASM — time(nullptr) returns 0,
// giving srand(0) a degenerate seed where rand() always returns 0.
//
// __nova_random_u32 is provided by the executor worker's env imports
// and backed by crypto.getRandomValues() on the JS side.
extern "C" unsigned int __nova_random_u32();

// Generate a uniformly distributed double in [0, 1).
static double _randomDouble01() {
    unsigned int value = __nova_random_u32();
    return value / (double(0xFFFFFFFFU) + 1.0);
}

int randomInteger(int low, int high) {
    if (low > high) error("randomInteger: low cannot be greater than high");
    double d = _randomDouble01();
    double s = d * (double(high) - low + 1);
    return (int)(floor(low + s));
}

double randomReal(double low, double high) {
    double d = _randomDouble01();
    double s = d * (high - low);
    return low + s;
}

bool randomChance(double p) {
    return randomReal(0, 1) < p;
}

void setRandomSeed(int seed) {
    // No-op in WASI: we use hardware randomness via random_get.
    // Kept for API compatibility with student code.
    (void)seed;
}

// ══════════════════════════════════════════════════════════════════
//  require.cpp
// ══════════════════════════════════════════════════════════════════

namespace require {

static std::string _buildMessage(const std::string& caller, const std::string& valueName, const std::string& details) {
    std::string msg;
    if (!caller.empty()) msg += caller + ": ";
    if (!valueName.empty()) msg += valueName + " ";
    msg += details;
    return msg;
}

void inRange(double value, double min, double max, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (value < min || value > max) {
        std::string msg = details.empty()
            ? _buildMessage(caller, valueName, realToString(value) + " is outside range [" + realToString(min) + ", " + realToString(max) + "]")
            : _buildMessage(caller, valueName, details);
        error(msg);
    }
}

void inRange(int value, int min, int max, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (value < min || value > max) {
        std::string msg = details.empty()
            ? _buildMessage(caller, valueName, integerToString(value) + " is outside range [" + integerToString(min) + ", " + integerToString(max) + "]")
            : _buildMessage(caller, valueName, details);
        error(msg);
    }
}

void inRange2D(double x, double y, double maxX, double maxY, const std::string& caller, const std::string& xValueName, const std::string& yValueName, const std::string& details) {
    inRange(x, 0.0, maxX, caller, xValueName, details);
    inRange(y, 0.0, maxY, caller, yValueName, details);
}

void inRange2D(double x, double y, double minX, double minY, double maxX, double maxY, const std::string& caller, const std::string& xValueName, const std::string& yValueName, const std::string& details) {
    inRange(x, minX, maxX, caller, xValueName, details);
    inRange(y, minY, maxY, caller, yValueName, details);
}

void inRange2D(int x, int y, int maxX, int maxY, const std::string& caller, const std::string& xValueName, const std::string& yValueName, const std::string& details) {
    inRange(x, 0, maxX, caller, xValueName, details);
    inRange(y, 0, maxY, caller, yValueName, details);
}

void inRange2D(int x, int y, int minX, int minY, int maxX, int maxY, const std::string& caller, const std::string& xValueName, const std::string& yValueName, const std::string& details) {
    inRange(x, minX, maxX, caller, xValueName, details);
    inRange(y, minY, maxY, caller, yValueName, details);
}

void nonEmpty(const std::string& str, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (str.empty()) {
        error(_buildMessage(caller, valueName, details.empty() ? "must not be empty" : details));
    }
}

void nonNegative(double value, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (value < 0) {
        error(_buildMessage(caller, valueName, details.empty() ? realToString(value) + " must be non-negative" : details));
    }
}

void nonNegative(int value, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (value < 0) {
        error(_buildMessage(caller, valueName, details.empty() ? integerToString(value) + " must be non-negative" : details));
    }
}

void nonNegative(long value, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (value < 0) {
        error(_buildMessage(caller, valueName, details.empty() ? "value must be non-negative" : details));
    }
}

void nonNegative2D(double x, double y, const std::string& caller, const std::string& xValueName, const std::string& yValueName, const std::string& details) {
    nonNegative(x, caller, xValueName, details);
    nonNegative(y, caller, yValueName, details);
}

void nonNegative2D(int x, int y, const std::string& caller, const std::string& xValueName, const std::string& yValueName, const std::string& details) {
    nonNegative(x, caller, xValueName, details);
    nonNegative(y, caller, yValueName, details);
}

void nonNull(const void* ptr, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (ptr == nullptr) {
        error(_buildMessage(caller, valueName, details.empty() ? "must not be null" : details));
    }
}

void positive(double value, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (value <= 0) {
        error(_buildMessage(caller, valueName, details.empty() ? realToString(value) + " must be positive" : details));
    }
}

void positive(int value, const std::string& caller, const std::string& valueName, const std::string& details) {
    if (value <= 0) {
        error(_buildMessage(caller, valueName, details.empty() ? integerToString(value) + " must be positive" : details));
    }
}

void require(bool test, const std::string& caller, const std::string& details) {
    if (!test) {
        error(_buildMessage(caller, "", details.empty() ? "requirement failed" : details));
    }
}

} // namespace require

// ══════════════════════════════════════════════════════════════════
//  direction.cpp — NOVA: removed tokenscanner dependency
// ══════════════════════════════════════════════════════════════════

Direction leftFrom(Direction dir) {
    return Direction((dir + 3) % 4);
}

Direction rightFrom(Direction dir) {
    return Direction((dir + 1) % 4);
}

Direction opposite(Direction dir) {
    return Direction((dir + 2) % 4);
}

std::string directionToString(Direction dir) {
    switch (dir) {
        case NORTH: return "NORTH";
        case EAST:  return "EAST";
        case SOUTH: return "SOUTH";
        default:    return "WEST";
    }
}

std::ostream& operator <<(std::ostream& os, const Direction& dir) {
    return os << directionToString(dir);
}

// Simplified >> without TokenScanner
std::istream& operator >>(std::istream& is, Direction& dir) {
    std::string token;
    is >> token;
    std::string upper;
    for (char c : token) upper += toupper(c);
    if (upper == "NORTH") dir = NORTH;
    else if (upper == "EAST") dir = EAST;
    else if (upper == "SOUTH") dir = SOUTH;
    else if (upper == "WEST") dir = WEST;
    else is.setstate(std::ios_base::failbit);
    return is;
}

Direction operator ++(Direction& dir, int) {
    Direction old = dir;
    dir = Direction(dir + 1);
    return old;
}

// ══════════════════════════════════════════════════════════════════
//  gmath.cpp — NOVA: removed gtypes.h dependency
// ══════════════════════════════════════════════════════════════════

extern const double PI = 3.14159265358979323846;
extern const double E  = 2.71828182845904523536;

double cosDegrees(double angle) { return cos(toRadians(angle)); }
double sinDegrees(double angle) { return sin(toRadians(angle)); }
double tanDegrees(double angle) { return tan(toRadians(angle)); }

double toDegrees(double radians) { return radians * 180 / PI; }
double toRadians(double degrees) { return degrees * PI / 180; }

bool floatingPointEqual(double f1, double f2, double tolerance) {
    return fabs(f1 - f2) < tolerance;
}

int countDigits(int n, int base) {
    if (n == 0) return 1;
    int count = 0;
    if (n < 0) { count++; n = -n; }
    while (n > 0) { count++; n /= base; }
    return count;
}

double vectorAngle(double x0, double y0, double x1, double y1) {
    return toDegrees(atan2(-(y1 - y0), x1 - x0));
}

double vectorAngle(const GPoint& pt0, const GPoint& pt1) {
    return vectorAngle(pt0.x, pt0.y, pt1.x, pt1.y);
}

double vectorDistance(double x0, double y0, double x1, double y1) {
    double dx = x1 - x0;
    double dy = y1 - y0;
    return sqrt(dx * dx + dy * dy);
}

double vectorDistance(const GPoint& pt0, const GPoint& pt1) {
    return vectorDistance(pt0.x, pt0.y, pt1.x, pt1.y);
}

// ══════════════════════════════════════════════════════════════════
//  simpio.cpp — NOVA: simplified, removed filelib/static.h deps
// ══════════════════════════════════════════════════════════════════

static void _appendSpace(std::string& prompt) {
    if (!prompt.empty() && !isspace(prompt[prompt.length()-1])) {
        prompt += ' ';
    }
}

/*
 * NOTE: These functions use std::cin which requires STDIN support.
 * In Nova, STDIN is not yet connected, so these will block.
 * They are provided for source compatibility.
 */

std::string getLine(const std::string& prompt) {
    std::string result;
    std::string p = prompt;
    _appendSpace(p);
    if (!p.empty()) std::cout << p;
    std::getline(std::cin, result);
    return result;
}

int getInteger(const std::string& prompt, const std::string& reprompt) {
    std::string promptCopy = prompt;
    int value;
    while (true) {
        _appendSpace(promptCopy);
        if (!promptCopy.empty()) std::cout << promptCopy;
        std::string line;
        std::getline(std::cin, line);
        std::istringstream stream(line);
        stream >> value;
        char extra;
        if (!stream.fail() && !(stream >> extra)) return value;
        std::cout << (reprompt.empty() ? "Illegal integer format. Try again." : reprompt) << std::endl;
        if (!reprompt.empty()) promptCopy = reprompt;
    }
}

double getDouble(const std::string& prompt, const std::string& reprompt) {
    std::string promptCopy = prompt;
    double value;
    while (true) {
        _appendSpace(promptCopy);
        if (!promptCopy.empty()) std::cout << promptCopy;
        std::string line;
        std::getline(std::cin, line);
        std::istringstream stream(line);
        stream >> value;
        char extra;
        if (!stream.fail() && !(stream >> extra)) return value;
        std::cout << (reprompt.empty() ? "Illegal numeric format. Try again." : reprompt) << std::endl;
        if (!reprompt.empty()) promptCopy = reprompt;
    }
}

char getChar(const std::string& prompt, const std::string& reprompt) {
    std::string promptCopy = prompt;
    while (true) {
        _appendSpace(promptCopy);
        if (!promptCopy.empty()) std::cout << promptCopy;
        std::string line;
        std::getline(std::cin, line);
        if (line.length() == 1) return line[0];
        std::cout << (reprompt.empty() ? "You must type a single character. Try again." : reprompt) << std::endl;
        if (!reprompt.empty()) promptCopy = reprompt;
    }
}

bool getYesOrNo(const std::string& prompt, const std::string& reprompt) {
    std::string promptCopy = prompt;
    while (true) {
        _appendSpace(promptCopy);
        if (!promptCopy.empty()) std::cout << promptCopy;
        std::string line;
        std::getline(std::cin, line);
        if (line == "y" || line == "Y" || line == "yes" || line == "YES" || line == "Yes") return true;
        if (line == "n" || line == "N" || line == "no" || line == "NO" || line == "No") return false;
        std::cout << (reprompt.empty() ? "Please type a word that starts with 'Y' or 'N'." : reprompt) << std::endl;
        if (!reprompt.empty()) promptCopy = reprompt;
    }
}

// ══════════════════════════════════════════════════════════════════
//  timer.cpp — NOVA: use <chrono> instead of <sys/time.h>
// ══════════════════════════════════════════════════════════════════

#include "timer.h"

Timer::Timer(bool autostart) {
    _startMS = 0;
    _stopMS = 0;
    _isStarted = false;
    if (autostart) start();
}

long Timer::elapsed() const {
    return _stopMS - _startMS;
}

bool Timer::isStarted() const {
    return _isStarted;
}

static long _currentTimeMS() {
    auto now = std::chrono::steady_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch());
    return (long)ms.count();
}

void Timer::start() {
    _startMS = _currentTimeMS();
    _isStarted = true;
}

long Timer::stop() {
    _stopMS = _currentTimeMS();
    if (!_isStarted) _stopMS = _startMS;
    _isStarted = false;
    return elapsed();
}
