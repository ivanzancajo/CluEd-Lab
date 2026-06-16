# Justificación Técnica e Implementación del Modo Debug en Desarrollo (CluEd Lab)

## 1. Contexto y Objetivos del Modo Debug
En el desarrollo de **CluEd Lab** (un entorno lúdico-pedagógico basado en las mecánicas de Cluedo), el flujo de la partida está intrínsecamente ligado a dos factores críticos: la **posición espacial de los jugadores en un tablero de grafos** y la **aleatoriedad controlada de los turnos**. 

Durante la fase de desarrollo e integración de software, la introducción de la aleatoriedad pura (RNG) y la imposibilidad de visualizar la estructura lógica subyacente del mapa suponen dos grandes obstáculos:
1. **Dificultad de validación espacial:** Traducir coordenadas visuales (píxeles en pantalla, Canvas/SVG) a nodos lógicos del grafo del tablero puede inducir a errores de desalineación o fallos en el algoritmo de cálculo de caminos.
2. **Indeterminismo en pruebas automatizadas:** El comportamiento aleatorio de los dados impide la replicación exacta de escenarios específicos de juego (como alcanzar una habitación concreta para probar un pasadizo secreto, sugerencias o acusaciones finales) en entornos de pruebas de integración y End-to-End (E2E).

Para mitigar estos problemas, se diseñó e implementó un **Modo Debug de Desarrollo** segmentado en dos componentes clave: la **Sonda de Mapeo de Casillas (Frontend)** y el **Forzado Determinista de Dados (Backend)**.

---

## 2. Frontend: Sonda y Mapeo Visual de Casillas (`boardDebug.ts`)

### 2.1 Justificación del Problema y Solución
El mapa de CluEd Lab funciona mediante un sistema de nodos interconectados (grafo del tablero). Visualmente, el usuario interactúa con una representación gráfica del mapa, pero el motor de movimientos calcula las distancias basándose en identificadores únicos de nodos (`nearestNodeId`) y tipos de casillas (`nearestNodeKind`). 

Sin una herramienta interactiva, la única forma de depurar si un clic en pantalla corresponde al nodo correcto del grafo sería mediante volcados de logs redundantes o inspección manual de coordenadas en base de datos. La infraestructura de `boardDebug.ts` implementa una solución elegante basada en **probes (sondas)** en tiempo de ejecución.

### 2.2 Detalles de Implementación y Estado (`BoardDebugProbe`)
El sistema define una interfaz de sonda detallada:
- `positionX` y `positionY`: Capturan las coordenadas relativas del cursor en el mapa, redondeadas estrictamente a dos decimales mediante una función matemática pura (`roundToTwoDecimals`) para homogeneizar los datos analizados.
- `nearestNodeId`, `nearestNodeLabel`, `nearestNodeKind`: Realizan una resolución en tiempo real del nodo lógico más cercano al puntero, exponiendo sus atributos clave (identificador, etiqueta legible y naturaleza de la casilla).

### 2.3 Mecanismos de Activación no Invasivos
Para evitar que herramientas de depuración pesadas o interfaces de testing afecten negativamente al rendimiento o se filtren accidentalmente a producción, se diseñó una máquina de estados binaria almacenada en el entorno del navegador mediante dos vías de entrada:
1. **Inyección por Query Parameter (`URLSearchParams`):** Modificar la URL incluyendo `?boardDebug=true`, `?boardDebug=1` o `?boardDebug=on` fuerza de forma inmediata el estado activo del modo depuración. Del mismo modo, permite el apagado explícito (`false`, `off`, `0`). Esto es idóneo para su uso automatizado en frameworks de testing como Cypress.
2. **Persistencia en Almacenamiento Local (`localStorage`):** El estado se almacena bajo la clave `boardDebugMode`. De este modo, un desarrollador puede mantener habilitado el mapeo visual de casillas de forma persistente a través de recargas de página sin necesidad de alterar configuraciones en el código fuente.

---

## 3. Backend: Control Determinista del Generador de Dados (`session-forced-dice.test.ts`)

### 3.1 Justificación de la Eliminación de Aleatoriedad (RNG)
En producción, el lanzamiento de dados devuelve un resultado pseudoaleatorio combinando dos dados tradicionales de 6 caras (rango [2, 12]). Sin embargo, en el pipeline de Integración Continua (CI/CD) y en la ejecución de pruebas automatizadas unitarias o E2E (como comprobar la sincronización del lobby en tiempo real o el acceso a salas), depender de la suerte del RNG haría que los tests fuesen *flaky* (inconsistentes).

La función `rollTurnDiceForced(total)` se implementó en el motor del backend (`sessionTurn.js`) para resolver este inconveniente, permitiendo al entorno de pruebas o al desarrollador inyectar un valor total preestablecido y obtener una simulación de dados matemáticamente coherente.

### 3.2 Lógica de Descomposición Matemática y Coherencia de Datos
Forzar una tirada no consiste meramente en trucar el valor total del turno; el estado del juego exige la persistencia individualizada de cada dado (`valueOne` y `valueTwo`) debido a posibles animaciones visuales en el frontend o reglas de negocio asociadas a combinaciones concretas (dobles, etc.). 

El backend descompone de forma segura cualquier entero recibido en el rango válido asegurando que:
- $valueOne + valueTwo = total$
- Donde $valueOne, valueTwo \in [1, 6]$

### 3.3 Validación Mediante Casos de Prueba (Jest)
La robustez de este generador determinista está respaldada por una suite completa de pruebas de regresión unitaria (`session-forced-dice.test.ts`) que valida de forma exhaustiva los límites del algoritmo matemático mediante inyecciones parametrizadas (`it.each`):
- **Pruebas de Rango Acotado:** Se comprueba sistemáticamente con combinaciones dinámicas (los 11 totales posibles del 2 al 12) que ambos valores generados se mantengan estrictamente en el intervalo cerrado de $[1, 6]$.
- **Pruebas de Consistencia de Extremos e Intermedios (Edge Cases):**
  - El valor límite inferior (`total = 2`) genera de forma unívoca `[1, 1]`.
  - El valor neutro distributivo (`total = 7`) genera una distribución válida (`[4, 3]`).
  - El valor límite superior (`total = 12`) genera de forma unívoca `[6, 6]`.

---

## 4. Impacto en la Calidad del Software y Beneficios en el Ciclo de Desarrollo

La arquitectura conjunta del modo debug aporta un valor indispensable al proyecto:
1. **Aceleración de Pruebas Manuales (QA):** Los desarrolladores pueden forzar movimientos masivos para cruzar el mapa instantáneamente hacia las habitaciones deseadas, agilizando la revisión visual de las interfaces temáticas (*skins*).
2. **Determinismo Absoluto en Cypress (E2E):** Facilita la creación de guiones de prueba estables donde un peón avanza un número exacto de casillas para activar eventos síncronos de interacción (sugerencias y refutaciones).
3. **Aislamiento de Errores:** Al desacoplar el azar de las tiradas, si un peón realiza un movimiento inválido, queda inmediatamente demostrado que el error reside en el algoritmo espacial de grafos y no en una anomalía en la mutación de los estados del turno o de la sesión.
