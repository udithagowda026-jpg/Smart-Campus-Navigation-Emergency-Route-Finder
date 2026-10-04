#include "search.h"

#include <stdio.h>

int search_find_location(const Graph *graph, const char *name)
{
    return graph_find_location(graph, name);
}

void search_display_location(const Graph *graph, int location)
{
    Edge *edge;
    int found = 0;
    if (graph == NULL || location < 0 || location >= graph->count) {
        return;
    }
    printf("\nLOCATION FOUND\nName: %s\nConnected locations:\n",
           graph->locations[location].name);
    for (edge = graph->locations[location].roads; edge != NULL; edge = edge->next) {
        printf("- %s (%d min, %s)\n",
               graph->locations[edge->destination].name, edge->minutes,
               road_status_name(edge->status));
        found = 1;
    }
    if (!found) {
        printf("(none)\n");
    }
}