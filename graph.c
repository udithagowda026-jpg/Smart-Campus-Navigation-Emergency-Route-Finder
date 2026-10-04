#include "graph.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int names_equal(const char *left, const char *right)
{
    while (*left != '\0' && *right != '\0') {
        if (tolower((unsigned char)*left) != tolower((unsigned char)*right)) {
            return 0;
        }
        left++;
        right++;
    }
    return *left == '\0' && *right == '\0';
}

static unsigned long name_hash(const char *name)
{
    unsigned long hash = 5381UL;
    while (*name != '\0') {
        hash = ((hash << 5) + hash) +
               (unsigned long)tolower((unsigned char)*name);
        name++;
    }
    return hash % HASH_CAPACITY;
}

static int valid_location(const Graph *graph, int location)
{
    return graph != NULL && location >= 0 && location < graph->count;
}

static Edge *find_edge(const Graph *graph, int source, int destination)
{
    Edge *edge;
    if (!valid_location(graph, source) || !valid_location(graph, destination)) {
        return NULL;
    }
    edge = graph->locations[source].roads;
    while (edge != NULL) {
        if (edge->destination == destination) {
            return edge;
        }
        edge = edge->next;
    }
    return NULL;
}

void graph_init(Graph *graph)
{
    int index;
    if (graph == NULL) {
        return;
    }
    graph->count = 0;
    for (index = 0; index < HASH_CAPACITY; index++) {
        graph->hash_slots[index] = -1;
    }
    for (index = 0; index < MAX_LOCATIONS; index++) {
        graph->locations[index].name[0] = '\0';
        graph->locations[index].roads = NULL;
    }
}

void graph_free(Graph *graph)
{
    int index;
    if (graph == NULL) {
        return;
    }
    for (index = 0; index < graph->count; index++) {
        Edge *edge = graph->locations[index].roads;
        while (edge != NULL) {
            Edge *next = edge->next;
            free(edge);
            edge = next;
        }
        graph->locations[index].roads = NULL;
    }
    graph->count = 0;
}

int graph_find_location(const Graph *graph, const char *name)
{
    unsigned long slot;
    unsigned long probes;
    if (graph == NULL || name == NULL || name[0] == '\0') {
        return -1;
    }
    slot = name_hash(name);
    /* Linear probing resolves collisions without moving existing location IDs. */
    for (probes = 0; probes < HASH_CAPACITY; probes++) {
        int location = graph->hash_slots[slot];
        if (location == -1) {
            return -1;
        }
        if (names_equal(graph->locations[location].name, name)) {
            return location;
        }
        slot = (slot + 1) % HASH_CAPACITY;
    }
    return -1;
}

int graph_add_location(Graph *graph, const char *name)
{
    size_t length;
    unsigned long slot;
    unsigned long probes;
    if (graph == NULL || name == NULL) {
        return 0;
    }
    length = strlen(name);
    if (length == 0 || length >= LOCATION_NAME_LENGTH ||
        graph->count >= MAX_LOCATIONS || graph_find_location(graph, name) >= 0) {
        return 0;
    }
    slot = name_hash(name);
    for (probes = 0; probes < HASH_CAPACITY; probes++) {
        if (graph->hash_slots[slot] == -1) {
            int location = graph->count++;
            strcpy(graph->locations[location].name, name);
            graph->locations[location].roads = NULL;
            graph->hash_slots[slot] = location;
            return 1;
        }
        slot = (slot + 1) % HASH_CAPACITY;
    }
    return 0;
}

static Edge *make_edge(int destination, int minutes, RoadStatus status,
                       int emergency_available, Edge *next)
{
    Edge *edge = (Edge *)malloc(sizeof(*edge));
    if (edge == NULL) {
        return NULL;
    }
    edge->destination = destination;
    edge->minutes = minutes;
    edge->status = status;
    edge->emergency_available = emergency_available;
    edge->next = next;
    return edge;
}

int graph_add_road(Graph *graph, int source, int destination, int minutes,
                   RoadStatus status, int emergency_available)
{
    Edge *forward;
    Edge *backward;
    if (!valid_location(graph, source) || !valid_location(graph, destination) ||
        source == destination || minutes <= 0 || status < ROAD_NORMAL ||
        status > ROAD_EMERGENCY_ONLY || graph_road_exists(graph, source, destination)) {
        return 0;
    }
    forward = make_edge(destination, minutes, status, emergency_available,
                        graph->locations[source].roads);
    if (forward == NULL) {
        return 0;
    }
    backward = make_edge(source, minutes, status, emergency_available,
                         graph->locations[destination].roads);
    if (backward == NULL) {
        free(forward);
        return 0;
    }
    /* Allocate both halves before linking either, keeping roads bidirectional. */
    graph->locations[source].roads = forward;
    graph->locations[destination].roads = backward;
    return 1;
}

static int remove_one_edge(Graph *graph, int source, int destination)
{
    Edge **link = &graph->locations[source].roads;
    while (*link != NULL) {
        if ((*link)->destination == destination) {
            Edge *removed = *link;
            *link = removed->next;
            free(removed);
            return 1;
        }
        link = &(*link)->next;
    }
    return 0;
}

int graph_remove_road(Graph *graph, int source, int destination)
{
    if (!graph_road_exists(graph, source, destination)) {
        return 0;
    }
    return remove_one_edge(graph, source, destination) &&
           remove_one_edge(graph, destination, source);
}

int graph_update_road(Graph *graph, int source, int destination, int minutes)
{
    Edge *forward;
    Edge *backward;
    if (minutes <= 0) {
        return 0;
    }
    forward = find_edge(graph, source, destination);
    backward = find_edge(graph, destination, source);
    if (forward == NULL || backward == NULL) {
        return 0;
    }
    forward->minutes = minutes;
    backward->minutes = minutes;
    return 1;
}

int graph_road_exists(const Graph *graph, int source, int destination)
{
    return find_edge(graph, source, destination) != NULL;
}

int graph_collect_roads(const Graph *graph, RoadInfo roads[], size_t capacity)
{
    int source;
    int count = 0;
    if (graph == NULL || roads == NULL) {
        return 0;
    }
    for (source = 0; source < graph->count; source++) {
        Edge *edge = graph->locations[source].roads;
        while (edge != NULL) {
            if (source < edge->destination && (size_t)count < capacity) {
                roads[count].source = source;
                roads[count].destination = edge->destination;
                roads[count].minutes = edge->minutes;
                roads[count].status = edge->status;
                roads[count].emergency_available = edge->emergency_available;
                count++;
            }
            edge = edge->next;
        }
    }
    return count;
}

const char *road_status_name(RoadStatus status)
{
    switch (status) {
    case ROAD_NORMAL: return "NORMAL";
    case ROAD_CROWDED: return "CROWDED";
    case ROAD_BLOCKED: return "BLOCKED";
    case ROAD_EMERGENCY_ONLY: return "EMERGENCY_ONLY";
    default: return "UNKNOWN";
    }
}

void graph_display_locations(const Graph *graph)
{
    int index;
    printf("\nCAMPUS LOCATIONS (%d/%d)\n", graph->count, MAX_LOCATIONS);
    for (index = 0; index < graph->count; index++) {
        printf("%2d. %s\n", index + 1, graph->locations[index].name);
    }
}

void graph_display_map(const Graph *graph)
{
    int source;
    printf("\nCAMPUS MAP (each road is bidirectional)\n");
    for (source = 0; source < graph->count; source++) {
        Edge *edge = graph->locations[source].roads;
        if (edge == NULL) {
            printf("%s: (no roads)\n", graph->locations[source].name);
            continue;
        }
        while (edge != NULL) {
            printf("%s -> %s: %d min [%s, emergency %s]\n",
                   graph->locations[source].name,
                   graph->locations[edge->destination].name, edge->minutes,
                   road_status_name(edge->status),
                   edge->emergency_available ? "available" : "unavailable");
            edge = edge->next;
        }
    }
}