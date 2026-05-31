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
import { findNearestBoardMovementNode, getRoomEntryNodeByDoorNodeId, type BoardMovementNode } from '../src/lib/boardGraph.js';
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

    // Las salas nunca aparecen como destino directo: la entrada se resuelve vía
    // resolveCommittedMoveTargetNode al seleccionar la casilla de puerta.
    expect(roomMovesFromCorridor).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sala-superior-izquierda' }),
      ])
    );
    expect(roomMovesFromDoor).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sala-superior-izquierda' }),
      ])
    );

    // La puerta sí está en las conexiones directas de la sala para que resolveCommittedMoveTargetNode funcione.
    expect(BOARD_MOVEMENT_CONNECTIONS['square:grid:5:3']).toContain('sala-superior-izquierda');

    // Desde el pasillo adyacente, la puerta es alcanzable en 1 paso.
    expect(roomMovesFromCorridor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'square:grid:5:3', stepsRequired: 1 }),
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

  it('BFS relajado: una puerta alcanzable en N pasos es destino válido con tirada > N', () => {
    // square:grid:5:3 es la puerta de sala-superior-izquierda, a 1 paso de square:grid:6:3.
    // Con tirada=3 (> 1) debe seguir siendo un destino válido (exceso ignorado al entrar).
    const threeStepMoves = getReachableMoveNodes('square:grid:6:3', [], 3).map((node) => node.id);
    expect(threeStepMoves).toContain('square:grid:5:3');
    expect(threeStepMoves).not.toContain('sala-superior-izquierda');

    // Con tirada=5 también debe aparecer (puerta a 1 paso, 4 pasos de exceso).
    const fiveStepMoves = getReachableMoveNodes('square:grid:6:3', [], 5).map((node) => node.id);
    expect(fiveStepMoves).toContain('square:grid:5:3');
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

  it('la puerta de sala-inferior-izquierda está en col 3 row 19 y es alcanzable con tirada 1', () => {
    const tirada1 = getReachableMoveNodes('sala-inferior-izquierda', [], 1).map((node) => node.id);
    const tirada2 = getReachableMoveNodes('sala-inferior-izquierda', [], 2).map((node) => node.id);

    // La puerta está a 1 paso, no a 2.
    expect(tirada1).toContain('square:grid:3:19');
    expect(tirada2).not.toContain('square:grid:3:19');
    // La casilla 3:20 está excluida del grafo.
    expect(tirada1).not.toContain('square:grid:3:20');
    expect(tirada2).not.toContain('square:grid:3:20');
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

  it('al confirmar cualquiera de las puertas de sala-media-derecha, el peón entra en la sala', () => {
    const roomNode = BOARD_MOVEMENT_NODES['sala-media-derecha'];
    const firstDoorNode = BOARD_MOVEMENT_NODES['square:grid:16:9'];
    const secondDoorNode = BOARD_MOVEMENT_NODES['square:centro-este::pasillo-derecho-central:2'];
    const fromFirstDoorCorridorNode = BOARD_MOVEMENT_NODES['square:grid:16:8'];
    const fromSecondDoorCorridorNode = BOARD_MOVEMENT_NODES['square:centro-este::pasillo-derecho-central:1'];

    expect(roomNode).toBeDefined();
    expect(firstDoorNode).toBeDefined();
    expect(secondDoorNode).toBeDefined();
    expect(fromFirstDoorCorridorNode).toBeDefined();
    expect(fromSecondDoorCorridorNode).toBeDefined();

    const resolvedFromFirstDoor = resolveCommittedMoveTargetNode(fromFirstDoorCorridorNode, firstDoorNode);
    const resolvedFromSecondDoor = resolveCommittedMoveTargetNode(fromSecondDoorCorridorNode, secondDoorNode);

    expect(resolvedFromFirstDoor).toMatchObject({ id: 'sala-media-derecha', kind: 'room' });
    expect(resolvedFromSecondDoor).toMatchObject({ id: 'sala-media-derecha', kind: 'room' });
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
        // Las puertas de sala son válidas con cualquier tirada >= su distancia mínima (BFS relajado).
        // El resto de nodos siguen requiriendo exactamente diceRoll pasos.
        const outOfRangeMoves = reachableMoves.filter((node) => {
          const shortest = shortestDistances.get(node.id) ?? Number.POSITIVE_INFINITY;
          if (node.kind === 'square' && getRoomEntryNodeByDoorNodeId(node.id)) {
            return shortest > diceRoll;
          }
          return shortest !== diceRoll;
        });

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
        // Se excluyen salas y spawns: los spawns tienen conexiones de "salto largo"
        // hacia su primer nodo de tablero, que no están restringidas a ser ortogonales.
        if (!b?.gridPosition || b.kind === 'room' || b.kind === 'spawn') return;

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

  it('desde centro-este solo existen tres salidas adyacentes válidas (norte, sur y este)', () => {
    const adjacentMoves = getAdjacentMoveNodes('centro-este');

    expect(adjacentMoves).toHaveLength(3);
    expect(adjacentMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'square:centro-este::centro-norte:4' }),
        expect.objectContaining({ id: 'square:centro-este::centro-sur:1' }),
        expect.objectContaining({ id: 'square:centro-este::pasillo-derecho-central:1' }),
      ])
    );
  });

  it('desde centro-este no ofrece dos casillas distintas de primer paso hacia el norte', () => {
    const adjacentMoves = getAdjacentMoveNodes('centro-este');
    const northboundFirstSteps = adjacentMoves.filter(
      (node) => node.gridPosition?.col === 13 && (node.gridPosition?.row ?? 99) < 12
    );

    expect(northboundFirstSteps).toHaveLength(1);
  });

  // ─── Tests exhaustivos de cobertura de movimiento ───────────────────────────

  it('tirada 0 no produce ningún destino desde ningún nodo representativo', () => {
    const nodeIds = ['spawn-rojo', 'pasillo-superior-derecho', 'sala-superior-izquierda', 'centro-norte', 'spawn-azul'];

    nodeIds.forEach((nodeId) => {
      expect(getReachableMoveNodes(nodeId, [], 0)).toHaveLength(0);
    });
  });

  it('todos los spawns tienen exactamente un nodo adyacente hacia el tablero', () => {
    const spawnNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'spawn');

    spawnNodes.forEach((spawnNode) => {
      const adjacentMoves = getAdjacentMoveNodes(spawnNode.id);
      expect(adjacentMoves).toHaveLength(1);
    });
  });

  it('el grafo es completamente conexo desde cualquier spawn', () => {
    const spawnNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'spawn');

    spawnNodes.forEach((spawnNode) => {
      const visited = new Set<string>([spawnNode.id]);
      const queue: string[] = [spawnNode.id];

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) {
          continue;
        }

        for (const neighborId of BOARD_MOVEMENT_CONNECTIONS[currentId] ?? []) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }

      const unreachableNodes = Object.keys(BOARD_MOVEMENT_NODES).filter((nodeId) => !visited.has(nodeId));
      expect(unreachableNodes).toHaveLength(0);
    });
  });

  it('cada sala tiene el número esperado de puertas', () => {
    const expectedDoorCounts: Record<string, number> = {
      'sala-superior-izquierda': 1,
      'sala-superior-centro': 2,
      'sala-superior-derecha': 1,
      'sala-media-izquierda': 2,
      'sala-media-izquierda-inferior': 2,
      'sala-media-derecha': 2,
      'sala-inferior-izquierda': 1,
      'sala-inferior-centro': 4,
      'sala-inferior-derecha': 1,
    };

    Object.entries(expectedDoorCounts).forEach(([roomNodeId, expectedCount]) => {
      const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomNodeId] ?? []).filter(
        (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
      );

      expect(doorNodeIds).toHaveLength(expectedCount);
    });
  });

  it('las puertas de todas las salas son alcanzables en 1 paso desde su nodo exterior inmediato', () => {
    const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'room');

    roomNodes.forEach((roomNode) => {
      const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? []).filter(
        (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
      );

      doorNodeIds.forEach((doorNodeId) => {
        const exteriorNeighborIds = (BOARD_MOVEMENT_CONNECTIONS[doorNodeId] ?? []).filter(
          (nodeId) => nodeId !== roomNode.id && BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
        );

        exteriorNeighborIds.forEach((exteriorId) => {
          const reachableFromExterior = getReachableMoveNodes(exteriorId, [], 1);
          const canReachDoor = reachableFromExterior.some((node) => node.id === doorNodeId);
          expect(canReachDoor).toBe(true);
        });
      });
    });
  });

  it('resolveCommittedMoveTargetNode sitúa el peón en la sala al confirmar cualquier puerta', () => {
    const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'room');

    roomNodes.forEach((roomNode) => {
      const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? []).filter(
        (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
      );

      doorNodeIds.forEach((doorNodeId) => {
        const doorNode = BOARD_MOVEMENT_NODES[doorNodeId];
        if (!doorNode) {
          return;
        }

        const corridorNodeId = (BOARD_MOVEMENT_CONNECTIONS[doorNodeId] ?? []).find(
          (nodeId) => nodeId !== roomNode.id && BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
        );

        if (!corridorNodeId) {
          return;
        }

        const corridorNode = BOARD_MOVEMENT_NODES[corridorNodeId];
        if (!corridorNode) {
          return;
        }

        const resolvedNode = resolveCommittedMoveTargetNode(corridorNode, doorNode);

        expect(resolvedNode).toMatchObject({ id: roomNode.id, kind: 'room' });
      });
    });
  });

  it('nodo ocupado no aparece en destinos y la ruta queda bloqueada si no hay alternativa', () => {
    const [firstSquare] = getAdjacentMoveNodes('spawn-rojo');
    expect(firstSquare).toBeDefined();

    // Con el único paso bloqueado, tirada 1 devuelve lista vacía.
    const movesBlocked = getReachableMoveNodes('spawn-rojo', [firstSquare!.id], 1);
    expect(movesBlocked).toHaveLength(0);

    // El nodo bloqueado nunca aparece como destino en ninguna tirada.
    for (let roll = 1; roll <= 6; roll += 1) {
      const moves = getReachableMoveNodes('spawn-rojo', [firstSquare!.id], roll);
      moves.forEach((node) => {
        expect(node.id).not.toBe(firstSquare!.id);
      });
    }
  });

  it('solo las salas de esquina exponen el pasadizo secreto como movimiento adyacente incremental', () => {
    const cornerRoomIds = new Set(['sala-superior-izquierda', 'sala-inferior-derecha', 'sala-superior-derecha', 'sala-inferior-izquierda']);
    const allRoomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'room');

    allRoomNodes.forEach((roomNode) => {
      // getIncrementalMoveNodes devuelve todos los adyacentes (incluyendo salas por pasadizo).
      const incrementalMoves = getIncrementalMoveNodes(roomNode.id, []);
      const hasSecretPassage = incrementalMoves.some((node) => node.kind === 'room');

      if (cornerRoomIds.has(roomNode.id)) {
        expect(hasSecretPassage).toBe(true);
      } else {
        expect(hasSecretPassage).toBe(false);
      }
    });
  });

  it('modo incremental desde sala solo expone puertas o pasadizo secreto como primer paso', () => {
    const roomNodes = Object.values(BOARD_MOVEMENT_NODES).filter((node) => node.kind === 'room');

    roomNodes.forEach((roomNode) => {
      const doorNodeIds = new Set(
        (BOARD_MOVEMENT_CONNECTIONS[roomNode.id] ?? []).filter(
          (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
        )
      );

      const incrementalMoves = getIncrementalMoveNodes(roomNode.id, []);

      incrementalMoves.forEach((moveNode) => {
        if (moveNode.kind === 'room') {
          // Pasadizo secreto permitido.
          return;
        }

        expect(doorNodeIds.has(moveNode.id)).toBe(true);
      });
    });
  });

  it('ningún nodo del grafo está huérfano (sin conexiones)', () => {
    Object.entries(BOARD_MOVEMENT_NODES).forEach(([nodeId]) => {
      const connections = BOARD_MOVEMENT_CONNECTIONS[nodeId] ?? [];
      expect(connections.length).toBeGreaterThan(0);
    });
  });

  it('todos los nodos son del tipo correcto (spawn, square o room)', () => {
    const validKinds = new Set(['spawn', 'square', 'room']);

    Object.values(BOARD_MOVEMENT_NODES).forEach((node) => {
      expect(validKinds.has(node.kind)).toBe(true);
    });
  });

  it('tirada exacta para pasar por pasadizo secreto es siempre 1', () => {
    const cornerRoomIds = ['sala-superior-izquierda', 'sala-inferior-derecha', 'sala-superior-derecha', 'sala-inferior-izquierda'];

    cornerRoomIds.forEach((roomId) => {
      const movesRoll1 = getReachableMoveNodes(roomId, [], 1);
      const secretRooms = movesRoll1.filter((node) => node.kind === 'room');

      secretRooms.forEach((secretRoom) => {
        expect(secretRoom.stepsRequired).toBe(1);
        expect(isSecretPassageMoveValid(roomId, secretRoom.id)).toBe(true);
      });
    });
  });

  // ─── Tests de ajustes de mapa: nodos añadidos / eliminados ─────────────────

  it('las casillas grid 14:1, 14:2 y 14:3 existen en el grafo y están conectadas', () => {
    const ids = ['square:grid:14:1', 'square:grid:14:2', 'square:grid:14:3'];

    ids.forEach((id) => {
      expect(BOARD_MOVEMENT_NODES[id]).toBeDefined();
      expect(BOARD_MOVEMENT_NODES[id]?.kind).toBe('square');
      expect((BOARD_MOVEMENT_CONNECTIONS[id] ?? []).length).toBeGreaterThan(0);
    });
  });

  it('las casillas grid 14:1, 14:2 y 14:3 tienen posiciones de grid correctas', () => {
    expect(BOARD_MOVEMENT_NODES['square:grid:14:1']?.gridPosition).toEqual({ col: 14, row: 1 });
    expect(BOARD_MOVEMENT_NODES['square:grid:14:2']?.gridPosition).toEqual({ col: 14, row: 2 });
    expect(BOARD_MOVEMENT_NODES['square:grid:14:3']?.gridPosition).toEqual({ col: 14, row: 3 });
  });

  it('las casillas grid 14:1, 14:2 y 14:3 están conectadas entre sí ortogonalmente', () => {
    expect(BOARD_MOVEMENT_CONNECTIONS['square:grid:14:1']).toContain('square:grid:14:2');
    expect(BOARD_MOVEMENT_CONNECTIONS['square:grid:14:2']).toContain('square:grid:14:1');
    expect(BOARD_MOVEMENT_CONNECTIONS['square:grid:14:2']).toContain('square:grid:14:3');
    expect(BOARD_MOVEMENT_CONNECTIONS['square:grid:14:3']).toContain('square:grid:14:2');
  });

  it('la casilla grid 3:20 está excluida del grafo (puerta movida a 3:19)', () => {
    expect(BOARD_MOVEMENT_NODES['square:grid:3:20']).toBeUndefined();
    expect(BOARD_MOVEMENT_CONNECTIONS['square:grid:3:20']).toBeUndefined();
  });

  it('la casilla de paso de pasillo-derecho-superior a pasillo-superior-derecho paso 7 existe y está conectada', () => {
    const nodeId = 'square:pasillo-derecho-superior::pasillo-superior-derecho:7';

    expect(BOARD_MOVEMENT_NODES[nodeId]).toBeDefined();
    expect(BOARD_MOVEMENT_NODES[nodeId]?.gridPosition).toEqual({ col: 20, row: 6 });
    expect((BOARD_MOVEMENT_CONNECTIONS[nodeId] ?? []).length).toBeGreaterThan(0);
  });

  it('la casilla de paso 5 entre centro-norte y centro-oeste existe y está conectada', () => {
    const nodeId = 'square:centro-norte::centro-oeste:5';

    expect(BOARD_MOVEMENT_NODES[nodeId]).toBeDefined();
    expect(BOARD_MOVEMENT_NODES[nodeId]?.gridPosition).toEqual({ col: 7, row: 12 });
    expect((BOARD_MOVEMENT_CONNECTIONS[nodeId] ?? []).length).toBeGreaterThan(0);
  });

  it('la casilla de paso 3 entre centro-norte y pasillo-superior-central existe y está conectada', () => {
    const nodeId = 'square:centro-norte::pasillo-superior-central:3';

    expect(BOARD_MOVEMENT_NODES[nodeId]).toBeDefined();
    expect(BOARD_MOVEMENT_NODES[nodeId]?.gridPosition).toEqual({ col: 10, row: 7 });
    expect((BOARD_MOVEMENT_CONNECTIONS[nodeId] ?? []).length).toBeGreaterThan(0);
  });

  it('la cadena de casillas entre centro-norte y centro-oeste: :1 y :2 están excluidas, :3–:5 conectan a centro-oeste', () => {
    // :1 (col 9, row 8) excluida por columnRangePoints(9, [[8,8]])
    // :2 (col 8, row 9) excluida por columnRangePoints(8, [[8,14]])
    expect(BOARD_MOVEMENT_NODES['square:centro-norte::centro-oeste:1']).toBeUndefined();
    expect(BOARD_MOVEMENT_NODES['square:centro-norte::centro-oeste:2']).toBeUndefined();

    // La sub-cadena :3 → :4 → :5 → centro-oeste sí está completa
    const subChain = [
      'square:centro-norte::centro-oeste:3',
      'square:centro-norte::centro-oeste:4',
      'square:centro-norte::centro-oeste:5',
      'centro-oeste',
    ];

    for (let i = 0; i < subChain.length - 1; i++) {
      const a = subChain[i]!;
      const b = subChain[i + 1]!;
      expect(BOARD_MOVEMENT_CONNECTIONS[a]).toContain(b);
      expect(BOARD_MOVEMENT_CONNECTIONS[b]).toContain(a);
    }

    // centro-norte NO conecta directamente a :3 (el puente :1/:2 fue eliminado)
    expect(BOARD_MOVEMENT_CONNECTIONS['centro-norte']).not.toContain('square:centro-norte::centro-oeste:3');
  });

  it('la cadena de casillas entre centro-norte y pasillo-superior-central: :1 está excluida, :2 y :3 conectan a centro-norte', () => {
    // :1 (col 10, row 5) excluida por columnRangePoints(10, [[4,5]])
    expect(BOARD_MOVEMENT_NODES['square:centro-norte::pasillo-superior-central:1']).toBeUndefined();

    // pasillo-superior-central queda aislado del corredor (su único puente :1 fue eliminado)
    const pasilloCentroConnections = BOARD_MOVEMENT_CONNECTIONS['pasillo-superior-central'] ?? [];
    expect(pasilloCentroConnections).not.toContain('square:centro-norte::pasillo-superior-central:2');

    // La sub-cadena :2 → :3 → centro-norte sí está completa
    const subChain = [
      'square:centro-norte::pasillo-superior-central:2',
      'square:centro-norte::pasillo-superior-central:3',
      'centro-norte',
    ];

    for (let i = 0; i < subChain.length - 1; i++) {
      const a = subChain[i]!;
      const b = subChain[i + 1]!;
      expect(BOARD_MOVEMENT_CONNECTIONS[a]).toContain(b);
      expect(BOARD_MOVEMENT_CONNECTIONS[b]).toContain(a);
    }
  });

  it('la cadena de casillas entre pasillo-superior-derecho y pasillo-derecho-superior está completa y conectada en serie', () => {
    // 7 casillas: :1 (15,5) → :2 (15,6) → :3 (16,6) → :4 (17,6) → :5 (18,6) → :6 (19,6) → :7 (20,6)
    const chain = [
      'pasillo-superior-derecho',
      'square:pasillo-derecho-superior::pasillo-superior-derecho:1',
      'square:pasillo-derecho-superior::pasillo-superior-derecho:2',
      'square:pasillo-derecho-superior::pasillo-superior-derecho:3',
      'square:pasillo-derecho-superior::pasillo-superior-derecho:4',
      'square:pasillo-derecho-superior::pasillo-superior-derecho:5',
      'square:pasillo-derecho-superior::pasillo-superior-derecho:6',
      'square:pasillo-derecho-superior::pasillo-superior-derecho:7',
      'pasillo-derecho-superior',
    ];

    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i]!;
      const b = chain[i + 1]!;
      expect(BOARD_MOVEMENT_CONNECTIONS[a]).toContain(b);
      expect(BOARD_MOVEMENT_CONNECTIONS[b]).toContain(a);
    }
  });

  it('los nodos intermedios de cada arista están en grid positions ortogonales consecutivas', () => {
    const edgeSquares: Record<string, BoardMovementNode[]> = {};

    Object.entries(BOARD_MOVEMENT_NODES).forEach(([nodeId, node]) => {
      if (node.kind !== 'square' || !nodeId.startsWith('square:') || nodeId.startsWith('square:grid:')) {
        return;
      }

      // Extrae el edge base: "square:A::B:N" → clave "A::B"
      const match = nodeId.match(/^square:(.+):(\d+)$/);
      if (!match) {
        return;
      }

      const edgeKey = match[1]!;
      edgeSquares[edgeKey] = edgeSquares[edgeKey] ?? [];
      edgeSquares[edgeKey].push(node);
    });

    Object.entries(edgeSquares).forEach(([edgeKey, squares]) => {
      // Ordena por stepIndex para comprobar consecutividad
      const sorted = squares
        .filter((node) => Boolean(node.gridPosition))
        .sort((a, b) => {
          const idxA = Number.parseInt(a.id.split(':').at(-1) ?? '0', 10);
          const idxB = Number.parseInt(b.id.split(':').at(-1) ?? '0', 10);
          return idxA - idxB;
        });

      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;

        if (!prev.gridPosition || !curr.gridPosition) {
          continue;
        }

        const dc = Math.abs(prev.gridPosition.col - curr.gridPosition.col);
        const dr = Math.abs(prev.gridPosition.row - curr.gridPosition.row);

        expect({ edgeKey, dc, dr }).toMatchObject({
          edgeKey,
          dc: expect.any(Number),
          dr: expect.any(Number),
        });

        // Ni diagonal ni salto de más de 1 celda en cada eje
        expect(dc + dr).toBeGreaterThan(0);
        expect(dc).toBeLessThanOrEqual(1);
        expect(dr).toBeLessThanOrEqual(1);
        expect(dc * dr).toBe(0); // no diagonal
      }
    });
  });

  it('no permite atravesar una sala con múltiples puertas como nodo de tránsito', () => {
    // sala-media-derecha tiene 2 puertas: square:grid:16:9 y square:centro-este::pasillo-derecho-central:2
    // Desde puerta 1 con tirada 2:
    //   paso 1 → sala-media-derecha [bug: BFS continuaba desde aquí]
    //   paso 2 → puerta 2 ← NO debe ocurrir; solo debe ser alcanzable desde la propia sala (exit)
    const door1NodeId = 'square:grid:16:9';
    const door2NodeId = 'square:centro-este::pasillo-derecho-central:2';

    expect(BOARD_MOVEMENT_NODES[door1NodeId]).toBeDefined();
    expect(BOARD_MOVEMENT_NODES[door2NodeId]).toBeDefined();

    const roll2FromDoor1 = getReachableMoveNodes(door1NodeId, [], 2).map((node) => node.id);

    // Puerta 2 no debe ser alcanzable pasando por la sala
    expect(roll2FromDoor1).not.toContain(door2NodeId);
    expect(roll2FromDoor1).not.toContain('sala-media-derecha');
  });

  it('no permite atravesar sala-inferior-centro con sus 4 puertas como nodo de tránsito', () => {
    // Desde cualquier puerta de sala-inferior-centro con tirada 2,
    // las demás puertas de la misma sala NO deben ser alcanzables (paso 1 = sala, paso 2 = otra puerta).
    const doorNodeIds = (BOARD_MOVEMENT_CONNECTIONS['sala-inferior-centro'] ?? []).filter(
      (nodeId) => BOARD_MOVEMENT_NODES[nodeId]?.kind === 'square'
    );

    expect(doorNodeIds.length).toBeGreaterThan(1);

    doorNodeIds.forEach((entryDoorId) => {
      const roll2From = getReachableMoveNodes(entryDoorId, [], 2).map((n) => n.id);
      const otherDoorIds = doorNodeIds.filter((id) => id !== entryDoorId);

      otherDoorIds.forEach((otherDoorId) => {
        expect(roll2From).not.toContain(otherDoorId);
      });
    });
  });
});