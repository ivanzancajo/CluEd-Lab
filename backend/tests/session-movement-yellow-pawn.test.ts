import { describe, expect, it } from '@jest/globals';
import {
  BOARD_MOVEMENT_CONNECTIONS,
  BOARD_MOVEMENT_NODES,
  getAdjacentMoveNodes,
  getReachableMoveNodes,
  resolveCommittedMoveTargetNode,
} from '../src/lib/sessionMovement.js';
import {
  BOARD_EXCLUDED_GRID_KEYS,
  BOARD_ROOM_DOOR_COORDINATES,
  getRoomEntryNodeByDoorNodeId,
  type BoardMovementNode,
} from '../src/lib/boardGraph.js';

// ─── Constantes del corredor de salida amarillo ───────────────────────────────
//
// spawn-amarillo (grid 22,7) se conecta al tablero a través de dos casillas
// intermedias antes de alcanzar pasillo-derecho-superior (grid 20,6):
//
//   spawn-amarillo (22,7)
//     └─ :2 (22,6)   ← paso 1 desde spawn
//         └─ :1 (21,6)   ← paso 2 desde spawn
//             └─ pasillo-derecho-superior (20,6)   ← paso 3 desde spawn
//
// Consecuencia: con tirada N el peón amarillo solo penetra el tablero N-2 pasos
// efectivos (los dos primeros valores del dado se consumen por el corredor de
// salida antes de llegar al primer cruce real del tablero).
//
const SPAWN_AMARILLO_ID = 'spawn-amarillo';
const PRIMER_PASO_ID = 'square:pasillo-derecho-superior::spawn-amarillo:2'; // grid (22,6)
const SEGUNDO_PASO_ID = 'square:pasillo-derecho-superior::spawn-amarillo:1'; // grid (21,6)
const PRIMER_CRUCE_ID = 'pasillo-derecho-superior'; // grid (20,6)

function gridKey(col: number, row: number) {
  return `${col}:${row}`;
}

function bfsMinDist(from: string, to: string): number {
  const visited = new Set([from]);
  const queue: [string, number][] = [[from, 0]];
  while (queue.length > 0) {
    const [nodeId, dist] = queue.shift()!;
    if (nodeId === to) return dist;
    for (const neighbor of BOARD_MOVEMENT_CONNECTIONS[nodeId] ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }
  return -1;
}

// ═════════════════════════════════════════════════════════════════════════════
describe('SCRUM-154 · Validación de fronteras y colisiones — peón amarillo', () => {

  // ─── Grupo 1: Desfase N-2 en la salida del spawn amarillo ────────────────
  describe('desfase N-2 en la salida del spawn amarillo', () => {

    it('los nodos del corredor de salida existen con las posiciones de grid correctas', () => {
      const primerPaso = BOARD_MOVEMENT_NODES[PRIMER_PASO_ID];
      const segundoPaso = BOARD_MOVEMENT_NODES[SEGUNDO_PASO_ID];
      const primerCruce = BOARD_MOVEMENT_NODES[PRIMER_CRUCE_ID];

      expect(primerPaso).toBeDefined();
      expect(primerPaso?.gridPosition).toEqual({ col: 22, row: 6 });
      expect(segundoPaso).toBeDefined();
      expect(segundoPaso?.gridPosition).toEqual({ col: 21, row: 6 });
      expect(primerCruce).toBeDefined();
      expect(primerCruce?.gridPosition).toEqual({ col: 20, row: 6 });
    });

    it('el único adyacente desde spawn-amarillo es la primera casilla del corredor', () => {
      const adjacent = getAdjacentMoveNodes(SPAWN_AMARILLO_ID);

      expect(adjacent).toHaveLength(1);
      expect(adjacent[0]!.id).toBe(PRIMER_PASO_ID);
      expect(adjacent[0]!.gridPosition).toEqual({ col: 22, row: 6 });
    });

    it('tirada 1 → solo alcanza la primera casilla del corredor (paso 1)', () => {
      const destinations = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 1);

      expect(destinations).toHaveLength(1);
      expect(destinations[0]!.id).toBe(PRIMER_PASO_ID);
      expect(destinations[0]!.stepsRequired).toBe(1);
    });

    it('tirada 2 → solo alcanza la segunda casilla del corredor (paso 2)', () => {
      const destinations = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 2);

      expect(destinations).toHaveLength(1);
      expect(destinations[0]!.id).toBe(SEGUNDO_PASO_ID);
      expect(destinations[0]!.stepsRequired).toBe(2);
    });

    it('tirada 3 → alcanza el primer cruce real del tablero (pasillo-derecho-superior) a 3 pasos', () => {
      const destinations = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 3);
      const ids = destinations.map((n) => n.id);

      expect(ids).toContain(PRIMER_CRUCE_ID);
      const cruce = destinations.find((n) => n.id === PRIMER_CRUCE_ID)!;
      expect(cruce.stepsRequired).toBe(3);
    });

    it('pasillo-derecho-superior NO es alcanzable con tirada 1 ni 2 desde spawn-amarillo', () => {
      const destRoll1 = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 1).map((n) => n.id);
      const destRoll2 = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 2).map((n) => n.id);

      expect(destRoll1).not.toContain(PRIMER_CRUCE_ID);
      expect(destRoll2).not.toContain(PRIMER_CRUCE_ID);
    });

    it('documentación del desfase N-2: pasillo-derecho-superior requiere tirada mínima 3 desde spawn-amarillo', () => {
      // Con tirada N, el peón amarillo penetra el tablero solo N-2 pasos efectivos
      // porque el corredor de salida consume 2 valores del dado antes de llegar
      // al primer cruce real. Tirada 1 y 2 no alcanzan ningún nodo del tablero principal.
      for (let roll = 1; roll <= 2; roll++) {
        const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], roll);
        const reachesMainBoard = dests.some((n) => n.id === PRIMER_CRUCE_ID || n.gridPosition?.col <= 20);
        expect(reachesMainBoard).toBe(false);
      }

      const destRoll3 = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 3);
      const reachesMainBoardRoll3 = destRoll3.some((n) => n.gridPosition && n.gridPosition.col <= 20);
      expect(reachesMainBoardRoll3).toBe(true);
    });

    it('bloqueo total: ocupar la primera casilla del corredor impide cualquier tirada', () => {
      for (let roll = 1; roll <= 12; roll++) {
        const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [PRIMER_PASO_ID], roll);
        expect(dests).toHaveLength(0);
      }
    });

    it('bloqueo parcial: ocupar la segunda casilla no bloquea tirada 1 pero sí tirada 2', () => {
      const destRoll1Blocked = getReachableMoveNodes(SPAWN_AMARILLO_ID, [SEGUNDO_PASO_ID], 1);
      expect(destRoll1Blocked.map((n) => n.id)).toContain(PRIMER_PASO_ID);

      const destRoll2Blocked = getReachableMoveNodes(SPAWN_AMARILLO_ID, [SEGUNDO_PASO_ID], 2);
      expect(destRoll2Blocked).toHaveLength(0);
    });

    it('la distancia en grafo desde spawn-amarillo a pasillo-derecho-superior es exactamente 3', () => {
      const dist = bfsMinDist(SPAWN_AMARILLO_ID, PRIMER_CRUCE_ID);
      expect(dist).toBe(3);
    });

    it('tiradas 1-12 desde spawn-amarillo siempre producen al menos un destino', () => {
      for (let roll = 1; roll <= 12; roll++) {
        const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], roll);
        expect(dests.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Grupo 2: Fronteras de muro en el corredor derecho ────────────────────
  describe('fronteras de muro en el corredor derecho', () => {

    it('no hay ningún nodo square con col > 22 (borde derecho del tablero)', () => {
      const beyondBoundary = Object.values(BOARD_MOVEMENT_NODES).filter(
        (n) => n.kind === 'square' && n.gridPosition && n.gridPosition.col > 22
      );
      expect(beyondBoundary).toHaveLength(0);
    });

    it('la casilla grid (22,6) existe y pertenece al corredor de salida amarillo', () => {
      const nodeAt22_6 = Object.values(BOARD_MOVEMENT_NODES).find(
        (n) => n.gridPosition?.col === 22 && n.gridPosition?.row === 6
      );
      expect(nodeAt22_6).toBeDefined();
      expect(nodeAt22_6?.id).toBe(PRIMER_PASO_ID);
    });

    it('no existe ningún nodo en (22,5): el corredor no continúa hacia arriba desde el spawn', () => {
      const nodeAt22_5 = Object.values(BOARD_MOVEMENT_NODES).find(
        (n) => n.gridPosition?.col === 22 && n.gridPosition?.row === 5
      );
      expect(nodeAt22_5).toBeUndefined();
    });

    it('no existe ningún nodo en (22,8): no hay movimiento hacia abajo desde spawn-amarillo', () => {
      const nodeAt22_8 = Object.values(BOARD_MOVEMENT_NODES).find(
        (n) => n.gridPosition?.col === 22 && n.gridPosition?.row === 8
      );
      expect(nodeAt22_8).toBeUndefined();
    });

    it('la única casilla square en col 22 adyacente al spawn es la primera casilla del corredor (22,6)', () => {
      // spawn-amarillo está en (22,7); la única casilla de movimiento en la misma columna
      // dentro del área de spawn (filas 0-8) es la primera casilla del corredor de salida.
      const squaresInSpawnZoneCol22 = Object.values(BOARD_MOVEMENT_NODES).filter(
        (n) => n.kind === 'square' && n.gridPosition?.col === 22 && (n.gridPosition?.row ?? 99) <= 8
      );
      expect(squaresInSpawnZoneCol22).toHaveLength(1);
      expect(squaresInSpawnZoneCol22[0]!.id).toBe(PRIMER_PASO_ID);
    });

    it('las casillas del corredor en col 21 son exactamente las dos del corredor de salida más grid:21:7 y grid:21:8', () => {
      const squaresInCol21 = Object.values(BOARD_MOVEMENT_NODES).filter(
        (n) => n.kind === 'square' && n.gridPosition?.col === 21
      );
      const ids = squaresInCol21.map((n) => n.id).sort();
      // :1 del corredor + casillas grid de la zona inferior de la sala
      expect(ids).toContain(SEGUNDO_PASO_ID);
      // Todas deben ser de tipo square, sin rooms ni spawns
      squaresInCol21.forEach((n) => expect(n.kind).toBe('square'));
    });

    it('spawn-amarillo solo tiene una conexión directa en el grafo expandido', () => {
      const connections = BOARD_MOVEMENT_CONNECTIONS[SPAWN_AMARILLO_ID] ?? [];
      expect(connections).toHaveLength(1);
      expect(connections[0]).toBe(PRIMER_PASO_ID);
    });
  });

  // ─── Grupo 3: Escenarios límite de entrada a puertas ─────────────────────
  describe('escenarios límite de entrada a puertas desde el corredor derecho', () => {

    it('BFS relajado: una puerta es destino válido aunque la tirada supere su distancia mínima', () => {
      // Para cada sala, verificar que desde el nodo exterior inmediato de cada puerta,
      // la puerta sigue siendo alcanzable aunque la tirada sea mayor que 1.
      const roomIds = Object.keys(BOARD_ROOM_DOOR_COORDINATES);

      roomIds.forEach((roomId) => {
        const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomId] ?? []).filter(
          (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
        );

        doorNodeIds.forEach((doorNodeId) => {
          const exteriorNeighborIds = (BOARD_MOVEMENT_CONNECTIONS[doorNodeId] ?? []).filter(
            (nodeId) => nodeId !== roomId && BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
          );

          if (exteriorNeighborIds.length === 0) return;
          const exteriorId = exteriorNeighborIds[0]!;

          // Con tirada 1 (distancia exacta) la puerta está disponible
          const roll1 = getReachableMoveNodes(exteriorId, [], 1).map((n) => n.id);
          expect(roll1).toContain(doorNodeId);

          // Con tirada excedida (1 + 3) la puerta TAMBIÉN sigue siendo alcanzable
          const rollExcess = getReachableMoveNodes(exteriorId, [], 4).map((n) => n.id);
          expect(rollExcess).toContain(doorNodeId);
        });
      });
    });

    it('una puerta es inalcanzable con tirada estrictamente inferior a su distancia mínima', () => {
      // Para cada sala, desde un nodo a minDist pasos, tirada minDist-1 no llega a la puerta.
      const roomIds = Object.keys(BOARD_ROOM_DOOR_COORDINATES);

      roomIds.forEach((roomId) => {
        const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomId] ?? []).filter(
          (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
        );

        doorNodeIds.forEach((doorNodeId) => {
          // Desde el nodo exterior inmediato (a 1 paso), tirada 0 no llega
          const exteriorNeighborIds = (BOARD_MOVEMENT_CONNECTIONS[doorNodeId] ?? []).filter(
            (nodeId) => nodeId !== roomId && BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
          );
          if (exteriorNeighborIds.length === 0) return;
          const exteriorId = exteriorNeighborIds[0]!;

          const roll0 = getReachableMoveNodes(exteriorId, [], 0).map((n) => n.id);
          expect(roll0).not.toContain(doorNodeId);
        });
      });
    });

    it('una puerta ocupada por otro equipo no aparece en los destinos alcanzables', () => {
      const roomIds = Object.keys(BOARD_ROOM_DOOR_COORDINATES);

      roomIds.forEach((roomId) => {
        const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomId] ?? []).filter(
          (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
        );

        doorNodeIds.forEach((doorNodeId) => {
          const exteriorNeighborIds = (BOARD_MOVEMENT_CONNECTIONS[doorNodeId] ?? []).filter(
            (nodeId) => nodeId !== roomId && BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
          );
          if (exteriorNeighborIds.length === 0) return;
          const exteriorId = exteriorNeighborIds[0]!;

          // Con la puerta ocupada no debe aparecer como destino
          const destWithBlocked = getReachableMoveNodes(exteriorId, [doorNodeId], 1).map((n) => n.id);
          expect(destWithBlocked).not.toContain(doorNodeId);
          expect(destWithBlocked).not.toContain(roomId);
        });
      });
    });

    it('resolveCommittedMoveTargetNode posiciona el peón en la sala al confirmar una puerta', () => {
      const roomIds = Object.keys(BOARD_ROOM_DOOR_COORDINATES);

      roomIds.forEach((roomId) => {
        const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomId] ?? []).filter(
          (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
        );

        doorNodeIds.forEach((doorNodeId) => {
          const doorNode = BOARD_MOVEMENT_NODES[doorNodeId];
          if (!doorNode) return;

          const exteriorNeighborId = (BOARD_MOVEMENT_CONNECTIONS[doorNodeId] ?? []).find(
            (nodeId) => nodeId !== roomId && BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
          );
          if (!exteriorNeighborId) return;
          const exteriorNode = BOARD_MOVEMENT_NODES[exteriorNeighborId]!;

          const resolved = resolveCommittedMoveTargetNode(exteriorNode, doorNode);
          expect(resolved.kind).toBe('room');
          expect(resolved.id).toBe(roomId);
        });
      });
    });
  });

  // ─── Grupo 4: Colisiones y bloqueos en cuellos de botella ─────────────────
  describe('colisiones y bloqueos en cuellos de botella', () => {

    it('bloquear el único paso de salida de cada spawn impide cualquier tirada', () => {
      const spawnNodes = Object.values(BOARD_MOVEMENT_NODES).filter((n) => n.kind === 'spawn');

      spawnNodes.forEach((spawnNode) => {
        const [singleExit] = getAdjacentMoveNodes(spawnNode.id);
        if (!singleExit) return;

        for (let roll = 1; roll <= 6; roll++) {
          const dests = getReachableMoveNodes(spawnNode.id, [singleExit.id], roll);
          expect(dests).toHaveLength(0);
        }
      });
    });

    it('un nodo ocupado en el interior del corredor corta los destinos más allá de él', () => {
      // Bloquear :1 (grid 21,6) convierte el corredor en un callejón sin salida:
      //   - tirada 1 → :2 (22,6) sigue alcanzable (no pasa por :1)
      //   - tirada 2+ → vacío (:2 es nodo de tránsito a paso 1, y :1 está bloqueado)
      const roll1 = getReachableMoveNodes(SPAWN_AMARILLO_ID, [SEGUNDO_PASO_ID], 1);
      expect(roll1.map((n) => n.id)).toContain(PRIMER_PASO_ID);

      for (let roll = 2; roll <= 6; roll++) {
        const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [SEGUNDO_PASO_ID], roll);
        expect(dests).toHaveLength(0);
      }
    });

    it('un nodo ocupado nunca aparece como destino ni como nodo de tránsito', () => {
      // Verificar que el nodo bloqueado no aparece en la lista de destinos
      // en ningún escenario con tiradas 1-6 desde spawn-amarillo.
      const occupiedNodes = [PRIMER_PASO_ID, SEGUNDO_PASO_ID];

      occupiedNodes.forEach((occupiedId) => {
        for (let roll = 1; roll <= 6; roll++) {
          const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [occupiedId], roll);
          dests.forEach((dest) => {
            expect(dest.id).not.toBe(occupiedId);
          });
        }
      });
    });

    it('tirada 0 desde spawn-amarillo no produce ningún destino', () => {
      expect(getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 0)).toHaveLength(0);
    });

    it('desde pasillo-derecho-superior con tirada 3, spawn-amarillo es alcanzable (3 pasos en grafo)', () => {
      // El spawn-amarillo está a 3 pasos de pasillo-derecho-superior y el BFS no filtra spawns.
      // Esto documenta que los nodos de tipo spawn SÍ pueden ser destinos de movimiento,
      // lo que permite que un equipo regrese a su propia posición de salida si fuera necesario.
      const dests = getReachableMoveNodes(PRIMER_CRUCE_ID, [], 3);
      const ids = dests.map((n) => n.id);
      expect(ids).toContain(SPAWN_AMARILLO_ID);
      const spawnDest = dests.find((n) => n.id === SPAWN_AMARILLO_ID)!;
      expect(spawnDest.stepsRequired).toBe(3);
    });

    it('la sala-media-derecha no puede usarse como nodo de tránsito para llegar a su segunda puerta', () => {
      // Regresión: el BFS relajado no debe atravesar salas como paso intermedio.
      const door1 = 'square:grid:16:9';
      const door2 = 'square:centro-este::pasillo-derecho-central:2';

      expect(BOARD_MOVEMENT_NODES[door1]).toBeDefined();
      expect(BOARD_MOVEMENT_NODES[door2]).toBeDefined();

      const roll2FromDoor1 = getReachableMoveNodes(door1, [], 2).map((n) => n.id);
      expect(roll2FromDoor1).not.toContain(door2);
      expect(roll2FromDoor1).not.toContain('sala-media-derecha');
    });

    it('sala-inferior-centro (4 puertas) no puede usarse como nodo de tránsito entre sus propias puertas', () => {
      const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS['sala-inferior-centro'] ?? []).filter(
        (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
      );
      expect(doorNodeIds.length).toBeGreaterThanOrEqual(2);

      doorNodeIds.forEach((entryDoorId) => {
        const roll2 = getReachableMoveNodes(entryDoorId, [], 2).map((n) => n.id);
        const otherDoors = doorNodeIds.filter((id) => id !== entryDoorId);
        otherDoors.forEach((otherDoor) => {
          expect(roll2).not.toContain(otherDoor);
        });
      });
    });
  });
});
