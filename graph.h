#ifndef GRAPH_H
#define GRAPH_H

#include <stddef.h>

#define MAX_LOCATIONS 100
#define LOCATION_NAME_LENGTH 64
#define HASH_CAPACITY 211
#define MAX_ROADS (MAX_LOCATIONS * (MAX_LOCATIONS - 1) / 2)

typedef enum {
    ROAD_NORMAL = 1,
    ROAD_CROWDED,
    ROAD_BLOCKED,
    ROAD_EMERGENCY_ONLY
} RoadStatus;

typedef struct Edge {
    int destination;
    int minutes;
    RoadStatus status;
    int emergency_available;
    struct Edge *next;
} Edge;

typedef struct {
    char name[LOCATION_NAME_LENGTH];
    Edge *roads;
} Location;

typedef struct {
    int source;
    int destination;
    int minutes;
    RoadStatus status;
    int emergency_available;
} RoadInfo;

typedef struct {
    Location locations[MAX_LOCATIONS];
    int hash_slots[HASH_CAPACITY];
    int count;
} Graph;

void graph_init(Graph *graph);
void graph_free(Graph *graph);
int graph_add_location(Graph *graph, const char *name);
int graph_find_location(const Graph *graph, const char *name);
int graph_add_road(Graph *graph, int source, int destination, int minutes,
                   RoadStatus status, int emergency_available);
int graph_remove_road(Graph *graph, int source, int destination);
int graph_update_road(Graph *graph, int source, int destination, int minutes);
int graph_road_exists(const Graph *graph, int source, int destination);
int graph_collect_roads(const Graph *graph, RoadInfo roads[], size_t capacity);
const char *road_status_name(RoadStatus status);
void graph_display_locations(const Graph *graph);
void graph_display_map(const Graph *graph);

#endif