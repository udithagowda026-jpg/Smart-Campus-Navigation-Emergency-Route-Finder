#include "bfs.h"

#include <stdio.h>

void bfs_display_reachable(const Graph *graph, int start)
{
    int queue[MAX_LOCATIONS];
    int visited[MAX_LOCATIONS] = {0};
    int front = 0;
    int rear = 0;
    int number = 0;
    if (graph == NULL || start < 0 || start >= graph->count) {
        return;
    }
    visited[start] = 1;
    queue[rear++] = start;
    printf("\nLocations reachable from %s (BFS order):\n",
           graph->locations[start].name);
        /* Mark when enqueued so each location enters the queue at most once. */
    while (front < rear) {
        int node = queue[front++];
        Edge *edge;
        for (edge = graph->locations[node].roads; edge != NULL; edge = edge->next) {
            int next = edge->destination;
            if (edge->status == ROAD_BLOCKED ||
                edge->status == ROAD_EMERGENCY_ONLY || visited[next]) {
                continue;
            }
            visited[next] = 1;
            queue[rear++] = next;
            printf("%2d. %s\n", ++number, graph->locations[next].name);
        }
    }
    if (number == 0) {
        printf("No other locations are reachable by ordinary roads.\n");
    }
}