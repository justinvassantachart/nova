/** A small, correct program visitors can edit freely in the landing-page IDE. */
export const linkedListExample = `#include <iostream>

struct Node {
    int value;
    Node* next;
};

int main() {
    Node* head = new Node{10, nullptr};
    Node* middle = new Node{20, nullptr};
    Node* tail = new Node{30, nullptr};
    head->next = middle;
    middle->next = tail;

    int total = 0;
    Node* current = head;
    // Set a breakpoint on the next line, then click Debug.
    while (current != nullptr) {
        total += current->value;
        current = current->next;
    }
    std::cout << "10 + 20 + 30 = " << total << "\\n";

    delete head;
    delete middle;
    delete tail;
    return 0;
}
`
