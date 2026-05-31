import { describe, expect, it } from '@jest/globals';
import {
  BOARD_EXCLUDED_GRID_KEYS,
  BOARD_MOVEMENT_CONNECTIONS,
  BOARD_MOVEMENT_NODE_PICK_RADIUS,
  BOARD_MOVEMENT_NODES,
  BOARD_MOVEMENT_POSITION_TOLERANCE,
  BOARD_ROOM_DOOR_COORDINATES,
  BOARD_ROOM_FOOTPRINT_GRID_KEYS,
  BOARD_GRID_COLUMNS_PERCENT,
  BOARD_GRID_ROWS_PERCENT,
  findBoardMovementNodeByPosition,
  getRoomEntryNodeByDoorNodeId,
  type BoardGridCoordinate,
} from '../src/lib/boardGraph.js';
import {
  getReachableMoveNodes,
  resolveCommittedMoveTargetNode,
} from '../src/lib/sessionMovement.js';

function gridKey(col: number, row: number) {
  return `${col}:${row}`;
}

describe('SCRUM-112 · Matriz de validación de movimientos', () => {

  // ─── Grupo 1: Colisiones con muros ─────────────────────────────────────────

  describe('colisiones con muros', () => {
    it('ningún nodo square tiene gridPosition en una celda de muro excluida', () => {
      const violations: string[] = [];

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (node.kind !== 'square' || !node.gridPosition) return;

        const key = gridKey(node.gridPosition.col, node.gridPosition.row);
        if (BOARD_EXCLUDED_GRID_KEYS.has(key)) {
          violations.push(`${node.id} (col=${node.gridPosition.col}, row=${node.gridPosition.row})`);
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('ninguna conexión pasa por un nodo de muro excluido', () => {
      const violations: string[] = [];

      Object.entries(BOARD_MOVEMENT_CONNECTIONS).forEach(([nodeId, neighbors]) => {
        neighbors.forEach((neighborId) => {
          const neighbor = BOARD_MOVEMENT_NODES[neighborId];
          if (!neighbor?.gridPosition) return;

          const key = gridKey(neighbor.gridPosition.col, neighbor.gridPosition.row);
          if (BOARD_EXCLUDED_GRID_KEYS.has(key)) {
            violations.push(`${nodeId} → ${neighborId}`);
          }
        });
      });

      expect(violations).toHaveLength(0);
    });

    it('los muros del pasillo central no existen en el grafo (col 8, filas 2-3)', () => {
      // Zona de muro conocida: columna 8, filas 2 y 3.
      const wallCells: BoardGridCoordinate[] = [
        { col: 8, row: 2 }, { col: 8, row: 3 },
      ];

      wallCells.forEach(({ col, row }) => {
        const key = gridKey(col, row);
        expect(BOARD_EXCLUDED_GRID_KEYS.has(key)).toBe(true);
        const squaresAtCell = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) => n.kind === 'square' && n.gridPosition?.col === col && n.gridPosition?.row === row
        );
        expect(squaresAtCell).toHaveLength(0);
      });
    });

    it('los muros de la zona central no existen en el grafo (col 10, filas 4-5)', () => {
      const wallCells: BoardGridCoordinate[] = [
        { col: 10, row: 4 }, { col: 10, row: 5 },
      ];

      wallCells.forEach(({ col, row }) => {
        const key = gridKey(col, row);
        expect(BOARD_EXCLUDED_GRID_KEYS.has(key)).toBe(true);
        const squaresAtCell = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) => n.kind === 'square' && n.gridPosition?.col === col && n.gridPosition?.row === row
        );
        expect(squaresAtCell).toHaveLength(0);
      });
    });

    it('los muros de pasillos laterales (col 15, filas 9-11 y 13-14) no existen en el grafo', () => {
      const wallCells: BoardGridCoordinate[] = [
        { col: 15, row: 9 }, { col: 15, row: 10 }, { col: 15, row: 11 },
        { col: 15, row: 13 }, { col: 15, row: 14 },
      ];

      wallCells.forEach(({ col, row }) => {
        const squaresAtCell = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) => n.kind === 'square' && n.gridPosition?.col === col && n.gridPosition?.row === row
        );
        expect(squaresAtCell).toHaveLength(0);
      });
    });

    it('el corredor derecho (col 20, filas 7-8) forma parte del grafo tras eliminar pasillo-derecho-central', () => {
      // Col 20 filas 9-11 eran intermedios explícitos del corredor hacia pasillo-derecho-central (ya eliminado)
      for (let row = 9; row <= 11; row++) {
        const corridorSquares = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) => n.kind === 'square' && n.gridPosition?.col === 20 && n.gridPosition?.row === row
        );
        expect(corridorSquares.length).toBe(0);
      }
      // pasillo-derecho-central ha sido eliminado
      expect(BOARD_MOVEMENT_NODES['pasillo-derecho-central']).toBeUndefined();
      // pasillo-derecho-superior solo conecta con spawn-amarillo y el corredor hacia pasillo-superior-derecho
      const neighborIds = BOARD_MOVEMENT_CONNECTIONS['pasillo-derecho-superior'] ?? [];
      expect(neighborIds).toContain('spawn-amarillo');
      expect(neighborIds).not.toContain('pasillo-derecho-central');
    });

    it('ninguna celda excluida tiene conexiones en el grafo', () => {
      BOARD_EXCLUDED_GRID_KEYS.forEach((key) => {
        const [rawCol = '0', rawRow = '0'] = key.split(':');
        const col = Number.parseInt(rawCol, 10);
        const row = Number.parseInt(rawRow, 10);

        const nodesAtCell = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) => n.gridPosition?.col === col && n.gridPosition?.row === row
        );

        nodesAtCell.forEach((node) => {
          const connections = BOARD_MOVEMENT_CONNECTIONS[node.id] ?? [];
          expect(connections).toHaveLength(0);
        });
      });
    });
  });

  // ─── Grupo 2: Aislamiento del footprint de sala ─────────────────────────────

  describe('aislamiento del footprint de sala', () => {
    it('ningún nodo square tiene gridPosition dentro del footprint de una sala', () => {
      const violations: string[] = [];

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (node.kind !== 'square' || !node.gridPosition) return;

        const key = gridKey(node.gridPosition.col, node.gridPosition.row);
        if (BOARD_ROOM_FOOTPRINT_GRID_KEYS.has(key)) {
          violations.push(`${node.id} en footprint de sala (col=${node.gridPosition.col}, row=${node.gridPosition.row})`);
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('ningún nodo spawn tiene gridPosition dentro del footprint de una sala', () => {
      const violations: string[] = [];

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (node.kind !== 'spawn' || !node.gridPosition) return;

        const key = gridKey(node.gridPosition.col, node.gridPosition.row);
        if (BOARD_ROOM_FOOTPRINT_GRID_KEYS.has(key)) {
          violations.push(`${node.id} spawn dentro de footprint de sala`);
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('los footprints de sala están completamente libres de nodos transitables', () => {
      BOARD_ROOM_FOOTPRINT_GRID_KEYS.forEach((key) => {
        const [rawCol = '0', rawRow = '0'] = key.split(':');
        const col = Number.parseInt(rawCol, 10);
        const row = Number.parseInt(rawRow, 10);

        const traversableNodes = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) =>
            n.kind !== 'room' &&
            n.gridPosition?.col === col &&
            n.gridPosition?.row === row
        );

        expect(traversableNodes).toHaveLength(0);
      });
    });

    it('las celdas del footprint de sala-superior-izquierda (cols 0-4, filas 0-3) están libre de squares', () => {
      for (let col = 0; col <= 4; col++) {
        for (let row = 0; row <= 3; row++) {
          const squaresAtCell = Object.values(BOARD_MOVEMENT_NODES).filter(
            (n) => n.kind === 'square' && n.gridPosition?.col === col && n.gridPosition?.row === row
          );
          expect(squaresAtCell).toHaveLength(0);
        }
      }
    });

    it('las celdas del footprint de sala-inferior-derecha (cols 18-21, filas 19-24) están libres de squares', () => {
      for (let col = 18; col <= 21; col++) {
        for (let row = 19; row <= 24; row++) {
          const squaresAtCell = Object.values(BOARD_MOVEMENT_NODES).filter(
            (n) => n.kind === 'square' && n.gridPosition?.col === col && n.gridPosition?.row === row
          );
          expect(squaresAtCell).toHaveLength(0);
        }
      }
    });
  });

  // ─── Grupo 3: Unicidad de posiciones de cuadrícula ──────────────────────────

  describe('unicidad de posiciones de cuadrícula', () => {
    it('no existen dos nodos square:grid: en la misma celda de cuadrícula', () => {
      // Los nodos de arista explícita (square:A::B:N) pueden coincidir en posición con nodos
      // base nombrados (ej. centro-norte y square:...::...:3 en la misma celda). Esto es
      // intencional: buildPreferredSquareNodeIdByGridKey elige cuál usar en las conexiones
      // ortogonales. Solo verificamos que los nodos IMAGE_ALIGNED (square:grid:) sean únicos.
      const gridKeyToNodeIds = new Map<string, string[]>();

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (node.kind !== 'square' || !node.gridPosition) return;
        if (!node.id.startsWith('square:grid:')) return;

        const key = gridKey(node.gridPosition.col, node.gridPosition.row);
        const existing = gridKeyToNodeIds.get(key) ?? [];
        existing.push(node.id);
        gridKeyToNodeIds.set(key, existing);
      });

      const duplicates: string[] = [];
      gridKeyToNodeIds.forEach((nodeIds, key) => {
        if (nodeIds.length > 1) {
          duplicates.push(`${key}: [${nodeIds.join(', ')}]`);
        }
      });

      expect(duplicates).toHaveLength(0);
    });

    it('no existen dos nodos spawn en la misma celda de cuadrícula', () => {
      const gridKeyToNodeIds = new Map<string, string[]>();

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (node.kind !== 'spawn' || !node.gridPosition) return;

        const key = gridKey(node.gridPosition.col, node.gridPosition.row);
        const existing = gridKeyToNodeIds.get(key) ?? [];
        existing.push(node.id);
        gridKeyToNodeIds.set(key, existing);
      });

      const duplicates: string[] = [];
      gridKeyToNodeIds.forEach((nodeIds, key) => {
        if (nodeIds.length > 1) {
          duplicates.push(`${key}: [${nodeIds.join(', ')}]`);
        }
      });

      expect(duplicates).toHaveLength(0);
    });
  });

  // ─── Grupo 4: Matriz completa de movimientos ────────────────────────────────

  describe('matriz completa de movimientos', () => {
    it('todos los destinos de getReachableMoveNodes son nodos válidos del grafo', () => {
      const violations: string[] = [];

      Object.keys(BOARD_MOVEMENT_NODES).forEach((startNodeId) => {
        for (let dice = 1; dice <= 12; dice++) {
          const destinations = getReachableMoveNodes(startNodeId, [], dice);

          destinations.forEach((dest) => {
            if (!BOARD_MOVEMENT_NODES[dest.id]) {
              violations.push(`Desde ${startNodeId} con tirada ${dice}: destino inválido ${dest.id}`);
            }
          });
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('ningún destino de getReachableMoveNodes es de tipo room', () => {
      const violations: string[] = [];

      Object.keys(BOARD_MOVEMENT_NODES).forEach((startNodeId) => {
        for (let dice = 1; dice <= 12; dice++) {
          const destinations = getReachableMoveNodes(startNodeId, [], dice);

          destinations.forEach((dest) => {
            if (dest.kind === 'room') {
              violations.push(`Desde ${startNodeId} con tirada ${dice}: sala ${dest.id} como destino directo`);
            }
          });
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('todos los destinos tienen stepsRequired válido para la tirada', () => {
      const violations: string[] = [];

      Object.keys(BOARD_MOVEMENT_NODES).forEach((startNodeId) => {
        for (let dice = 1; dice <= 12; dice++) {
          const destinations = getReachableMoveNodes(startNodeId, [], dice);

          destinations.forEach((dest) => {
            const steps = dest.stepsRequired ?? -1;
            // Las puertas de sala son destino válido con cualquier tirada >= su distancia (BFS relajado).
            // El resto de nodos deben estar exactamente a `dice` pasos.
            const isDoor = dest.kind === 'square' && Boolean(getRoomEntryNodeByDoorNodeId(dest.id));
            const valid = isDoor ? steps <= dice : steps === dice;
            if (!valid) {
              violations.push(
                `Desde ${startNodeId} con tirada ${dice}: ${dest.id} tiene stepsRequired=${dest.stepsRequired}`
              );
            }
          });
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('ningún destino tiene gridPosition en una celda de muro excluida', () => {
      const violations: string[] = [];

      Object.keys(BOARD_MOVEMENT_NODES).forEach((startNodeId) => {
        for (let dice = 1; dice <= 12; dice++) {
          const destinations = getReachableMoveNodes(startNodeId, [], dice);

          destinations.forEach((dest) => {
            if (!dest.gridPosition) return;
            const key = gridKey(dest.gridPosition.col, dest.gridPosition.row);
            if (BOARD_EXCLUDED_GRID_KEYS.has(key)) {
              violations.push(`Desde ${startNodeId} con tirada ${dice}: destino ${dest.id} en muro`);
            }
          });
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('ningún destino tiene gridPosition dentro del footprint de una sala', () => {
      const violations: string[] = [];

      Object.keys(BOARD_MOVEMENT_NODES).forEach((startNodeId) => {
        for (let dice = 1; dice <= 12; dice++) {
          const destinations = getReachableMoveNodes(startNodeId, [], dice);

          destinations.forEach((dest) => {
            if (!dest.gridPosition) return;
            const key = gridKey(dest.gridPosition.col, dest.gridPosition.row);
            if (BOARD_ROOM_FOOTPRINT_GRID_KEYS.has(key)) {
              violations.push(
                `Desde ${startNodeId} con tirada ${dice}: destino ${dest.id} dentro de footprint de sala`
              );
            }
          });
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('con tirada máxima (12) desde cada spawn al menos un destino es alcanzable', () => {
      const spawnNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'spawn');

      spawnNodes.forEach((spawnNode) => {
        const destinations = getReachableMoveNodes(spawnNode.id, [], 12);
        expect(destinations.length).toBeGreaterThan(0);
      });
    });

    it('con tirada mínima (1) desde cada sala se pueden alcanzar sus puertas', () => {
      const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'room');

      roomNodes.forEach((roomNode) => {
        const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? []).filter(
          (id) => BOARD_MOVEMENT_NODES[id]?.kind === 'square'
        );

        const destinations = getReachableMoveNodes(roomNode.id, [], 1).map((n) => n.id);

        doorNodeIds.forEach((doorNodeId) => {
          expect(destinations).toContain(doorNodeId);
        });
      });
    });

    it('con tirada 1 desde cada sala los únicos destinos son puertas o salas conectadas por pasadizo', () => {
      const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'room');

      roomNodes.forEach((roomNode) => {
        const doorNodeIds = new Set(
          (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? []).filter(
            (id) => BOARD_MOVEMENT_NODES[id]?.kind === 'square'
          )
        );

        const destinations = getReachableMoveNodes(roomNode.id, [], 1);

        destinations.forEach((dest) => {
          const isPassage = dest.kind === 'room';
          const isDoor = doorNodeIds.has(dest.id);
          expect(isPassage || isDoor).toBe(true);
        });
      });
    });

    it('los destinos con tirada 2 desde una sala incluyen casillas exteriores a la puerta', () => {
      const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'room');

      roomNodes.forEach((roomNode) => {
        const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? []).filter(
          (id) => BOARD_MOVEMENT_NODES[id]?.kind === 'square'
        );
        const doorNodeIdSet = new Set(doorNodeIds);

        // Las casillas exteriores son vecinos de las puertas que no son la sala ni otra puerta
        // de la misma sala (las otras puertas se alcanzan en 1 paso, no en 2, por la BFS).
        const exteriorNodeIds = new Set(
          doorNodeIds.flatMap((doorId) =>
            (BOARD_MOVEMENT_CONNECTIONS[doorId] ?? []).filter(
              (id) =>
                id !== roomNode.id &&
                !doorNodeIdSet.has(id) &&
                BOARD_MOVEMENT_NODES[id]?.kind === 'square'
            )
          )
        );

        if (exteriorNodeIds.size === 0) return;

        const destinations2 = getReachableMoveNodes(roomNode.id, [], 2).map((n) => n.id);

        exteriorNodeIds.forEach((extId) => {
          expect(destinations2).toContain(extId);
        });
      });
    });
  });

  // ─── Grupo 5: Acceso exclusivo a salas por puertas ──────────────────────────

  describe('acceso exclusivo a salas por puertas', () => {
    it('cada sala solo tiene conexiones directas hacia sus puertas definidas y pasadizos', () => {
      Object.entries(BOARD_ROOM_DOOR_COORDINATES).forEach(([roomNodeId, doorCoords]) => {
        const linkedNodeIds = BOARD_MOVEMENT_CONNECTIONS[roomNodeId] ?? [];

        const linkedSquareNodes = linkedNodeIds
          .map((id) => BOARD_MOVEMENT_NODES[id])
          .filter((n) => n?.kind === 'square');

        expect(linkedSquareNodes.length).toBe(doorCoords.length);

        linkedSquareNodes.forEach((doorNode) => {
          if (!doorNode?.gridPosition) return;

          const isDeclaredDoor = doorCoords.some(
            (coord) => coord.col === doorNode.gridPosition!.col && coord.row === doorNode.gridPosition!.row
          );
          expect(isDeclaredDoor).toBe(true);
        });
      });
    });

    it('cada nodo puerta conecta exactamente con su sala', () => {
      Object.entries(BOARD_ROOM_DOOR_COORDINATES).forEach(([roomNodeId, doorCoords]) => {
        doorCoords.forEach((coord) => {
          const doorGridKey = gridKey(coord.col, coord.row);

          const doorNode = Object.values(BOARD_MOVEMENT_NODES).find(
            (n) => n.kind === 'square' && n.gridPosition &&
              gridKey(n.gridPosition.col, n.gridPosition.row) === doorGridKey
          );

          expect(doorNode).toBeDefined();

          if (!doorNode) return;

          const doorConnections = BOARD_MOVEMENT_CONNECTIONS[doorNode.id] ?? [];
          expect(doorConnections).toContain(roomNodeId);

          const roomConnectionsOfDoor = doorConnections.filter(
            (id) => BOARD_MOVEMENT_NODES[id]?.kind === 'room'
          );
          expect(roomConnectionsOfDoor).toHaveLength(1);
          expect(roomConnectionsOfDoor[0]).toBe(roomNodeId);
        });
      });
    });

    it('getRoomEntryNodeByDoorNodeId resuelve correctamente todas las puertas declaradas', () => {
      Object.entries(BOARD_ROOM_DOOR_COORDINATES).forEach(([roomNodeId, doorCoords]) => {
        doorCoords.forEach((coord) => {
          const doorGridKey = gridKey(coord.col, coord.row);

          const doorNode = Object.values(BOARD_MOVEMENT_NODES).find(
            (n) => n.kind === 'square' && n.gridPosition &&
              gridKey(n.gridPosition.col, n.gridPosition.row) === doorGridKey
          );

          if (!doorNode) return;

          const resolvedRoom = getRoomEntryNodeByDoorNodeId(doorNode.id);
          expect(resolvedRoom).toBeDefined();
          expect(resolvedRoom?.id).toBe(roomNodeId);
          expect(resolvedRoom?.kind).toBe('room');
        });
      });
    });

    it('resolveCommittedMoveTargetNode resuelve a sala para todas las puertas declaradas', () => {
      Object.entries(BOARD_ROOM_DOOR_COORDINATES).forEach(([roomNodeId, doorCoords]) => {
        doorCoords.forEach((coord) => {
          const doorGridKey = gridKey(coord.col, coord.row);

          const doorNode = Object.values(BOARD_MOVEMENT_NODES).find(
            (n) => n.kind === 'square' && n.gridPosition &&
              gridKey(n.gridPosition.col, n.gridPosition.row) === doorGridKey
          );

          if (!doorNode) return;

          const corridorNeighbor = (BOARD_MOVEMENT_CONNECTIONS[doorNode.id] ?? [])
            .map((id) => BOARD_MOVEMENT_NODES[id])
            .find((n) => n?.kind === 'square');

          if (!corridorNeighbor) return;

          const resolvedTarget = resolveCommittedMoveTargetNode(corridorNeighbor, doorNode);

          expect(resolvedTarget.id).toBe(roomNodeId);
          expect(resolvedTarget.kind).toBe('room');
        });
      });
    });

    it('BFS desde cualquier casilla exterior nunca alcanza directamente una sala sin pasar por puerta', () => {
      const roomIds = new Set(
        Object.values(BOARD_MOVEMENT_NODES)
          .filter((n) => n.kind === 'room')
          .map((n) => n.id)
      );

      const doorNodeIds = new Set(
        Object.values(BOARD_MOVEMENT_NODES)
          .filter((n) => {
            if (n.kind !== 'square' || !n.gridPosition) return false;
            const key = gridKey(n.gridPosition.col, n.gridPosition.row);
            return Object.values(BOARD_ROOM_DOOR_COORDINATES).some((coords) =>
              coords.some((c) => gridKey(c.col, c.row) === key)
            );
          })
          .map((n) => n.id)
      );

      const nonDoorSquares = Object.values(BOARD_MOVEMENT_NODES).filter(
        (n) => n.kind === 'square' && !doorNodeIds.has(n.id)
      );

      nonDoorSquares.forEach((startNode) => {
        const directNeighbors = BOARD_MOVEMENT_CONNECTIONS[startNode.id] ?? [];

        directNeighbors.forEach((neighborId) => {
          if (roomIds.has(neighborId)) {
            expect(doorNodeIds.has(startNode.id)).toBe(true);
          }
        });
      });
    });

    it('ningún nodo exterior (no puerta) tiene conexión directa a una sala', () => {
      const roomIds = new Set(
        Object.values(BOARD_MOVEMENT_NODES)
          .filter((n) => n.kind === 'room')
          .map((n) => n.id)
      );

      const doorNodeIds = new Set(
        Object.values(BOARD_MOVEMENT_NODES).filter((n) => {
          if (n.kind !== 'square' || !n.gridPosition) return false;
          const key = gridKey(n.gridPosition.col, n.gridPosition.row);
          return Object.values(BOARD_ROOM_DOOR_COORDINATES).some((coords) =>
            coords.some((c) => gridKey(c.col, c.row) === key)
          );
        }).map((n) => n.id)
      );

      Object.entries(BOARD_MOVEMENT_CONNECTIONS).forEach(([nodeId, neighbors]) => {
        const node = BOARD_MOVEMENT_NODES[nodeId];
        if (!node || node.kind !== 'square' || doorNodeIds.has(nodeId)) return;

        neighbors.forEach((neighborId) => {
          expect(roomIds.has(neighborId)).toBe(false);
        });
      });
    });
  });

  // ─── Grupo 6: Áreas clicables ───────────────────────────────────────────────

  describe('áreas clicables', () => {
    it('cada nodo square tiene posición dentro de la tolerancia de su celda de cuadrícula', () => {
      const violations: string[] = [];

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (node.kind !== 'square' || !node.gridPosition) return;

        const expectedX = BOARD_GRID_COLUMNS_PERCENT[node.gridPosition.col];
        const expectedY = BOARD_GRID_ROWS_PERCENT[node.gridPosition.row];

        if (typeof expectedX !== 'number' || typeof expectedY !== 'number') return;

        const tolerance = BOARD_MOVEMENT_NODE_PICK_RADIUS.squarePercent * 2;
        const deltaX = Math.abs(node.positionX - expectedX);
        const deltaY = Math.abs(node.positionY - expectedY);

        if (deltaX > tolerance || deltaY > tolerance) {
          violations.push(
            `${node.id}: pos=(${node.positionX},${node.positionY}) esperado=(${expectedX},${expectedY}) Δ=(${deltaX.toFixed(2)},${deltaY.toFixed(2)})`
          );
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('cada nodo spawn tiene posición dentro del radio definido para spawn', () => {
      const violations: string[] = [];

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (node.kind !== 'spawn' || !node.gridPosition) return;

        const expectedX = BOARD_GRID_COLUMNS_PERCENT[node.gridPosition.col];
        const expectedY = BOARD_GRID_ROWS_PERCENT[node.gridPosition.row];

        if (typeof expectedX !== 'number' || typeof expectedY !== 'number') return;

        const tolerance = BOARD_MOVEMENT_NODE_PICK_RADIUS.spawnPercent * 2;
        const deltaX = Math.abs(node.positionX - expectedX);
        const deltaY = Math.abs(node.positionY - expectedY);

        if (deltaX > tolerance || deltaY > tolerance) {
          violations.push(
            `${node.id}: pos=(${node.positionX},${node.positionY}) esperado=(${expectedX},${expectedY}) Δ=(${deltaX.toFixed(2)},${deltaY.toFixed(2)})`
          );
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('el radio de clic de spawn es mayor o igual al de square', () => {
      expect(BOARD_MOVEMENT_NODE_PICK_RADIUS.spawnPercent).toBeGreaterThanOrEqual(
        BOARD_MOVEMENT_NODE_PICK_RADIUS.squarePercent
      );
    });

    it('el radio de clic de sala en anchura cubre al menos dos celdas de cuadrícula', () => {
      const avgColWidth = (BOARD_GRID_COLUMNS_PERCENT[1]! - BOARD_GRID_COLUMNS_PERCENT[0]!);
      expect(BOARD_MOVEMENT_NODE_PICK_RADIUS.roomWidthPercent).toBeGreaterThan(avgColWidth * 2);
    });

    it('el radio de clic de sala en altura cubre al menos dos celdas de cuadrícula', () => {
      const avgRowHeight = (BOARD_GRID_ROWS_PERCENT[1]! - BOARD_GRID_ROWS_PERCENT[0]!);
      expect(BOARD_MOVEMENT_NODE_PICK_RADIUS.roomHeightPercent).toBeGreaterThan(avgRowHeight * 2);
    });

    it('findBoardMovementNodeByPosition resuelve el centro exacto de cada nodo del grafo', () => {
      const violations: string[] = [];

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        const resolved = findBoardMovementNodeByPosition(node.positionX, node.positionY);

        if (!resolved) {
          violations.push(`${node.id}: posición (${node.positionX},${node.positionY}) no resuelve ningún nodo`);
          return;
        }

        if (resolved.id !== node.id && resolved.kind !== 'room') {
          violations.push(
            `${node.id}: posición (${node.positionX},${node.positionY}) resuelve ${resolved.id} en lugar de ${node.id}`
          );
        }
      });

      expect(violations).toHaveLength(0);
    });

    it('BOARD_MOVEMENT_POSITION_TOLERANCE es menor que la distancia mínima entre nodos adyacentes', () => {
      let minDistance = Number.POSITIVE_INFINITY;

      Object.entries(BOARD_MOVEMENT_CONNECTIONS).forEach(([nodeId, neighbors]) => {
        const nodeA = BOARD_MOVEMENT_NODES[nodeId];
        if (!nodeA) return;

        neighbors.forEach((neighborId) => {
          const nodeB = BOARD_MOVEMENT_NODES[neighborId];
          if (!nodeB) return;

          const distance = Math.hypot(nodeA.positionX - nodeB.positionX, nodeA.positionY - nodeB.positionY);
          if (distance > 0) {
            minDistance = Math.min(minDistance, distance);
          }
        });
      });

      expect(BOARD_MOVEMENT_POSITION_TOLERANCE).toBeLessThan(minDistance);
    });
  });

  // ─── Grupo 7: Integridad estructural del grafo ──────────────────────────────

  describe('integridad estructural del grafo', () => {
    it('el grafo tiene exactamente 9 salas', () => {
      const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'room');
      expect(roomNodes).toHaveLength(9);
    });

    it('el grafo tiene exactamente 6 spawns', () => {
      const spawnNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'spawn');
      expect(spawnNodes).toHaveLength(6);
    });

    it('el grafo tiene más de 100 nodos square (tablero suficientemente granular)', () => {
      const squareNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'square');
      expect(squareNodes.length).toBeGreaterThan(100);
    });

    it('las 9 salas están todas en BOARD_ROOM_DOOR_COORDINATES', () => {
      const roomIds = Object.values(BOARD_MOVEMENT_NODES)
        .filter((n) => n.kind === 'room')
        .map((n) => n.id);

      roomIds.forEach((roomId) => {
        expect(BOARD_ROOM_DOOR_COORDINATES[roomId]).toBeDefined();
        expect(BOARD_ROOM_DOOR_COORDINATES[roomId]!.length).toBeGreaterThan(0);
      });
    });

    it('el total de puertas en BOARD_ROOM_DOOR_COORDINATES coincide con las conexiones del grafo', () => {
      Object.entries(BOARD_ROOM_DOOR_COORDINATES).forEach(([roomId, coords]) => {
        const squareConnections = (BOARD_MOVEMENT_CONNECTIONS[roomId] ?? []).filter(
          (id) => BOARD_MOVEMENT_NODES[id]?.kind === 'square'
        );
        expect(squareConnections.length).toBe(coords.length);
      });
    });

    it('todas las posiciones de nodos son valores numéricos finitos entre 0 y 100', () => {
      const violations: string[] = [];

      Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
        if (
          !Number.isFinite(node.positionX) ||
          !Number.isFinite(node.positionY) ||
          node.positionX < 0 || node.positionX > 100 ||
          node.positionY < 0 || node.positionY > 100
        ) {
          violations.push(`${node.id}: pos=(${node.positionX},${node.positionY})`);
        }
      });

      expect(violations).toHaveLength(0);
    });
  });

  // ─── Grupo 8: Zona amarilla y corredor derecho (regresión) ────────────────

  describe('zona amarilla y corredor derecho', () => {
    it('spawn-amarillo existe y no tiene nodo square duplicado en la misma celda de grid (22,7)', () => {
      const spawnAmarillo = BOARD_MOVEMENT_NODES['spawn-amarillo'];
      expect(spawnAmarillo).toBeDefined();
      expect(spawnAmarillo?.kind).toBe('spawn');

      const duplicateAtGrid = Object.values(BOARD_MOVEMENT_NODES).find(
        (n) => n.kind === 'square' && n.gridPosition?.col === 22 && n.gridPosition?.row === 7
      );
      expect(duplicateAtGrid).toBeUndefined();
    });

    it('findBoardMovementNodeByPosition con la posición de spawn-amarillo resuelve spawn-amarillo', () => {
      const spawnAmarillo = BOARD_MOVEMENT_NODES['spawn-amarillo'];
      expect(spawnAmarillo).toBeDefined();

      const resolved = findBoardMovementNodeByPosition(spawnAmarillo!.positionX, spawnAmarillo!.positionY);
      expect(resolved?.id).toBe('spawn-amarillo');
      expect(resolved?.kind).toBe('spawn');
    });

    it('pasillo-derecho-central y centro-este han sido eliminados del grafo', () => {
      expect(BOARD_MOVEMENT_NODES['pasillo-derecho-central']).toBeUndefined();
      expect(BOARD_MOVEMENT_NODES['centro-este']).toBeUndefined();
    });

    it('spawn-amarillo puede alcanzar sala-media-derecha a través del corredor derecho auto-conectado', () => {
      function bfsReachable(from: string, to: string): boolean {
        const visited = new Set([from]);
        const queue = [from];
        while (queue.length > 0) {
          const nodeId = queue.shift()!;
          if (nodeId === to) return true;
          for (const neighbor of (BOARD_MOVEMENT_CONNECTIONS[nodeId] ?? [])) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
        return false;
      }

      expect(bfsReachable('spawn-amarillo', 'sala-media-derecha')).toBe(true);
    });

    it('spawn-amarillo puede alcanzar spawn-blanco (corredor derecho completo navegable)', () => {
      function bfsReachable(from: string, to: string): boolean {
        const visited = new Set([from]);
        const queue = [from];
        while (queue.length > 0) {
          const nodeId = queue.shift()!;
          if (nodeId === to) return true;
          for (const neighbor of (BOARD_MOVEMENT_CONNECTIONS[nodeId] ?? [])) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
        return false;
      }

      expect(bfsReachable('spawn-amarillo', 'spawn-blanco')).toBe(true);
    });

    it('la puerta square:grid:15:12 de sala-media-derecha es accesible desde el corredor central', () => {
      const doorNode = BOARD_MOVEMENT_NODES['square:grid:15:12'];
      expect(doorNode).toBeDefined();
      expect(doorNode?.gridPosition).toEqual({ col: 15, row: 12 });
      const neighbors = BOARD_MOVEMENT_CONNECTIONS['square:grid:15:12'] ?? [];
      expect(neighbors).toContain('sala-media-derecha');
    });

    it('getReachableMoveNodes desde spawn-amarillo con tirada 1 a 6 devuelve destinos válidos del corredor', () => {
      for (let dice = 1; dice <= 6; dice++) {
        const destinations = getReachableMoveNodes('spawn-amarillo', [], dice);
        expect(destinations.length).toBeGreaterThan(0);

        destinations.forEach((dest) => {
          expect(dest.kind).not.toBe('room');

          if (dest.gridPosition) {
            const key = gridKey(dest.gridPosition.col, dest.gridPosition.row);
            expect(BOARD_EXCLUDED_GRID_KEYS.has(key)).toBe(false);
          }
        });
      }
    });

    it('ningún nodo huérfano del corredor derecho: col 20 filas 7-11 conectan con el resto del grafo', () => {
      const corridorNodes = Object.values(BOARD_MOVEMENT_NODES).filter(
        (n) => n.gridPosition?.col === 20 && n.gridPosition.row >= 7 && n.gridPosition.row <= 11
      );

      corridorNodes.forEach((corridorNode) => {
        const neighbors = BOARD_MOVEMENT_CONNECTIONS[corridorNode.id] ?? [];
        expect(neighbors.length).toBeGreaterThan(0);
      });
    });
  });
});
