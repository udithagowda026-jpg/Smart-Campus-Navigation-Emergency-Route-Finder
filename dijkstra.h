#ifndef DIJKSTRA_H
#define DIJKSTRA_H

#include "graph.h"

typedef struct {
    int locations[MAX_LOCATIONS];
    int leg_minutes[MAX_LOCATIONS - 1];
    int count;
    int total_minutes;
} RouteResult;

/* emergency_mode permits emergency-only roads and requires emergency availability. */
int dijkstra_find_route(const Graph *graph, int start, int destination,
                        int emergency_mode, RouteResult *result);
void dijkstra_display_route(const Graph *graph, const RouteResult *route,
                            int emergency_mode);

#endif