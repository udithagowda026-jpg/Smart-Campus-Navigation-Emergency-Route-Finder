#include "bfs.h"
#include "dijkstra.h"
#include "graph.h"
#include "history.h"
#include "search.h"
#include "sort.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define INPUT_LENGTH 128

static int read_line(const char *prompt, char buffer[], size_t capacity)
{
    for (;;) {
        size_t length;
        int character;
        printf("%s", prompt);
        if (fgets(buffer, (int)capacity, stdin) == NULL) {
            return 0;
        }
        length = strlen(buffer);
        if (length > 0 && buffer[length - 1] == '\n') {
            buffer[--length] = '\0';
            if (length > 0 && buffer[length - 1] == '\r') {
                buffer[--length] = '\0';
            }
        } else if (!feof(stdin)) {
            while ((character = getchar()) != '\n' && character != EOF) {
            }
            printf("Input is too long (maximum %u characters). Try again.\n",
                   (unsigned)(capacity - 1));
            continue;
        }
        while (length > 0 && isspace((unsigned char)buffer[length - 1])) {
            buffer[--length] = '\0';
        }
        {
            size_t first = 0;
            while (buffer[first] != '\0' && isspace((unsigned char)buffer[first])) {
                first++;
            }
            if (first > 0) {
                memmove(buffer, buffer + first, strlen(buffer + first) + 1);
            }
        }
        return 1;
    }
}

static int read_integer(const char *prompt, int *value)
{
    char buffer[INPUT_LENGTH];
    char *end;
    long parsed;
    for (;;) {
        if (!read_line(prompt, buffer, sizeof(buffer))) {
            return 0;
        }
        errno = 0;
        parsed = strtol(buffer, &end, 10);
        while (isspace((unsigned char)*end)) {
            end++;
        }
        if (buffer[0] != '\0' && *end == '\0' && errno != ERANGE &&
            parsed >= INT_MIN && parsed <= INT_MAX) {
            *value = (int)parsed;
            return 1;
        }
        printf("Please enter a valid whole number.\n");
    }
}

static int ask_location(const Graph *graph, const char *prompt)
{
    char name[INPUT_LENGTH];
    int location;
    if (!read_line(prompt, name, sizeof(name))) {
        return -2;
    }
    location = search_find_location(graph, name);
    if (location < 0) {
        printf("Location '%s' was not found.\n", name);
        return -1;
    }
    return location;
}

static int ask_road_endpoints(const Graph *graph, int *source, int *destination)
{
    *source = ask_location(graph, "Source location: ");
    if (*source < 0) {
        return 0;
    }
    *destination = ask_location(graph, "Destination location: ");
    if (*destination < 0) {
        return 0;
    }
    if (*source == *destination) {
        printf("A road must connect two different locations.\n");
        return 0;
    }
    return 1;
}

static int read_status(RoadStatus *status)
{
    int choice;
    puts("Road status: 1. NORMAL  2. CROWDED  3. BLOCKED  4. EMERGENCY_ONLY");
    for (;;) {
        if (!read_integer("Select status: ", &choice)) {
            return 0;
        }
        if (choice >= ROAD_NORMAL && choice <= ROAD_EMERGENCY_ONLY) {
            *status = (RoadStatus)choice;
            return 1;
        }
        puts("Choose a status from 1 to 4.");
    }
}

static void add_seed_road(Graph *graph, const char *from, const char *to,
                          int minutes, RoadStatus status, int emergency_available)
{
    int source = graph_find_location(graph, from);
    int destination = graph_find_location(graph, to);
    if (source >= 0 && destination >= 0) {
        (void)graph_add_road(graph, source, destination, minutes, status,
                             emergency_available);
    }
}

static int initialize_campus(Graph *graph)
{
    static const char *names[] = {
        "Main Gate", "Block A", "Block B", "Library", "CSE Department",
        "AI Lab", "Computer Lab", "Canteen", "Auditorium", "Parking Area",
        "Hostel", "Medical Center", "Admin Block", "Sports Ground"
    };
    size_t index;
    graph_init(graph);
    for (index = 0; index < sizeof(names) / sizeof(names[0]); index++) {
        if (!graph_add_location(graph, names[index])) {
            return 0;
        }
    }
    add_seed_road(graph, "Main Gate", "Block A", 5, ROAD_NORMAL, 1);
    add_seed_road(graph, "Main Gate", "Block B", 7, ROAD_CROWDED, 0);
    add_seed_road(graph, "Block A", "Library", 3, ROAD_NORMAL, 1);
    add_seed_road(graph, "Library", "AI Lab", 2, ROAD_NORMAL, 1);
    add_seed_road(graph, "Block A", "Canteen", 4, ROAD_CROWDED, 1);
    add_seed_road(graph, "Block B", "CSE Department", 4, ROAD_NORMAL, 1);
    add_seed_road(graph, "CSE Department", "AI Lab", 3, ROAD_NORMAL, 1);
    add_seed_road(graph, "CSE Department", "Computer Lab", 2, ROAD_NORMAL, 1);
    add_seed_road(graph, "Library", "Admin Block", 6, ROAD_NORMAL, 1);
    add_seed_road(graph, "Admin Block", "Medical Center", 3, ROAD_NORMAL, 1);
    add_seed_road(graph, "Canteen", "Medical Center", 7, ROAD_NORMAL, 1);
    add_seed_road(graph, "Canteen", "Auditorium", 4, ROAD_NORMAL, 1);
    add_seed_road(graph, "Auditorium", "Sports Ground", 5, ROAD_NORMAL, 1);
    add_seed_road(graph, "Parking Area", "Main Gate", 3, ROAD_NORMAL, 1);
    add_seed_road(graph, "Parking Area", "Hostel", 6, ROAD_NORMAL, 1);
    add_seed_road(graph, "Hostel", "Medical Center", 4, ROAD_NORMAL, 1);
    add_seed_road(graph, "Block B", "Auditorium", 6, ROAD_EMERGENCY_ONLY, 1);
    add_seed_road(graph, "Sports Ground", "Hostel", 8, ROAD_NORMAL, 1);
    return 1;
}

static void calculate_route(Graph *graph, RouteHistory *history, int emergency_mode)
{
    int start = ask_location(graph, "Start location: ");
    int destination;
    RouteResult route;
    if (start < 0) {
        return;
    }
    destination = ask_location(graph, "Destination: ");
    if (destination < 0) {
        return;
    }
    if (start == destination) {
        puts("Start and destination must be different locations.");
        return;
    }
    if (!dijkstra_find_route(graph, start, destination, emergency_mode, &route)) {
        puts(emergency_mode
                 ? "No emergency-available route exists between those locations."
                 : "No ordinary route exists between those locations.");
        return;
    }
    dijkstra_display_route(graph, &route, emergency_mode);
    if (!history_add(history, &route, emergency_mode)) {
        puts("Warning: route found, but it could not be added to history.");
    }
}

static void add_location(Graph *graph)
{
    char name[INPUT_LENGTH];
    size_t length;
    if (!read_line("New location name: ", name, sizeof(name))) {
        return;
    }
    length = strlen(name);
    if (length == 0 || length >= LOCATION_NAME_LENGTH) {
        printf("Name must contain 1 to %d characters.\n", LOCATION_NAME_LENGTH - 1);
    } else if (graph_find_location(graph, name) >= 0) {
        puts("That location already exists (names are case-insensitive).");
    } else if (!graph_add_location(graph, name)) {
        puts("Could not add the location; the graph may be full.");
    } else {
        printf("Added location: %s\n", name);
    }
}

static void add_road(Graph *graph)
{
    int source;
    int destination;
    int minutes;
    int emergency_available;
    RoadStatus status;
    if (!ask_road_endpoints(graph, &source, &destination)) {
        return;
    }
    if (graph_road_exists(graph, source, destination)) {
        puts("That road already exists. Use Update Road Distance to change its time.");
        return;
    }
    for (;;) {
        if (!read_integer("Travel time in minutes: ", &minutes)) {
            return;
        }
        if (minutes > 0) {
            break;
        }
        puts("Travel time must be a positive number.");
    }
    if (!read_status(&status) ||
        !read_integer("Emergency available? (1 = yes, 0 = no): ",
                      &emergency_available)) {
        return;
    }
    while (emergency_available != 0 && emergency_available != 1) {
        puts("Enter 1 for yes or 0 for no.");
        if (!read_integer("Emergency available? (1 = yes, 0 = no): ",
                          &emergency_available)) {
            return;
        }
    }
    if (graph_add_road(graph, source, destination, minutes, status,
                       emergency_available)) {
        puts("Road added in both directions.");
    } else {
        puts("Could not add the road (check the graph capacity and values).");
    }
}

static void remove_road(Graph *graph)
{
    int source;
    int destination;
    if (!ask_road_endpoints(graph, &source, &destination)) {
        return;
    }
    if (graph_remove_road(graph, source, destination)) {
        puts("Road removed in both directions.");
    } else {
        puts("No road exists between those locations.");
    }
}

static void update_road(Graph *graph)
{
    int source;
    int destination;
    int minutes;
    if (!ask_road_endpoints(graph, &source, &destination)) {
        return;
    }
    if (!graph_road_exists(graph, source, destination)) {
        puts("No road exists between those locations.");
        return;
    }
    for (;;) {
        if (!read_integer("New travel time in minutes: ", &minutes)) {
            return;
        }
        if (minutes > 0) {
            break;
        }
        puts("Travel time must be a positive number.");
    }
    if (graph_update_road(graph, source, destination, minutes)) {
        puts("Road time updated in both directions.");
    } else {
        puts("Could not update the road.");
    }
}

static void search_location(const Graph *graph)
{
    char name[INPUT_LENGTH];
    int location;
    if (!read_line("Location name to search: ", name, sizeof(name))) {
        return;
    }
    location = search_find_location(graph, name);
    if (location < 0) {
        printf("Location '%s' was not found.\n", name);
    } else {
        search_display_location(graph, location);
    }
}

static void display_sorted_roads(const Graph *graph)
{
    RoadInfo roads[MAX_ROADS];
    int count = graph_collect_roads(graph, roads, MAX_ROADS);
    int index;
    sort_roads_by_distance(roads, (size_t)count);
    printf("\nROADS SORTED BY DISTANCE (insertion sort)\n");
    printf("%-24s %-24s %8s  %-16s\n", "From", "To", "Minutes", "Status");
    for (index = 0; index < count; index++) {
        printf("%-24s %-24s %8d  %-16s\n",
               graph->locations[roads[index].source].name,
               graph->locations[roads[index].destination].name,
               roads[index].minutes, road_status_name(roads[index].status));
    }
    if (count == 0) {
        puts("No roads have been added.");
    }
}

static void display_safe_roads(const Graph *graph)
{
    RoadInfo roads[MAX_ROADS];
    int count = graph_collect_roads(graph, roads, MAX_ROADS);
    int index;
    printf("\nEMERGENCY-SAFE ROADS\n");
    for (index = 0; index < count; index++) {
        if (roads[index].status != ROAD_BLOCKED && roads[index].emergency_available) {
            printf("%s <-> %s: %d min [%s]\n",
                   graph->locations[roads[index].source].name,
                   graph->locations[roads[index].destination].name,
                   roads[index].minutes, road_status_name(roads[index].status));
        }
    }
}

static void display_dashboard(const Graph *graph, const RouteHistory *history)
{
    RoadInfo roads[MAX_ROADS];
    int road_count = graph_collect_roads(graph, roads, MAX_ROADS);
    int emergency_safe = 0;
    int blocked = 0;
    int crowded = 0;
    int emergency_only = 0;
    int history_count = 0;
    int index;
    const RouteRecord *record;

    for (index = 0; index < road_count; index++) {
        if (roads[index].status == ROAD_BLOCKED) {
            blocked++;
        }
        if (roads[index].status == ROAD_CROWDED) {
            crowded++;
        }
        if (roads[index].status == ROAD_EMERGENCY_ONLY) {
            emergency_only++;
        }
        if (roads[index].status != ROAD_BLOCKED &&
            roads[index].emergency_available) {
            emergency_safe++;
        }
    }
    for (record = history->head; record != NULL; record = record->next) {
        history_count++;
    }

    puts("\n+------------------------------------------------------------+");
    puts("|             SMART CAMPUS NAVIGATION DASHBOARD             |");
    puts("+------------------------------------------------------------+");
    printf("| Locations: %-3d | Roads: %-4d | Routes calculated: %-4d   |\n",
           graph->count, road_count, history_count);
    printf("| Emergency-safe roads: %-3d | Blocked: %-3d | Crowded: %-3d  |\n",
           emergency_safe, blocked, crowded);
    printf("| Emergency-only roads: %-3d                                 |\n",
           emergency_only);
    if (history->tail != NULL) {
        int start = history->tail->locations[0];
        int destination = history->tail->locations[history->tail->count - 1];
         printf("| Latest: %s route, %d min\n",
             history->tail->emergency_mode ? "Emergency" : "Shortest",
             history->tail->total_minutes);
         printf("| Path: %s -> %s\n",
               graph->locations[start].name,
             graph->locations[destination].name);
         printf("| Time: %.19s |\n", history->tail->timestamp);
    } else {
         puts("| Latest: No route calculated this session yet.          |");
    }
    puts("+------------------------------------------------------------+");
}

static void display_menu(const Graph *graph, const RouteHistory *history)
{
    display_dashboard(graph, history);
    puts("MENU");
    puts(" 1. Display Campus Locations");
    puts(" 2. Display Campus Map");
    puts(" 3. Find Shortest Route");
    puts(" 4. Find Emergency Route");
    puts(" 5. Add New Location");
    puts(" 6. Add New Road");
    puts(" 7. Remove Road");
    puts(" 8. Update Road Distance");
    puts(" 9. Search Location");
    puts("10. Display Nearby Locations");
    puts("11. Display All Routes");
    puts("12. Sort Roads by Distance");
    puts("13. Show Emergency/Safe Routes");
    puts("14. View Route History");
    puts("15. Exit");
}

int main(void)
{
    Graph graph;
    RouteHistory history;
    int choice;
    if (!initialize_campus(&graph)) {
        fputs("Could not initialize the campus graph.\n", stderr);
        graph_free(&graph);
        return EXIT_FAILURE;
    }
    history_init(&history);
    puts("Welcome to Smart Campus Navigation & Emergency Route Finder.");
    for (;;) {
        display_menu(&graph, &history);
        if (!read_integer("Enter your choice: ", &choice)) {
            puts("\nInput ended. Exiting.");
            break;
        }
        switch (choice) {
        case 1:
            graph_display_locations(&graph);
            break;
        case 2:
        case 11:
            graph_display_map(&graph);
            break;
        case 3:
            calculate_route(&graph, &history, 0);
            break;
        case 4:
            calculate_route(&graph, &history, 1);
            break;
        case 5:
            add_location(&graph);
            break;
        case 6:
            add_road(&graph);
            break;
        case 7:
            remove_road(&graph);
            break;
        case 8:
            update_road(&graph);
            break;
        case 9:
            search_location(&graph);
            break;
        case 10: {
            int start = ask_location(&graph, "Starting location: ");
            if (start >= 0) {
                bfs_display_reachable(&graph, start);
            }
            break;
        }
        case 12:
            display_sorted_roads(&graph);
            break;
        case 13:
            display_safe_roads(&graph);
            break;
        case 14:
            history_display(&history, &graph);
            break;
        case 15:
            puts("Goodbye.");
            history_free(&history);
            graph_free(&graph);
            return EXIT_SUCCESS;
        default:
            puts("Invalid menu option. Enter a number from 1 to 15.");
            break;
        }
    }
    history_free(&history);
    graph_free(&graph);
    return EXIT_SUCCESS;
}