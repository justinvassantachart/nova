/*
 * File: gmath.h
 * -------------
 * This file exports several functions for working with graphical
 * geometry along with the mathematical constants PI and E.
 *
 * NOVA MODIFICATION: Removed gtypes.h/Qt dependency.
 * GPoint is defined inline here as a simple struct.
 */

#ifndef _gmath_h
#define _gmath_h

#include <cmath>
#include <limits>

/**
 * Lightweight GPoint for use without Qt.
 */
struct GPoint {
    double x;
    double y;
    GPoint() : x(0), y(0) {}
    GPoint(double x, double y) : x(x), y(y) {}
};

/**
 * The mathematical constant pi.
 */
extern const double PI;

/**
 * The mathematical constant e.
 */
extern const double E;

/**
 * Returns the trigonometric cosine of angle, measured in degrees.
 */
double cosDegrees(double angle);

/**
 * Returns the trigonometric sine of angle, measured in degrees.
 */
double sinDegrees(double angle);

/**
 * Returns the trigonometric tangent of angle, measured in degrees.
 */
double tanDegrees(double angle);

/**
 * Converts angle from radians to degrees.
 */
double toDegrees(double radians);

/**
 * Converts angle from degrees to radians.
 */
double toRadians(double degrees);

/**
 * Compares two floating-point values for near-equality.
 */
bool floatingPointEqual(double f1, double f2, double tolerance = 1e-10);

/**
 * Returns the number of digits in the given integer in the given base.
 */
int countDigits(int n, int base = 10);

/**
 * Returns the mathematical vector angle in degrees of a given dx/dy pair.
 */
double vectorAngle(double x0, double y0, double x1, double y1);
double vectorAngle(const GPoint& pt0, const GPoint& pt1);

/**
 * Returns the distance between two points.
 */
double vectorDistance(double x0, double y0, double x1, double y1);
double vectorDistance(const GPoint& pt0, const GPoint& pt1);

#endif // _gmath_h
