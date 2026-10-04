#include "sort.h"

void sort_roads_by_distance(RoadInfo roads[], size_t count)
{
    size_t index;
    /* Insertion sort keeps the already-ordered prefix and inserts one road per pass. */
    for (index = 1; index < count; index++) {
        RoadInfo current = roads[index];
        size_t position = index;
        while (position > 0 && roads[position - 1].minutes > current.minutes) {
            roads[position] = roads[position - 1];
            position--;
        }
        roads[position] = current;
    }
}