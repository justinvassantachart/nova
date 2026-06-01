#include <iostream>
#include <vector>
#include <string>
#include <map>

int main() {
    int arr[5] = {1, 2, 3, 4, 5};
    std::vector<int> vec = {10, 20, 30};
    std::string s = "Hello Nova";
    std::map<int, std::string> m;
    m[1] = "one";
    m[2] = "two";

    int* p = new int(42);

    std::cout << "Done" << std::endl;
    return 0;
}
