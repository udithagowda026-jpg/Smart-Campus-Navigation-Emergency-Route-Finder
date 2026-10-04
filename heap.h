#ifndef HEAP_H
#define HEAP_H

#include <stddef.h>

typedef struct {
    int node;
    int distance;
} HeapItem;

typedef struct {
    HeapItem *items;
    size_t size;
    size_t capacity;
} MinHeap;

void heap_init(MinHeap *heap);
void heap_free(MinHeap *heap);
int heap_push(MinHeap *heap, HeapItem item);
int heap_pop(MinHeap *heap, HeapItem *item);

#endif