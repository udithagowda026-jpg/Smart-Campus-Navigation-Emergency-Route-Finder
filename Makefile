CC = gcc
CFLAGS = -std=c11 -Wall -Wextra -pedantic -O2
SOURCES = main.c graph.c dijkstra.c bfs.c heap.c search.c sort.c history.c

all: campus.exe

campus.exe: $(SOURCES) graph.h dijkstra.h bfs.h heap.h search.h sort.h history.h
	$(CC) $(CFLAGS) $(SOURCES) -o campus.exe

clean:
	-del /Q campus.exe 2>NUL

.PHONY: all clean