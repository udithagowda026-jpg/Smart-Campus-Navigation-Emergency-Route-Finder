#ifndef SEARCH_H
#define SEARCH_H

#include "graph.h"

int search_find_location(const Graph *graph, const char *name);
void search_display_location(const Graph *graph, int location);

#endif