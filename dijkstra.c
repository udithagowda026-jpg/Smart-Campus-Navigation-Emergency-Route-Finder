#include "dijkstra.h"

#include "heap.h"

#include <limits.h>
#include <stdio.h>

static int edge_is_usable(const Edge *edge, int emergency_mode)
{
    if (edge->status == ROAD_BLOCKED) {
        return 0;
    }
    if (emergency_mode) {
        return edge->emergency_available;
    }
    return edge->status != ROAD_EMERGENCY_ONLY;
}

int dijkstra_find_route(const Graph *graph, int start, int destination,
                        int emergency_mode, RouteResult *result)
{
    int distances[MAX_LOCATIONS];
    int parents[MAX_LOCATIONS];
    int visited[MAX_LOCATIONS] = {0};
    int stack[MAX_LOCATIONS];
    int stack_count = 0;
    int index;
    MinHeap heap;
    HeapItem current;
    int found = 0;

    if (graph == NULL || result == NULL || start < 0 || destination < 0 ||
        start >= graph->count || destination >= graph->count) {
        return 0;
    }
    for (index = 0; index < graph->count; index++) {
        distances[index] = INT_MAX;
        parents[index] = -1;
    }
    distances[start] = 0;
    heap_init(&heap);
    if (!heap_push(&heap, (HeapItem){start, 0})) {
        heap_free(&heap);
        return 0;
    }

    while (heap_pop(&heap, &current)) {
        Edge *edge;
        int node = current.node;
        /* Older heap entries are skipped after a shorter distance is discovered. */
        if (visited[node] || current.distance != distances[node]) {
            continue;
        }
        visited[node] = 1;
        if (node == destination) {
            found = 1;
            break;
        }
        for (edge = graph->locations[node].roads; edge != NULL; edge = edge->next) {
            int next = edge->destination;
            int candidate;
            if (!edge_is_usable(edge, emergency_mode) ||
                distances[node] > INT_MAX - edge->minutes) {
                continue;
            }
            candidate = distances[node] + edge->minutes;
            if (candidate < distances[next]) {
                distances[next] = candidate;
                parents[next] = node;
                if (!heap_push(&heap, (HeapItem){next, candidate})) {
                    heap_free(&heap);
                    return 0;
                }
            }
        }
    }
    heap_free(&heap);
    if (!found) {
        return 0;
    }

    /* Parent links run backward; the stack restores start-to-destination order. */
    for (index = destination; index != -1; index = parents[index]) {
        if (stack_count >= MAX_LOCATIONS) {
            return 0;
        }
        stack[stack_count++] = index;
        if (index == start) {
            break;
        }
    }
    if (stack_count == 0 || stack[stack_count - 1] != start) {
        return 0;
    }
    result->count = stack_count;
    result->total_minutes = distances[destination];
    for (index = 0; index < stack_count; index++) {
        result->locations[index] = stack[stack_count - index - 1];
        if (index + 1 < stack_count) {
            int from = result->locations[index];
            int to = stack[stack_count - index - 2];
            Edge *edge = graph->locations[from].roads;
            while (edge != NULL && edge->destination != to) {
                edge = edge->next;
            }
            if (edge == NULL) {
                return 0;
            }
            result->leg_minutes[index] = edge->minutes;
        }
    }
    return 1;
}

void dijkstra_display_route(const Graph *graph, const RouteResult *route,
                            int emergency_mode)
{
    int index;
    printf("\n%s ROUTE\n", emergency_mode ? "EMERGENCY" : "SHORTEST");
    for (index = 0; index < route->count; index++) {
        printf("%s%s", index == 0 ? "" : " -> ",
               graph->locations[route->locations[index]].name);
    }
    printf("\nRoad distances:\n");
    for (index = 0; index + 1 < route->count; index++) {
        printf("  %s -> %s: %d minutes\n",
               graph->locations[route->locations[index]].name,
               graph->locations[route->locations[index + 1]].name,
               route->leg_minutes[index]);
    }
    printf("Total travel time: %d minutes\n", route->total_minutes);
}