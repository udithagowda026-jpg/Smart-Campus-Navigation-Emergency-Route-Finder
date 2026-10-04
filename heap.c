#include "heap.h"

#include <stdint.h>
#include <stdlib.h>

void heap_init(MinHeap *heap)
{
    heap->items = NULL;
    heap->size = 0;
    heap->capacity = 0;
}

void heap_free(MinHeap *heap)
{
    free(heap->items);
    heap->items = NULL;
    heap->size = 0;
    heap->capacity = 0;
}

int heap_push(MinHeap *heap, HeapItem item)
{
    size_t child;
    if (heap->size == heap->capacity) {
        size_t new_capacity = heap->capacity == 0 ? 16 : heap->capacity * 2;
        HeapItem *new_items;
        if (new_capacity < heap->capacity ||
            new_capacity > SIZE_MAX / sizeof(*heap->items)) {
            return 0;
        }
        new_items = (HeapItem *)realloc(heap->items,
                                        new_capacity * sizeof(*heap->items));
        if (new_items == NULL) {
            return 0;
        }
        heap->items = new_items;
        heap->capacity = new_capacity;
    }
    child = heap->size++;
    while (child > 0) {
        size_t parent = (child - 1) / 2;
        if (heap->items[parent].distance <= item.distance) {
            break;
        }
        heap->items[child] = heap->items[parent];
        child = parent;
    }
    heap->items[child] = item;
    return 1;
}

int heap_pop(MinHeap *heap, HeapItem *item)
{
    HeapItem last;
    size_t parent = 0;
    if (heap->size == 0 || item == NULL) {
        return 0;
    }
    *item = heap->items[0];
    last = heap->items[--heap->size];
    if (heap->size == 0) {
        return 1;
    }
    while (parent * 2 + 1 < heap->size) {
        size_t child = parent * 2 + 1;
        if (child + 1 < heap->size &&
            heap->items[child + 1].distance < heap->items[child].distance) {
            child++;
        }
        if (last.distance <= heap->items[child].distance) {
            break;
        }
        heap->items[parent] = heap->items[child];
        parent = child;
    }
    heap->items[parent] = last;
    return 1;
}