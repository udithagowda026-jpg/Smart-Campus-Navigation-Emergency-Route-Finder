#ifndef HISTORY_H
#define HISTORY_H

#include "dijkstra.h"

typedef struct RouteRecord {
    int locations[MAX_LOCATIONS];
    int count;
    int total_minutes;
    int emergency_mode;
    char timestamp[32];
    struct RouteRecord *next;
} RouteRecord;

typedef struct {
    RouteRecord *head;
    RouteRecord *tail;
} RouteHistory;

void history_init(RouteHistory *history);
int history_add(RouteHistory *history, const RouteResult *route,
                int emergency_mode);
void history_display(const RouteHistory *history, const Graph *graph);
void history_free(RouteHistory *history);

#endif