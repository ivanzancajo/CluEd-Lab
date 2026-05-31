import { describe, expect, it } from '@jest/globals';
import {
  BOARD_MOVEMENT_NODES,
  BOARD_MOVEMENT_CONNECTIONS,
  getReachableMoveNodes,
  resolveCommittedMoveTargetNode,
} from '../src/lib/sessionMovement.js';
import {
  BOARD_ROOM_FOOTPRINT_GRID_KEYS,
  getRoomEntryNodeByDoorNodeId,
} from '../src/lib/boardGraph.js';

describe('Corredor derecho y sala-media-derecha — corrección de topología', () => {
  // ─── Grupo 1: Topología del corredor derecho post-corrección ─────────────────

  describe('topología del corredor derecho post-corrección', () => {
    it('centro-este no existe en el grafo', () => {
      expect(BOARD_MOVEMENT_NODES['centro-este']).toBeUndefined();
    });

    it('pasillo-derecho-central no existe en el grafo', () => {
      expect(BOARD_MOVEMENT_NODES['pasillo-derecho-central']).toBeUndefined();
    });

    it('pasillo-derecho-superior no conecta con pasillo-derecho-central', () => {
      const neighbors = BOARD_MOVEMENT_CONNECTIONS['pasillo-derecho-superior'] ?? [];
      expect(neighbors).not.toContain('pasillo-derecho-central');
    });

    it('pasillo-derecho-superior conecta con spawn-amarillo y pasillo-superior-derecho', () => {
      const neighbors = BOARD_MOVEMENT_CONNECTIONS['pasillo-derecho-superior'] ?? [];
      expect(neighbors).toContain('spawn-amarillo');
      const hasCorridorToRight = neighbors.some((id) => {
        const n = BOARD_MOVEMENT_NODES[id];
        return n?.gridPosition?.col === 20 && n.gridPosition.row >= 7 && n.gridPosition.row <= 8;
      });
      expect(hasCorridorToRight).toBe(true);
    });

    it('no existe ningún nodo square en cols 16-19 row 12 (interior de sala-media-derecha)', () => {
      for (let col = 16; col <= 19; col++) {
        const nodesAtPosition = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) => n.kind === 'square' && n.gridPosition?.col === col && n.gridPosition?.row === 12
        );
        expect(nodesAtPosition).toHaveLength(0);
      }
    });

    it('sala-media-derecha footprint incluye row 12 cols 16-19', () => {
      for (let col = 16; col <= 19; col++) {
        expect(BOARD_ROOM_FOOTPRINT_GRID_KEYS.has(`${col}:12`)).toBe(true);
      }
    });

    it('los intermedios explícitos del corredor (col 20 rows 9-11) ya no existen', () => {
      for (let row = 9; row <= 11; row++) {
        const nodes = Object.values(BOARD_MOVEMENT_NODES).filter(
          (n) => n.gridPosition?.col === 20 && n.gridPosition?.row === row
        );
        expect(nodes).toHaveLength(0);
      }
    });
  });

  // ─── Grupo 2: Accesibilidad de puertas de sala-media-derecha ────────────────

  describe('accesibilidad de las puertas de sala-media-derecha', () => {
    it('puerta norte (16,9): square:grid:16:9 existe', () => {
      const node = BOARD_MOVEMENT_NODES['square:grid:16:9'];
      expect(node).toBeDefined();
      expect(node?.kind).toBe('square');
      expect(node?.gridPosition).toEqual({ col: 16, row: 9 });
    });

    it('puerta norte (16,9): getRoomEntryNodeByDoorNodeId devuelve sala-media-derecha', () => {
      const room = getRoomEntryNodeByDoorNodeId('square:grid:16:9');
      expect(room?.id).toBe('sala-media-derecha');
    });

    it('puerta lateral (15,12): square:grid:15:12 existe como auto-square', () => {
      const node = BOARD_MOVEMENT_NODES['square:grid:15:12'];
      expect(node).toBeDefined();
      expect(node?.kind).toBe('square');
      expect(node?.gridPosition).toEqual({ col: 15, row: 12 });
    });

    it('puerta lateral (15,12): getRoomEntryNodeByDoorNodeId devuelve sala-media-derecha', () => {
      const room = getRoomEntryNodeByDoorNodeId('square:grid:15:12');
      expect(room?.id).toBe('sala-media-derecha');
    });

    it('sala-media-derecha conecta exactamente con sus 2 puertas en BOARD_MOVEMENT_CONNECTIONS', () => {
      const connected = BOARD_MOVEMENT_CONNECTIONS['sala-media-derecha'] ?? [];
      const doorNodeIds = connected.filter((id) => BOARD_MOVEMENT_NODES[id]?.kind === 'square');
      expect(doorNodeIds).toHaveLength(2);
      expect(doorNodeIds).toContain('square:grid:16:9');
      expect(doorNodeIds).toContain('square:grid:15:12');
    });
  });

  // ─── Grupo 3: BFS desde corredor derecho hasta sala-media-derecha ────────────

  describe('BFS desde corredor derecho hasta sala-media-derecha', () => {
    it('desde pasillo-derecho-superior, la puerta (16,9) es alcanzable con tirada suficiente', () => {
      const maxDice = 12;
      let found = false;
      for (let dice = 1; dice <= maxDice; dice++) {
        const dests = getReachableMoveNodes('pasillo-derecho-superior', [], dice);
        if (dests.some((n) => n.id === 'square:grid:16:9')) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('desde pasillo-derecho-superior con tirada 1, no se puede alcanzar sala-media-derecha directamente', () => {
      const dests = getReachableMoveNodes('pasillo-derecho-superior', [], 1).map((n) => n.id);
      expect(dests).not.toContain('sala-media-derecha');
      expect(dests).not.toContain('square:grid:16:9');
    });

    it('desde pasillo-derecho-superior con tirada 1, pasillo-derecho-central NO aparece como destino', () => {
      const dests = getReachableMoveNodes('pasillo-derecho-superior', [], 1).map((n) => n.id);
      expect(dests).not.toContain('pasillo-derecho-central');
    });

    it('spawn-amarillo puede alcanzar sala-media-derecha (conectividad del grafo)', () => {
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
  });

  // ─── Grupo 4: BFS desde centro hasta sala-media-derecha ─────────────────────

  describe('BFS desde centro hacia sala-media-derecha', () => {
    it('desde square:grid:14:12 con tirada 1, la puerta (15,12) es alcanzable', () => {
      const node = BOARD_MOVEMENT_NODES['square:grid:14:12'];
      expect(node).toBeDefined();
      const dests = getReachableMoveNodes('square:grid:14:12', [], 1).map((n) => n.id);
      expect(dests).toContain('square:grid:15:12');
    });

    it('resolveCommittedMoveTargetNode desde (14,12) hacia puerta (15,12) devuelve sala-media-derecha', () => {
      const fromNode = BOARD_MOVEMENT_NODES['square:grid:14:12'];
      const doorNode = BOARD_MOVEMENT_NODES['square:grid:15:12'];
      expect(fromNode).toBeDefined();
      expect(doorNode).toBeDefined();
      const resolved = resolveCommittedMoveTargetNode(fromNode!, doorNode!);
      expect(resolved).toMatchObject({ id: 'sala-media-derecha', kind: 'room' });
    });

    it('desde sala-media-derecha con tirada 1, ambas puertas son alcanzables como salidas', () => {
      const dests = getReachableMoveNodes('sala-media-derecha', [], 1).map((n) => n.id);
      expect(dests).toContain('square:grid:16:9');
      expect(dests).toContain('square:grid:15:12');
    });

    it('la puerta (15,12) está conectada con square:grid:14:12 en el grafo', () => {
      const neighbors = BOARD_MOVEMENT_CONNECTIONS['square:grid:15:12'] ?? [];
      expect(neighbors).toContain('square:grid:14:12');
    });
  });
});
