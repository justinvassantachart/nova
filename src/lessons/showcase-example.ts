/** A small, correct program visitors can edit freely in the landing-page IDE. */
export const linkedListExample = `#include <iostream>

struct Node {
    int value;
    Node* next;
};
// Click Debug, then Step Over to watch the list grow.
int main() {
    Node* head = new Node{10, nullptr};
    Node* middle = new Node{20, nullptr};
    Node* tail = new Node{30, nullptr};
    head->next = middle;
    middle->next = tail;

    int total = 0;
    Node* current = head;
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

export const linkedListEntryLine = linkedListExample.split('\n')
    .findIndex(line => line.includes('Node* head = new Node')) + 1
