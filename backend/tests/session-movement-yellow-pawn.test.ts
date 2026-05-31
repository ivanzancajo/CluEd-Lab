import { describe, expect, it } from '@jest/globals';
import {
  BOARD_MOVEMENT_CONNECTIONS,
  BOARD_MOVEMENT_NODES,
  getAdjacentMoveNodes,
  getReachableMoveNodes,
  resolveCommittedMoveTargetNode,
} from '../src/lib/sessionMovement.js';
import {
  BOARD_ROOM_DOOR_COORDINATES,
  getRoomEntryNodeByDoorNodeId,
} from '../src/lib/boardGraph.js';

// ─── Comportamiento corregido del peón amarillo ───────────────────────────────
//
// spawn-amarillo (grid 22,7) se conecta DIRECTAMENTE a pasillo-derecho-superior
// (grid 20,6) en 1 solo paso, igual que el resto de spawns del tablero.
//
// El desfase N-2 anterior (causado por dos casillas intermedias en el corredor de
// salida) ha sido eliminado. Con tirada 1 el peón puede alcanzar pasillo-derecho-
// superior y desde allí acceder a todo el corredor derecho del tablero.
//
const SPAWN_AMARILLO_ID = 'spawn-amarillo';
const PRIMER_CRUCE_ID = 'pasillo-derecho-superior'; // grid (20,6) — 1 paso desde spawn

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

  // ─── Grupo 1: Conexión directa al tablero (desfase N-2 eliminado) ─────────
  describe('conexión directa al tablero (desfase N-2 eliminado)', () => {

    it('spawn-amarillo se conecta directamente a pasillo-derecho-superior (1 hop)', () => {
      const connections = BOARD_MOVEMENT_CONNECTIONS[SPAWN_AMARILLO_ID] ?? [];
      expect(connections).toHaveLength(1);
      expect(connections[0]).toBe(PRIMER_CRUCE_ID);
    });

    it('el único adyacente desde spawn-amarillo es pasillo-derecho-superior', () => {
      const adjacent = getAdjacentMoveNodes(SPAWN_AMARILLO_ID);
      expect(adjacent).toHaveLength(1);
      expect(adjacent[0]!.id).toBe(PRIMER_CRUCE_ID);
    });

    it('la distancia en grafo desde spawn-amarillo a pasillo-derecho-superior es exactamente 1', () => {
      expect(bfsMinDist(SPAWN_AMARILLO_ID, PRIMER_CRUCE_ID)).toBe(1);
    });

    it('tirada 1 → destino pasillo-derecho-superior (igual que cualquier otro spawn)', () => {
      const destinations = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 1);
      const ids = destinations.map((n) => n.id);
      expect(ids).toContain(PRIMER_CRUCE_ID);
      const cruce = destinations.find((n) => n.id === PRIMER_CRUCE_ID)!;
      expect(cruce.stepsRequired).toBe(1);
    });

    it('tirada 2 → destinos a 2 pasos del spawn (nodos del corredor derecho)', () => {
      const destinations = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 2);
      expect(destinations.length).toBeGreaterThan(0);
      destinations.forEach((n) => expect(n.stepsRequired).toBe(2));
    });

    it('tiradas 1-12 desde spawn-amarillo siempre producen al menos un destino', () => {
      for (let roll = 1; roll <= 12; roll++) {
        const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [], roll);
        expect(dests.length).toBeGreaterThan(0);
      }
    });

    it('tirada 0 desde spawn-amarillo no produce ningún destino', () => {
      expect(getReachableMoveNodes(SPAWN_AMARILLO_ID, [], 0)).toHaveLength(0);
    });

    it('bloquear pasillo-derecho-superior impide cualquier tirada desde spawn-amarillo', () => {
      for (let roll = 1; roll <= 12; roll++) {
        const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [PRIMER_CRUCE_ID], roll);
        expect(dests).toHaveLength(0);
      }
    });

    it('ningún nodo intermedio de corredor existe ya entre spawn-amarillo y pasillo-derecho-superior', () => {
      // Los nodos :1 y :2 del antiguo corredor de salida han sido eliminados.
      expect(BOARD_MOVEMENT_NODES['square:pasillo-derecho-superior::spawn-amarillo:1']).toBeUndefined();
      expect(BOARD_MOVEMENT_NODES['square:pasillo-derecho-superior::spawn-amarillo:2']).toBeUndefined();
    });
  });

  // ─── Grupo 2: Fronteras de muro en la zona derecha del tablero ───────────
  describe('fronteras de muro en la zona derecha del tablero', () => {

    it('no hay ningún nodo square con col > 22 (borde derecho del tablero)', () => {
      const beyondBoundary = Object.values(BOARD_MOVEMENT_NODES).filter(
        (n) => n.kind === 'square' && n.gridPosition && n.gridPosition.col > 22
      );
      expect(beyondBoundary).toHaveLength(0);
    });

    it('no existe ningún nodo en (22,6): el antiguo corredor de salida fue eliminado', () => {
      const nodeAt22_6 = Object.values(BOARD_MOVEMENT_NODES).find(
        (n) => n.gridPosition?.col === 22 && n.gridPosition?.row === 6
      );
      expect(nodeAt22_6).toBeUndefined();
    });

    it('no existe ningún nodo en (22,5): no hay movimiento hacia arriba desde spawn-amarillo', () => {
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

    it('no hay ningún nodo square en col 22 adyacente al área del spawn (filas 0-8)', () => {
      const squaresInSpawnZoneCol22 = Object.values(BOARD_MOVEMENT_NODES).filter(
        (n) => n.kind === 'square' && n.gridPosition?.col === 22 && (n.gridPosition?.row ?? 99) <= 8
      );
      expect(squaresInSpawnZoneCol22).toHaveLength(0);
    });

    it('spawn-amarillo solo tiene una conexión directa en el grafo expandido', () => {
      const connections = BOARD_MOVEMENT_CONNECTIONS[SPAWN_AMARILLO_ID] ?? [];
      expect(connections).toHaveLength(1);
      expect(connections[0]).toBe(PRIMER_CRUCE_ID);
    });

    it('square:grid:21:6 existe como casilla accesible desde el tablero (no desde el spawn)', () => {
      // Tras eliminar el corredor de salida, (21,6) pasa a existir como casilla de
      // IMAGE_ALIGNED conectada ortogonalmente a pasillo-derecho-superior y grid:21:7,
      // pero NO conectada a spawn-amarillo.
      const node = BOARD_MOVEMENT_NODES['square:grid:21:6'];
      expect(node).toBeDefined();
      expect(node?.gridPosition).toEqual({ col: 21, row: 6 });
      // El spawn no forma parte de sus conexiones
      const connections = BOARD_MOVEMENT_CONNECTIONS['square:grid:21:6'] ?? [];
      expect(connections).not.toContain(SPAWN_AMARILLO_ID);
    });
  });

  // ─── Grupo 3: Escenarios límite de entrada a puertas ─────────────────────
  describe('escenarios límite de entrada a puertas', () => {

    it('BFS relajado: una puerta es destino válido aunque la tirada supere su distancia mínima', () => {
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

          // Distancia exacta (roll=1): puerta accesible
          const roll1 = getReachableMoveNodes(exteriorId, [], 1).map((n) => n.id);
          expect(roll1).toContain(doorNodeId);

          // Tirada excedida (roll=4): puerta TAMBIÉN accesible (exceso ignorado)
          const roll4 = getReachableMoveNodes(exteriorId, [], 4).map((n) => n.id);
          expect(roll4).toContain(doorNodeId);
        });
      });
    });

    it('una puerta es inalcanzable con tirada estrictamente inferior a su distancia mínima', () => {
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

          const roll0 = getReachableMoveNodes(exteriorId, [], 0).map((n) => n.id);
          expect(roll0).not.toContain(doorNodeId);
        });
      });
    });

    it('una puerta ocupada no aparece en los destinos alcanzables', () => {
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

    it('desde una sala, la puerta de otra sala es alcanzable con exceso de tirada', () => {
      // Un equipo en sala-superior-derecha puede alcanzar la puerta de sala-media-derecha
      // con una tirada mayor que la distancia mínima (BFS relajado desde sala).
      const doorToSalaMediaDerecha = 'square:grid:16:9';
      const minDist = bfsMinDist('sala-superior-derecha', doorToSalaMediaDerecha);
      expect(minDist).toBeGreaterThan(0);

      // Con tirada = minDist (exacto): alcanzable
      const destsExact = getReachableMoveNodes('sala-superior-derecha', [], minDist).map((n) => n.id);
      expect(destsExact).toContain(doorToSalaMediaDerecha);

      // Con tirada = minDist + 2 (exceso): también alcanzable
      const destsExcess = getReachableMoveNodes('sala-superior-derecha', [], minDist + 2).map((n) => n.id);
      expect(destsExcess).toContain(doorToSalaMediaDerecha);
    });

    it('desde una sala, las salas no se encadenan como nodos de tránsito en el mismo turno', () => {
      // Desde sala-superior-derecha, sala-inferior-izquierda (accesible por pasadizo secreto)
      // no debe usarse como tránsito para alcanzar sus pasillos en el mismo turno.
      // Las salas nunca son nodos de tránsito en getReachableMoveNodes.
      for (let roll = 1; roll <= 8; roll++) {
        const dests = getReachableMoveNodes('sala-superior-derecha', [], roll);
        expect(dests.map((n) => n.id)).not.toContain('sala-inferior-izquierda');
      }
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

    it('un nodo ocupado nunca aparece como destino en ninguna tirada desde spawn-amarillo', () => {
      const firstJunction = PRIMER_CRUCE_ID;

      for (let roll = 1; roll <= 6; roll++) {
        const dests = getReachableMoveNodes(SPAWN_AMARILLO_ID, [firstJunction], roll);
        dests.forEach((dest) => {
          expect(dest.id).not.toBe(firstJunction);
        });
      }
    });

    it('desde pasillo-derecho-superior con tirada 1, spawn-amarillo es alcanzable (1 paso en grafo)', () => {
      const dests = getReachableMoveNodes(PRIMER_CRUCE_ID, [], 1);
      const ids = dests.map((n) => n.id);
      expect(ids).toContain(SPAWN_AMARILLO_ID);
      const spawnDest = dests.find((n) => n.id === SPAWN_AMARILLO_ID)!;
      expect(spawnDest.stepsRequired).toBe(1);
    });

    it('la sala-media-derecha no puede usarse como nodo de tránsito para llegar a su segunda puerta', () => {
      const door1 = 'square:grid:16:9';
      const door2 = 'square:grid:15:12';

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
