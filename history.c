#include "history.h"

#include <stdio.h>
#include <stdlib.h>
#include <time.h>

void history_init(RouteHistory *history)
{
    history->head = NULL;
    history->tail = NULL;
}

int history_add(RouteHistory *history, const RouteResult *route,
                int emergency_mode)
{
    RouteRecord *record = (RouteRecord *)malloc(sizeof(*record));
    time_t now;
    struct tm *local_time;
    if (record == NULL) {
        return 0;
    }
    record->count = route->count;
    record->total_minutes = route->total_minutes;
    record->emergency_mode = emergency_mode;
    for (int index = 0; index < route->count; index++) {
        record->locations[index] = route->locations[index];
    }
    now = time(NULL);
    local_time = localtime(&now);
    if (local_time != NULL) {
        strftime(record->timestamp, sizeof(record->timestamp),
                 "%Y-%m-%d %H:%M:%S", local_time);
    } else {
        snprintf(record->timestamp, sizeof(record->timestamp), "time unavailable");
    }
    record->next = NULL;
    /* The tail pointer makes appending each route record constant time. */
    if (history->tail == NULL) {
        history->head = record;
    } else {
        history->tail->next = record;
    }
    history->tail = record;
    return 1;
}

void history_display(const RouteHistory *history, const Graph *graph)
{
    const RouteRecord *record = history->head;
    int number = 0;
    printf("\nROUTE HISTORY\n");
    while (record != NULL) {
        int index;
        printf("%d. [%s] %s: ", ++number, record->timestamp,
               record->emergency_mode ? "Emergency" : "Shortest");
        for (index = 0; index < record->count; index++) {
            printf("%s%s", index == 0 ? "" : " -> ",
                   graph->locations[record->locations[index]].name);
        }
        printf(" (%d minutes)\n", record->total_minutes);
        record = record->next;
    }
    if (number == 0) {
        printf("No routes have been calculated yet.\n");
    }
}

void history_free(RouteHistory *history)
{
    RouteRecord *record = history->head;
    while (record != NULL) {
        RouteRecord *next = record->next;
        free(record);
        record = next;
    }
    history->head = NULL;
    history->tail = NULL;
}