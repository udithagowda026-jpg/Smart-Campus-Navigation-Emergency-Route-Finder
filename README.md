# Smart Campus Navigation & Emergency Route Finder

A menu-driven C console application that models a campus as a weighted, undirected graph. It finds shortest routes, avoids unsafe roads during emergencies, supports editing the map at runtime, and records route history.

## Features

- 14 sample campus locations, with support for adding up to 100 locations.
- Console dashboard with campus totals, road-status counts, and the latest route result.
- Standalone browser dashboard with an interactive campus graph and route planner.
- Browser routing profiles for standard, emergency, and step-free paths.
- Evacuation mode with risk-weighted routing and group-clearance estimates.
- Display locations, the campus map, and all direct road connections.
- Find ordinary and emergency routes with each road's travel time.
- Road status and emergency-availability controls; blocked roads are never routed.
- Add/remove roads and update their travel times.
- Case-insensitive location search, nearby-location BFS, safe-road listing, and distance sorting.
- Route history stored in a linked list with a timestamp.
- Input validation for menu choices, names, distances, statuses, and missing roads.

## DSA Concepts

| Concept | How it is used |
| --- | --- |
| Weighted graph and adjacency list | Each location is a vertex; each road is represented by linked adjacency nodes in both directions. |
| Linked list | Adjacency lists store roads; a separate linked list stores route history. |
| Min heap / priority queue | Dijkstra selects the next closest location efficiently. |
| Dijkstra and stack | Computes shortest paths; a stack reverses parent links to reconstruct the route. |
| Queue and BFS | Lists locations reachable from the selected location, in breadth-first order. |
| Hashing | Open-addressed hash table finds names quickly, using case-insensitive comparison. |
| Searching | Hash lookup locates a named vertex and its connected roads. |
| Sorting | Insertion sort orders unique roads from shortest to longest. |

## Project Structure

The workspace root is the project folder:

```text
Smart-Campus-Navigation/
├── main.c
├── graph.c / graph.h
├── dijkstra.c / dijkstra.h
├── bfs.c / bfs.h
├── heap.c / heap.h
├── search.c / search.h
├── sort.c / sort.h
├── history.c / history.h
├── dashboard.html
├── dashboard.css
├── dashboard.js
├── live-map.js
├── risk-model.js
├── Makefile
└── README.md
```

## Architecture

The workspace root contains the source files. `graph.c` owns the campus graph and location hash table. `dijkstra.c` uses `heap.c` for route calculation; `bfs.c` implements reachability. `search.c`, `sort.c`, and `history.c` provide focused operations, while `main.c` seeds the sample campus, handles input, and dispatches the menu.

The browser dashboard includes the sample graph and an optional real-world mode backed by OpenStreetMap. `risk-model.js` provides an explainable scenario heuristic for evacuation estimates; it is not a trained prediction model or live incident feed. The browser dashboard is not connected to the C program.

## Build and Run (Windows / VS Code)

Install GCC (for example, MinGW-w64/MSYS2) and ensure `gcc` is on `PATH`. Open this folder in VS Code, then open **Terminal > New Terminal**.

Build directly with GCC:

```powershell
gcc -std=c11 -Wall -Wextra -pedantic main.c graph.c dijkstra.c bfs.c heap.c search.c sort.c history.c -o campus.exe
```

Run in PowerShell:

```powershell
.\campus.exe
```

Alternatively, when `make` is installed:

```powershell
make
.\campus.exe
```

The program uses only the C standard library. No external packages are required.

## Browser Dashboard

The **Step-free** profile avoids ways tagged as stairs. **Evacuate** lets you set crowd pressure, incident severity, and group size, then shows a risk-adjusted route, predicted exposure, bottleneck, and clearance estimate. This is a scenario heuristic, not a trained AI model; validate all estimates against real campus data and emergency staff guidance.

Start a local server from the project folder, then open the dashboard URL:

```powershell
python -m http.server 8000 --bind 127.0.0.1
Start-Process http://127.0.0.1:8000/dashboard.html
```

Choose **Real-world map**, search for a campus/address or use the browser's location permission, and wait for nearby OpenStreetMap walking paths to load. Select each route endpoint, then click its point on the map. The route planner snaps points to mapped paths and calculates an estimated walking route. **Step-free** avoids ways tagged as stairs. This mode needs internet access and sends the searched place or approved coordinates to OpenStreetMap's public Nominatim and Overpass services. It has no live closure, crowd, or emergency-dispatch feed; evacuation predictions use only the entered scenario and road tags. The sample graph remains available offline, and neither mode reads or modifies the C program's in-memory graph.

## Menu

1. Display Campus Locations
2. Display Campus Map
3. Find Shortest Route
4. Find Emergency Route
5. Add New Location
6. Add New Road
7. Remove Road
8. Update Road Distance
9. Search Location
10. Display Nearby Locations
11. Display All Routes (direct road connections)
12. Sort Roads by Distance
13. Show Emergency/Safe Routes
14. View Route History
15. Exit

Locations and road endpoints are matched without regard to letter case. Normal routing accepts `NORMAL` and `CROWDED` roads, but not `BLOCKED` or `EMERGENCY_ONLY` roads. Emergency routing accepts any non-blocked road marked emergency-available, including `EMERGENCY_ONLY` roads. Among eligible roads it chooses the shortest-time route; crowded roads do not receive an artificial penalty. BFS shows ordinary passable roads (`NORMAL` and `CROWDED`).

## Sample Session

```text
Enter your choice: 3
Start location: Main Gate
Destination: AI Lab

SHORTEST ROUTE
Main Gate -> Block A -> Library -> AI Lab
Road distances:
	Main Gate -> Block A: 5 minutes
	Block A -> Library: 3 minutes
	Library -> AI Lab: 2 minutes
Total travel time: 10 minutes
```

For an emergency route from `Canteen` to `Medical Center`, the seeded direct road is 7 minutes. If that road is blocked or marked unavailable for emergencies, Dijkstra considers the remaining eligible paths instead.

## Algorithms and Complexity

Let $V$ be the number of locations and $E$ the number of undirected roads.

| Operation | Time | Extra space |
| --- | --- | --- |
| Dijkstra with binary min heap | $O((V+E)\log V)$ in the standard indexed-heap model; this implementation may enqueue duplicate improved entries, so its bound is $O((V+E)\log E)$ | $O(V+E)$ including the heap and graph |
| BFS | $O(V+E)$ | $O(V)$ |
| Location hash lookup | Average $O(1)$; worst-case $O(V)$ | $O(V)$ hash table |
| Insertion sort of roads | $O(E^2)$ worst case; $O(E)$ best case | $O(1)$ beyond the road array |
| Add/remove a road | $O(degree(u)+degree(v))$ | $O(1)$ per adjacency node |
| Route-history insertion | $O(1)$ | $O(V)$ per stored path record |

The campus has a fixed maximum of 100 locations and 4,950 unique roads. Each undirected road uses two adjacency nodes.

## Future Enhancements

- Load/save the campus graph from a file.
- Add a graphical map and GPS integration.
- Support one-way paths, accessibility constraints, and time-dependent traffic.
- Add a true safety score or crowding penalty to emergency route selection.
- Persist route history between runs.

## DSA Viva / Interview Questions

**Why use an adjacency list?** It stores only existing roads, so space is $O(V+E)$ rather than $O(V^2)$ for an adjacency matrix.

**Why use Dijkstra here?** Road travel times are non-negative, which is the condition needed for Dijkstra's shortest-path guarantee.

**Why use a min heap?** It retrieves the currently smallest tentative distance without scanning all locations on every iteration.

**How does emergency routing differ?** It filters out blocked and emergency-unavailable roads, while allowing emergency-only roads; it then minimizes total travel time among those eligible roads.

**Why reconstruct the result with a stack?** Parent links lead from the destination backward to the start. A stack reverses that order for forward route display.

**What does BFS tell us?** It discovers every location reachable over ordinary passable roads, visiting each location and adjacency edge at most once.

**What is a hash collision?** Different names mapping to the same table slot. This implementation resolves collisions by linear probing.

**Why insertion sort?** It is straightforward for a small list and performs well when data is already nearly ordered, though its worst-case time is quadratic.