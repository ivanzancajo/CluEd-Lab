import { describe, expect, it } from '@jest/globals';
import {
  BOARD_MOVEMENT_CONNECTIONS,
  BOARD_MOVEMENT_NODES,
  findBoardMovementNodeByPosition,
  getAdjacentMoveNodes,
  getReachableMoveNodes,
} from '../src/lib/sessionMovement.js';

describe('sessionMovement', () => {
  it('resuelve el nodo de salida rojo dentro de la tolerancia configurada', () => {
    const node = findBoardMovementNodeByPosition(65.3, 10.4);

    expect(node).toMatchObject(BOARD_MOVEMENT_NODES['spawn-rojo']);
  });

  it('expande por casillas el primer tramo desde la salida roja', () => {
    const adjacentMoves = getAdjacentMoveNodes('spawn-rojo');

    expect(adjacentMoves).toHaveLength(1);
    expect(adjacentMoves[0]).toMatchObject({ kind: 'square' });
  });

  it('alcanza el cruce superior derecho con una tirada de dos casillas', () => {
    const reachableMoves = getReachableMoveNodes('spawn-rojo', [], 2);

    expect(reachableMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pasillo-superior-derecho',
          stepsRequired: 2,
        }),
      ])
    );
  });

  it('solo permite entrar en la sala cuando se alcanza su casilla de puerta', () => {
    const roomMovesFromCross = getReachableMoveNodes('pasillo-izquierdo-superior', [], 1);
    const roomMovesFromDoor = getReachableMoveNodes('square:pasillo-izquierdo-superior::pasillo-superior-central:7', [], 1);

    expect(roomMovesFromCross).not.toEqual(
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

  it('permite salir de la sala inferior central por cualquiera de sus puertas', () => {
    const reachableMoves = getReachableMoveNodes('sala-inferior-centro', [], 1);

    expect(reachableMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'square:centro-oeste::centro-sur:6', stepsRequired: 1 }),
        expect.objectContaining({ id: 'centro-sur', stepsRequired: 1 }),
        expect.objectContaining({ id: 'square:centro-este::centro-sur:6', stepsRequired: 1 }),
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
});