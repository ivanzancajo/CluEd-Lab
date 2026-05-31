# Algoritmo de Movimiento — Justificación Analítica

## 1. Introducción

El tablero de Cluedo Online se modela como un **grafo dirigido no ponderado** en lugar de un tablero de cuadrícula clásico. Esta elección responde a la naturaleza irregular del mapa: las habitaciones no siguen una cuadrícula uniforme, los pasillos tienen anchuras variables y ciertas zonas del tablero están bloqueadas por muros. Un grafo permite representar exactamente qué casillas son transitables y qué conexiones existen, sin depender de coordenadas cartesianas.

---

## 2. Estructura del grafo

### 2.1 Tipos de nodos

| Tipo     | Descripción                                                     | Ejemplos                                 |
|----------|-----------------------------------------------------------------|------------------------------------------|
| `spawn`  | Posición inicial de cada equipo, fuera del área activa          | `spawn-amarillo`, `spawn-rojo`           |
| `square` | Casilla de pasillo o cruce; nodo de tránsito y de destino       | `pasillo-derecho-superior`, `square:grid:14:2` |
| `room`   | Habitación; solo accesible por sus puertas definidas            | `sala-superior-izquierda`, `sala-inferior-centro` |

### 2.2 Grilla de referencia

El tablero se mapea a una cuadrícula de 23 columnas × 26 filas con posiciones en porcentaje relativo al ancho y alto del contenedor SVG. Cada columna y fila tiene un valor porcentual fijo (e.g., col 0 = 15,03 %, col 22 = 88,28 %).

### 2.3 Construcción del grafo expandido

El grafo definitivo (`EXPANDED_MOVEMENT_GRAPH`) se construye algorítmicamente en `buildExpandedMovementGraph()` a partir de:

1. **Nodos base** (`BASE_MOVEMENT_NODE_DEFINITIONS`): spawns, cruces y habitaciones con su posición de grilla.
2. **Aristas explícitas** (`EXPLICIT_EDGE_GRID_POINTS`): listas de casillas intermedias entre dos nodos nombrados.
3. **Conexión ortogonal automática**: las casillas de la grilla que no forman parte de ninguna arista explícita se conectan entre sí si son adyacentes ortogonalmente y no están excluidas.
4. **Puertas de sala** (`ROOM_ENTRY_DOOR_GRID_COORDINATES`): cada sala conecta exclusivamente con las casillas de puerta especificadas.
5. **Pasadizos secretos**: se conectan directamente los pares de salas de esquina opuesta.
6. **Exclusión de muros** (`EXCLUDED_GRID_POINTS`): las casillas correspondientes a muros o al interior de salas se eliminan del grafo.

---

## 3. Algoritmo BFS relajado

### 3.1 Descripción formal

La función central es `getReachableMoveNodes(currentNodeId, occupiedNodeIds, diceRoll)`. Implementa una **búsqueda en anchura (BFS) relajada**: expande el grafo desde el nodo actual hasta que todos los caminos han consumido exactamente `diceRoll` pasos o han llegado a una puerta de sala.

**Pseudocódigo:**

```
función getReachableMoveNodes(inicio, bloqueados, tirada):
  visitados ← {inicio: 0}
  cola ← [(inicio, 0)]
  alcanzables ← {}

  mientras cola no esté vacía:
    (nodo, pasos) ← desencolar(cola)
    si pasos >= tirada: continuar

    para cada vecino de nodo:
      si vecino está bloqueado: continuar
      nextPasos ← pasos + 1
      si nextPasos > tirada: continuar
      si visitados[vecino] <= nextPasos: continuar   // ya visitado con mejor distancia
      visitados[vecino] ← nextPasos

      si vecino es puerta de sala (y no se parte de sala):
        alcanzables[vecino] ← nextPasos   // DESTINO VÁLIDO aunque nextPasos < tirada
        si nextPasos < tirada: encolar(vecino, nextPasos)   // BFS relajado: continúa buscando
        continuar

      si nextPasos == tirada:
        si vecino es sala: continuar   // las salas no son destino directo
        alcanzables[vecino] ← nextPasos

      si vecino es sala (y no se parte de sala): continuar  // las salas no son tránsito

      encolar(vecino, nextPasos)

  retornar alcanzables ordenados por pasos, luego tipo, luego nombre
```

**Complejidad:** O(V + E), donde V es el número de nodos del grafo y E el número de conexiones.

### 3.2 Criterios de selección de destinos

- Un nodo `square` o `spawn` es **destino válido** si y solo si se alcanza en exactamente `diceRoll` pasos (excepción: puertas de sala con exceso).
- Los nodos `room` **nunca** son destinos directos del BFS; se convierten en posición del peón únicamente a través de `resolveCommittedMoveTargetNode` al confirmar el movimiento hacia una puerta.
- Los nodos ocupados por otros equipos **no se atraviesan** ni aparecen como destinos.

---

## 4. Variaciones respecto al Cluedo original

### 4.1 Entrada a habitaciones con exceso de pasos

**Regla clásica:** el jugador solo puede entrar en una habitación si el número de pasos restantes es exactamente el necesario para llegar a su puerta. Los pasos sobrantes se pierden.

**Variación adoptada:** si la puerta de una sala se encuentra a menos pasos de los indicados por el dado, el jugador puede igualmente entrar en la habitación. El exceso de pasos se ignora al confirmar la entrada. Esta mecánica reduce la frustración de no poder entrar en una sala por exceder por un paso y agiliza el ritmo de partida en un entorno online donde los turnos tienden a ser más cortos.

El BFS implementa esto añadiendo las puertas como destinos válidos en cuanto son alcanzadas (aunque `nextPasos < tirada`) y continuando la exploración para descubrir más destinos en el mismo turno.

### 4.2 Eliminación de giros en ángulo recto obligatorios

**Regla clásica:** el peón no puede girar más de 90° en una sola casilla y no puede retroceder por el mismo pasillo en el que avanzó.

**Variación adoptada:** el BFS explora todas las rutas posibles sin restricción de dirección. El grafo ortogonal garantiza que no existen conexiones diagonales, pero no impone ningún orden de giro. Esta simplificación es justificable en el contexto digital porque elimina ambigüedades visuales (el tablero SVG no indica la orientación del peón) y no afecta de forma significativa al equilibrio del juego dado que los pasillos son estrechos y las rutas alternativas son escasas.

### 4.3 Pasadizos secretos con coste fijo de 1

**Regla clásica:** los pasadizos secretos en algunas ediciones solo están disponibles si el jugador no ha realizado ningún movimiento en ese turno, o directamente se prohíben en ciertas situaciones.

**Variación adoptada:** los pasadizos secretos cuestan exactamente 1 paso y están disponibles siempre que el equipo se encuentre en una sala de esquina y no haya entrado en ella durante el mismo turno. Esto mantiene la mecánica táctica del pasadizo sin añadir restricciones adicionales de estado de turno.

### 4.4 Sin restricción de salida en el mismo turno que se entra

**Regla clásica:** en muchas ediciones, un jugador que entra en una habitación en un turno no puede salir de ella en el mismo turno.

**Variación adoptada:** al entrar en una sala, el turno activo se mantiene abierto para realizar una sugerencia; no obstante, el movimiento se da por completado (el equipo no puede continuar desplazándose en el mismo turno). La restricción de salida no aplica porque el turno ya ha concluido en el contexto de movimiento.

---

## 5. Caso especial: peón amarillo y el desfase N-2

### 5.1 Descripción del corredor de salida

El spawn del equipo amarillo (`spawn-amarillo`, grid 22,7) se encuentra en el borde derecho del tablero SVG, fuera del área de juego activa. El camino hacia el primer cruce real del tablero (`pasillo-derecho-superior`, grid 20,6) atraviesa **dos casillas intermedias** de corredor:

```
spawn-amarillo (22,7)
  └── square:pasillo-derecho-superior::spawn-amarillo:2  (22,6)  ← paso 1
        └── square:pasillo-derecho-superior::spawn-amarillo:1  (21,6)  ← paso 2
              └── pasillo-derecho-superior  (20,6)  ← paso 3 (primer cruce del tablero)
```

### 5.2 Consecuencia: desfase N-2

Con una tirada N desde el spawn amarillo, el peón solo penetra el tablero activo N-2 pasos efectivos, ya que los dos primeros valores del dado se consumen íntegramente en el corredor de salida:

| Tirada | Casilla alcanzada                               | Área          |
|--------|-------------------------------------------------|---------------|
| 1      | square:…::spawn-amarillo:2 (grid 22,6)          | Corredor spawn |
| 2      | square:…::spawn-amarillo:1 (grid 21,6)          | Corredor spawn |
| 3      | `pasillo-derecho-superior` + casillas adyacentes | Tablero activo |
| 4      | Nodos a 1 paso de `pasillo-derecho-superior`    | Tablero activo |
| N ≥ 3  | Nodos a N-3 pasos de `pasillo-derecho-superior` | Tablero activo |

### 5.3 Justificación de diseño

El corredor de dos casillas es el equivalente digital al **pasillo de entrada** que existe físicamente en el juego de tablero: la posición de spawn está intencionalmente fuera del área central para separar visualmente la zona de espera de la zona de juego. Las dos casillas intermedias representan esa transición y no constituyen un desequilibrio competitivo porque todos los spawns tienen corredores de salida de longitud similar.

Esta mecánica está documentada y validada automáticamente en `backend/tests/session-movement-yellow-pawn.test.ts` (SCRUM-154).

---

## 6. Validación automática

La corrección del algoritmo y la integridad del grafo se garantizan mediante tres archivos de tests unitarios:

| Archivo de test                                      | Cobertura principal                                                    |
|------------------------------------------------------|------------------------------------------------------------------------|
| `session-movement.test.ts`                           | BFS relajado, puertas, pasadizos, conectividad general (190 tests)     |
| `board-movement-matrix.test.ts`                      | Colisiones con muros, footprints de sala, unicidad de grilla (89 tests)|
| `session-movement-yellow-pawn.test.ts`               | Desfase N-2 peón amarillo, fronteras de muro, bloqueos (29 tests)      |

Los tests pueden ejecutarse con:

```bash
cd backend
npx jest --runInBand --config jest.unit.config.cjs
```
