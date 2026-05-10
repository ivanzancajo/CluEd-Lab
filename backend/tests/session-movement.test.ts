import { describe, expect, it } from '@jest/globals';
import {
  BOARD_MOVEMENT_CONNECTIONS,
  BOARD_MOVEMENT_NODES,
  findBoardMovementNodeByPosition,
  getAdjacentMoveNodes,
  getIncrementalMoveNodes,
  getReachableMoveNodes,
  isSecretPassageMoveValid,
  resolveCommittedMoveTargetNode,
} from '../src/lib/sessionMovement.js';
import { findNearestBoardMovementNode } from '../src/lib/boardGraph.js';
import { TEAM_SPAWN_POSITIONS } from '../src/lib/teamSpawnPositions.js';

describe('sessionMovement', () => {
  it('resuelve el nodo de salida rojo dentro de la tolerancia configurada', () => {
    const node = findBoardMovementNodeByPosition(65.3, 10.4);

    expect(node).toMatchObject(BOARD_MOVEMENT_NODES['spawn-rojo']);
  });

  it('resuelve posiciones persistidas de ROJO y AZUL exactamente en sus nodos spawn', () => {
    const redPosition = TEAM_SPAWN_POSITIONS.ROJO;
    const bluePosition = TEAM_SPAWN_POSITIONS.AZUL;

    const redNode = findBoardMovementNodeByPosition(redPosition.positionX, redPosition.positionY);
    const blueNode = findBoardMovementNodeByPosition(bluePosition.positionX, bluePosition.positionY);

    expect(redNode?.id).toBe('spawn-rojo');
    expect(blueNode?.id).toBe('spawn-azul');
  });

  it('prioriza el spawn correcto por color cuando la posicion queda cerca del spawn', () => {
    const blueSpawn = BOARD_MOVEMENT_NODES['spawn-azul'];
    const blueDriftedNode = findBoardMovementNodeByPosition(
      (blueSpawn?.positionX ?? 0) + 0.2,
      (blueSpawn?.positionY ?? 0) - 0.15
    );

    expect(blueDriftedNode?.id).toBe('spawn-azul');
  });

  it('prioriza solo los destinos candidatos al resolver el nodo clicado', () => {
    const candidateNodeId = 'centro-norte';
    const candidateNode = BOARD_MOVEMENT_NODES[candidateNodeId];

    const node = findNearestBoardMovementNode(candidateNode.positionX, candidateNode.positionY, [candidateNodeId]);

    expect(node?.id).toBe(candidateNodeId);
  });

  it('expande por casillas el primer tramo desde la salida roja', () => {
    const adjacentMoves = getAdjacentMoveNodes('spawn-rojo');

    expect(adjacentMoves).toHaveLength(1);
    expect(adjacentMoves[0]).toMatchObject({ kind: 'square' });
  });

  it('alcanza la primera casilla intermedia desde spawn-rojo con tirada 1', () => {
    const reachableMoves = getReachableMoveNodes('spawn-rojo', [], 1);

    expect(reachableMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'square:pasillo-superior-derecho::spawn-rojo:1',
          stepsRequired: 1,
        }),
      ])
    );
  });

  it('mantiene el primer paso desde spawn-rojo en la casilla intermedia esperada', () => {
    const adjacentMoves = getAdjacentMoveNodes('spawn-rojo');

    expect(adjacentMoves).toHaveLength(1);
    expect(adjacentMoves[0]?.id).toBe('square:pasillo-superior-derecho::spawn-rojo:1');
  });

  it('permite salir desde spawn-morado al menos a un nodo adyacente', () => {
    const adjacentMoves = getAdjacentMoveNodes('spawn-morado');

    expect(adjacentMoves).toHaveLength(1);
    expect(adjacentMoves[0]).toMatchObject({ id: 'pasillo-izquierdo-superior' });
  });

  it('mantiene un primer paso único y esperado desde cada spawn', () => {
    const expectedFirstMoveBySpawnNodeId: Record<string, string> = {
      'spawn-rojo': 'square:pasillo-superior-derecho::spawn-rojo:1',
      'spawn-morado': 'pasillo-izquierdo-superior',
      'spawn-azul': 'pasillo-izquierdo-inferior',
      'spawn-verde': 'pasillo-inferior-izquierdo',
      'spawn-blanco': 'pasillo-inferior-derecho',
      'spawn-amarillo': 'pasillo-derecho-superior',
    };

    Object.entries(expectedFirstMoveBySpawnNodeId).forEach(([spawnNodeId, expectedMoveNodeId]) => {
      const adjacentMoves = getAdjacentMoveNodes(spawnNodeId);

      expect(adjacentMoves).toHaveLength(1);
      expect(adjacentMoves[0]?.id).toBe(expectedMoveNodeId);
    });
  });

  it('elimina cualquier casilla square en C0:R6', () => {
    const squareNodesInC0R6 = Object.values(BOARD_MOVEMENT_NODES).filter(
      (node) => node.kind === 'square' && node.gridPosition?.col === 0 && node.gridPosition?.row === 6
    );

    expect(squareNodesInC0R6).toHaveLength(0);
    expect(BOARD_MOVEMENT_NODES['square:pasillo-izquierdo-superior::spawn-morado:1']).toBeUndefined();
  });

  it('no alcanza el cruce superior derecho con una tirada de dos casillas', () => {
    const reachableMoves = getReachableMoveNodes('spawn-rojo', [], 2);

    expect(reachableMoves).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pasillo-superior-derecho',
        }),
      ])
    );
  });

  it('alcanza el cruce izquierdo inferior desde spawn-azul con una tirada de tres casillas', () => {
    const oneStepMoves = getReachableMoveNodes('spawn-azul', [], 1);
    const twoStepMoves = getReachableMoveNodes('spawn-azul', [], 2);

    expect(oneStepMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pasillo-izquierdo-inferior',
          stepsRequired: 1,
        }),
      ])
    );

    expect(twoStepMoves).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pasillo-izquierdo-inferior' }),
      ])
    );
  });

  it('solo devuelve destinos que consumen exactamente la tirada actual', () => {
    const shortRollMoves = getReachableMoveNodes('spawn-rojo', [], 2).map((node) => node.id);
    const longRollMoves = getReachableMoveNodes('spawn-rojo', [], 7).map((node) => node.id);

    expect(longRollMoves).not.toEqual(expect.arrayContaining(shortRollMoves));
    expect(longRollMoves).not.toContain('pasillo-superior-derecho');
  });

  it('solo permite entrar en la sala cuando se alcanza su casilla de puerta', () => {
    const roomMovesFromCorridor = getReachableMoveNodes('square:grid:6:3', [], 1);
    const roomMovesFromDoor = getReachableMoveNodes('square:grid:5:3', [], 1);

    expect(roomMovesFromCorridor).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sala-superior-izquierda',
        }),
      ])
    );
    expect(roomMovesFromDoor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sala-superior-izquierda',
          stepsRequired: 1,
        }),
      ])
    );
  });

  it('no ofrece salas como destino directo: para entrar hay que seleccionar una puerta', () => {
    const oneStepMoves = getReachableMoveNodes('square:grid:6:3', [], 1).map((node) => node.id);
    const twoStepMoves = getReachableMoveNodes('square:grid:6:3', [], 2).map((node) => node.id);

    expect(oneStepMoves).toContain('square:grid:5:3');
    expect(oneStepMoves).not.toContain('sala-superior-izquierda');
    expect(twoStepMoves).not.toContain('sala-superior-izquierda');
  });

  it('permite salir de la sala inferior central por cualquiera de sus puertas', () => {
    const reachableMoves = getReachableMoveNodes('sala-inferior-centro', [], 1);

    expect(reachableMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gridPosition: { col: 8, row: 17 }, stepsRequired: 1 }),
        expect.objectContaining({ gridPosition: { col: 13, row: 17 }, stepsRequired: 1 }),
        expect.objectContaining({ gridPosition: { col: 14, row: 19 }, stepsRequired: 1 }),
        expect.objectContaining({ gridPosition: { col: 7, row: 19 }, stepsRequired: 1 }),
      ])
    );
  });

  it('solo permite usar la casilla inmediata de salida en sala-inferior-izquierda con tirada 2', () => {
    const shortRollMoves = getReachableMoveNodes('sala-inferior-izquierda', [], 2).map((node) => node.id);
    const longRollMoves = getReachableMoveNodes('sala-inferior-izquierda', [], 3).map((node) => node.id);

    expect(shortRollMoves).toContain('square:grid:3:19');
    expect(shortRollMoves).not.toContain('square:grid:3:20');
    expect(longRollMoves).not.toContain('square:grid:3:19');
  });

  it('al salir de cualquier sala, la puerta consume un paso antes de alcanzar casillas exteriores', () => {
    const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'room');

    roomNodes.forEach((roomNode) => {
      const rollOneMoveIds = getReachableMoveNodes(roomNode.id, [], 1).map((node) => node.id);
      const rollTwoMoveIds = getReachableMoveNodes(roomNode.id, [], 2).map((node) => node.id);

      const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? []).filter(
        (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
      );

      const exteriorSquareIds = new Set(
        doorNodeIds.flatMap((doorNodeId) =>
          (BOARD_MOVEMENT_CONNECTIONS[doorNodeId] ?? [])
            .filter((neighborNodeId) => neighborNodeId !== roomNode.id)
            .filter((neighborNodeId) => BOARD_MOVEMENT_NODES[neighborNodeId]?.kind === 'square')
            .filter((neighborNodeId) => !doorNodeIds.includes(neighborNodeId))
        )
      );

      exteriorSquareIds.forEach((exteriorSquareId) => {
        expect(rollOneMoveIds).not.toContain(exteriorSquareId);
        expect(rollTwoMoveIds).toContain(exteriorSquareId);
      });
    });
  });

  it('configura pasadizos entre salas de esquina en ambos sentidos', () => {
    expect(BOARD_MOVEMENT_CONNECTIONS['sala-superior-izquierda']).toEqual(
      expect.arrayContaining(['sala-inferior-derecha'])
    );
    expect(BOARD_MOVEMENT_CONNECTIONS['sala-inferior-derecha']).toEqual(
      expect.arrayContaining(['sala-superior-izquierda'])
    );
    expect(BOARD_MOVEMENT_CONNECTIONS['sala-superior-derecha']).toEqual(
      expect.arrayContaining(['sala-inferior-izquierda'])
    );
    expect(BOARD_MOVEMENT_CONNECTIONS['sala-inferior-izquierda']).toEqual(
      expect.arrayContaining(['sala-superior-derecha'])
    );
  });

  it('valida correctamente un movimiento por pasadizo entre salas opuestas', () => {
    expect(isSecretPassageMoveValid('sala-superior-izquierda', 'sala-inferior-derecha')).toBe(true);
    expect(isSecretPassageMoveValid('sala-superior-derecha', 'sala-inferior-izquierda')).toBe(true);
  });

  it('rechaza movimientos que no correspondan a un pasadizo válido', () => {
    expect(isSecretPassageMoveValid('sala-superior-izquierda', 'sala-superior-derecha')).toBe(false);
    expect(isSecretPassageMoveValid('square:grid:5:3', 'sala-inferior-derecha')).toBe(false);
    expect(isSecretPassageMoveValid('sala-superior-izquierda', 'square:grid:18:18')).toBe(false);
  });

  it('al confirmar una puerta desde el pasillo sitúa el peón dentro de la sala', () => {
    const resolvedTargetNode = resolveCommittedMoveTargetNode(
      BOARD_MOVEMENT_NODES['square:grid:6:3'],
      BOARD_MOVEMENT_NODES['square:grid:5:3']
    );

    expect(resolvedTargetNode).toMatchObject({
      id: 'sala-superior-izquierda',
      kind: 'room',
    });
  });

  it('permite salir de una sala hacia una puerta sin reentrar automáticamente', () => {
    const resolvedTargetNode = resolveCommittedMoveTargetNode(
      BOARD_MOVEMENT_NODES['sala-superior-izquierda'],
      BOARD_MOVEMENT_NODES['square:grid:5:3']
    );

    expect(resolvedTargetNode).toMatchObject({
      id: 'square:grid:5:3',
      kind: 'square',
    });
  });

  it('en todas las salas, con tirada 1 solo permite caer en puertas (o usar pasadizo secreto)', () => {
    const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'room');

    roomNodes.forEach((roomNode) => {
      const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? [])
        .filter((nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square');

      const firstStepDestinations = getReachableMoveNodes(roomNode.id, [], 1);

      firstStepDestinations.forEach((destinationNode) => {
        if (destinationNode.kind === 'room') {
          // Permitido por pasadizo secreto entre salas de esquina.
          return;
        }

        expect(destinationNode.kind).toBe('square');
        expect(doorNodeIds).toContain(destinationNode.id);
      });
    });
  });

  it('en modo incremental solo ofrece movimientos adyacentes con coste de un paso', () => {
    const stepMoves = getIncrementalMoveNodes('pasillo-superior-derecho', []);

    expect(stepMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'square:pasillo-superior-derecho::spawn-rojo:3', stepsRequired: 1 }),
        expect.objectContaining({ id: 'square:pasillo-derecho-superior::pasillo-superior-derecho:1', stepsRequired: 1 }),
      ])
    );
    expect(stepMoves).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pasillo-superior-central' }),
      ])
    );
  });

  it('filtra los nodos ocupados al calcular movimientos por tirada', () => {
    const [firstSquare] = getAdjacentMoveNodes('spawn-rojo');
    const reachableMoves = getReachableMoveNodes(firstSquare.id, ['pasillo-superior-derecho'], 1);

    expect(reachableMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'spawn-rojo',
          stepsRequired: 1,
        }),
      ])
    );
    expect(reachableMoves).not.toEqual(
      expect.arrayContaining([BOARD_MOVEMENT_NODES['pasillo-superior-derecho']])
    );
  });

  it('mantiene conexiones simétricas en el grafo básico', () => {
    Object.entries(BOARD_MOVEMENT_CONNECTIONS).forEach(([nodeId, linkedNodeIds]) => {
      linkedNodeIds.forEach((linkedNodeId) => {
        expect(BOARD_MOVEMENT_CONNECTIONS[linkedNodeId]).toContain(nodeId);
      });
    });
  });

  it('mantiene las salas conectadas solo mediante puertas y pasadizos de esquina', () => {
    Object.values(BOARD_MOVEMENT_NODES)
      .filter((node) => node.kind === 'room')
      .forEach((roomNode) => {
        const linkedNodeIds = BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? [];

        expect(linkedNodeIds.length).toBeGreaterThan(0);

        linkedNodeIds.forEach((linkedNodeId) => {
          const linkedNodeKind = BOARD_MOVEMENT_NODES[linkedNodeId]?.kind;
          expect(linkedNodeKind === 'square' || linkedNodeKind === 'room').toBe(true);
        });
      });
  });

  it('mantiene destinos exactamente al rango de tirada desde todos los spawns (auditoria profunda)', () => {
    const spawnNodeIds = Object.values(BOARD_MOVEMENT_NODES)
      .filter((node) => node.kind === 'spawn')
      .map((node) => node.id)
      .sort((left, right) => left.localeCompare(right, 'es'));

    const buildShortestDistances = (startNodeId: string) => {
      const distances = new Map<string, number>([[startNodeId, 0]]);
      const queue: string[] = [startNodeId];

      while (queue.length > 0) {
        const currentNodeId = queue.shift();
        if (!currentNodeId) {
          continue;
        }

        const currentDistance = distances.get(currentNodeId) ?? 0;
        const linkedNodeIds = BOARD_MOVEMENT_CONNECTIONS[currentNodeId] ?? [];

        linkedNodeIds.forEach((linkedNodeId) => {
          if (distances.has(linkedNodeId)) {
            return;
          }

          distances.set(linkedNodeId, currentDistance + 1);
          queue.push(linkedNodeId);
        });
      }

      return distances;
    };

    spawnNodeIds.forEach((spawnNodeId) => {
      const shortestDistances = buildShortestDistances(spawnNodeId);

      for (let diceRoll = 1; diceRoll <= 8; diceRoll += 1) {
        const reachableMoves = getReachableMoveNodes(spawnNodeId, [], diceRoll);
        const outOfRangeMoves = reachableMoves.filter(
          (node) => (shortestDistances.get(node.id) ?? Number.POSITIVE_INFINITY) !== diceRoll
        );

        expect(outOfRangeMoves).toHaveLength(0);
      }
    });
  });

  it('ninguna conexión entre casillas de pasillo es diagonal', () => {
    const diagonals: string[] = [];
    const seen = new Set<string>();

    Object.entries(BOARD_MOVEMENT_CONNECTIONS).forEach(([nodeId, neighbors]) => {
      const a = BOARD_MOVEMENT_NODES[nodeId];
      if (!a?.gridPosition || a.kind === 'room') return;

      neighbors.forEach((nId) => {
        const key = [nodeId, nId].sort().join('::');
        if (seen.has(key)) return;
        seen.add(key);

        const b = BOARD_MOVEMENT_NODES[nId];
        if (!b?.gridPosition || b.kind === 'room') return;

        const dc = Math.abs(a.gridPosition.col - b.gridPosition.col);
        const dr = Math.abs(a.gridPosition.row - b.gridPosition.row);
        if (dc > 0 && dr > 0) {
          diagonals.push(`${nodeId} -> ${nId} (Δcol=${dc}, Δrow=${dr})`);
        }
      });
    });

    expect(diagonals).toHaveLength(0);
  });

  it('permite salir desde spawn-verde al menos a un nodo adyacente', () => {
    const adjacentMoves = getAdjacentMoveNodes('spawn-verde');

    expect(adjacentMoves).toHaveLength(1);
    expect(adjacentMoves[0]).toMatchObject({ id: 'pasillo-inferior-izquierdo' });
  });

  it('permite salir desde spawn-blanco al menos a un nodo adyacente', () => {
    const adjacentMoves = getAdjacentMoveNodes('spawn-blanco');

    expect(adjacentMoves).toHaveLength(1);
    expect(adjacentMoves[0]).toMatchObject({ id: 'pasillo-inferior-derecho' });
  });

  it('permite salir desde spawn-amarillo al menos a un nodo adyacente', () => {
    const adjacentMoves = getAdjacentMoveNodes('spawn-amarillo');

    expect(adjacentMoves).toHaveLength(1);
    expect(adjacentMoves[0]).toMatchObject({ kind: 'square' });
  });
});