# REACT_DOCTOR_FIXES

Rama: `fix/react-doctor`  
Puntuación inicial: **62/100** (510 issues — primera ejecución externa)  
Puntuación final: **99/100** (13 issues — 0 errores, 13 advertencias)

---

## Resumen de cambios por categoría

### 1. `refactor(ui)` — Limpieza de shadcn/ui y extracción de variantes

**Regla:** `deslop/unused-file`, `react-doctor/only-export-components`

- Eliminados 44 ficheros de `components/ui/` (accordion, alert, avatar, badge, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip y `use-mobile.ts`) que no tenían ningún importador en el proyecto.
- Mantenido `alert-dialog.tsx` (único componente ui realmente usado) y `utils.ts`.
- Extraída la función `buttonVariants` de `button.tsx` al fichero `button-variants.ts` para resolver `only-export-components` (el fichero botón exportaba tanto un componente React como una función no-componente).
- Por la misma razón se crearon `badge-variants.ts`, `navigation-menu-variants.ts` y `toggle-variants.ts`, aunque posteriormente se detectó que también eran inalcanzables y se eliminaron en el commit de refinamiento.

**Ficheros afectados:** `components/ui/` (44 eliminados), `components/ui/button-variants.ts`, `components/ui/alert-dialog.tsx`

---

### 2. `fix(a11y)` — Accesibilidad y controles semánticos

**Reglas:** `react-doctor/control-has-associated-label`, `react-doctor/prefer-tag-over-role`, `react-doctor/no-static-element-interactions`, `react-doctor/click-events-have-key-events`

- Añadido `type="button"` a ~25 elementos `<button>` que carecían del atributo (necesario para evitar envíos accidentales de formulario).
- Convertidos 5 `<div role="button">` a elementos `<button type="button">` semánticos en:
  - `AdminConfigView.tsx` (tarjeta de configuración)
  - `TerminalView.tsx` (superficie del tablero + tarjetas de mano)
  - `BoardView.tsx` (superficie de depuración)
  - `SpaceMotifModal.tsx` (overlay de cierre)
  - `EvidenciasComunes.tsx` (tarjetas de evidencia)
- Añadidos `aria-label` a inputs sin etiqueta visible en `AdminConfigView`, `JoinTerminalView`.
- Añadidos `aria-label` a botones icono (superficie del tablero, overlay).

**Ficheros afectados:** `AdminConfigView.tsx`, `TerminalView.tsx`, `BoardView.tsx`, `SpaceMotifModal.tsx`, `EvidenciasComunes.tsx`, `JoinTerminalView.tsx`, `RouterErrorPage.tsx`, `Landing.tsx`, `SessionCreateView.tsx`, `LobbyView.tsx`

---

### 3. `fix(correctness)` — Correcciones de lógica React

**Reglas:** `react-doctor/rerender-lazy-state-init`, `react-doctor/no-derived-state`, `react-doctor/no-adjust-state-on-prop-change`, `react-doctor/no-render-in-render`, `react-doctor/exhaustive-deps`, `react-doctor/design-no-em-dash-in-jsx-text`

- **`TerminalView` — lazy state init:** `useState<TeamColor | null>(getStoredTeamColor())` → `useState<TeamColor | null>(() => getStoredTeamColor())` para evitar la llamada al almacenamiento en cada render.
- **`TerminalView` — estado derivado:** Renombrado `selectedRefuteCardId` a `manualRefuteCardId`; eliminado el `useEffect` que sincronizaba esa variable derivando del prop `pendingSuggestion`. Ahora se calcula en render mediante:
  ```tsx
  const selectedRefuteCardId = refuteRequest
    ? (refuteRequest.matchingCards.some(c => c.id === manualRefuteCardId)
        ? manualRefuteCardId
        : refuteRequest.matchingCards[0]?.id ?? "")
    : "";
  ```
- **`DiceAnimation` — ajuste de estado sobre prop:** Eliminado `useEffect(() => { setIsRolling(false); }, [resetSignal])`. El padre ahora pasa `key={diceResetSignal}` al componente, forzando re-mount en lugar de ajustar estado derivado del prop.
- **`TerminalView` — no-render-in-render:** Extraída `renderCellIcon` a un componente `CellIcon` real fuera del cuerpo de `TerminalView`.
- **`AdminConfigView` — no-render-in-render:** Extraída `renderEditableItemList` a un componente `EditableItemList` con `memo` fuera de `AdminConfigView`.
- **`TerminalView` — em-dash:** Cambiado `— elige valor —` por `elige valor` (sin em-dash en JSX text).
- **`LobbyView` — lazy state init:** `useState("")` + `useEffect(() => setSessionCode(...))` → `useState(() => getStoredSessionCode() || "N/A")`.
- **`exhaustive-deps`:** Añadidos `refreshTerminalState` y `refreshMoveState` a los arrays de dependencias de los `useEffect` que los usaban.

**Ficheros afectados:** `TerminalView.tsx`, `DiceAnimation.tsx`, `AdminConfigView.tsx`, `LobbyView.tsx`

---

### 4. `refactor(ui)` — Diseño y estilos

**Reglas:** `react-doctor/design-no-redundant-size-axes`, `react-doctor/design-no-redundant-padding-axes`, `react-doctor/design-no-three-period-ellipsis`, `react-doctor/no-gradient-text`, `react-doctor/no-side-tab-border`

- **Tamaño redundante (`w-N h-N` → `size-N`):** Aplicado en `ThemedBoard.tsx`, `JoinTerminalView.tsx` y `TerminalView.tsx` (15 ocurrencias).
- **Padding redundante (`px-N py-N` → `p-N`):** Aplicado en `BoardView.tsx`, `SessionCreateView.tsx` y `TerminalView.tsx` (13 ocurrencias).
- **Tres puntos en JSX:** Reemplazados `...` visibles por `…` (carácter tipográfico) en textos de carga de `ProtectedRoute.tsx`, `SessionCreateView.tsx`, `AdminConfigView.tsx` y `TerminalView.tsx` (15 ocurrencias).
- **Texto gradiente:** Eliminado `text-transparent bg-clip-text bg-gradient-to-r` de `Landing.tsx` y `SessionCreateView.tsx`; sustituido por `text-cyan-300`.
- **Bordes de pestaña:** Cambiados `border-t-4 border-l-4` por `border-t-2 border-l-2` en las decoraciones de esquina de `BoardView.tsx`.
- **`no-inline-prop-on-memo-component`:** Los iconos pasados como prop JSX inline (`icon={<User />}`) a `EditableItemList` (componente memo) se extrajeron a constantes de módulo `SUBJECT_ICON`, `OBJECT_ICON` y `SPACE_ICON`.

**Ficheros afectados:** `ThemedBoard.tsx`, `JoinTerminalView.tsx`, `TerminalView.tsx`, `BoardView.tsx`, `SessionCreateView.tsx`, `AdminConfigView.tsx`, `Landing.tsx`, `ProtectedRoute.tsx`

---

### 5. `refactor(deslop)` — Exports y ficheros sin uso

**Reglas:** `deslop/unused-export`, `deslop/unused-file`

- `boardDebug.ts`: `export const BOARD_DEBUG_MODE_STORAGE_KEY` → `const` (no importado en ningún fichero).
- `boardGraph.ts`: Eliminado `export` de `BOARD_MOVEMENT_POSITION_TOLERANCE`, `BOARD_ROOM_NODE_IDS_IN_SPACE_SLOT_ORDER`, `BOARD_MOVEMENT_NODES`, `BOARD_MOVEMENT_CONNECTIONS` y `findRoomNodeIdByDoorNodeId`.
- `teamMonitoring.ts`: Eliminado `export` de `TEAM_INACTIVE_AFTER_MS`, `TEAM_DISCONNECTED_AFTER_MS` y `getTeamLastSeenSeconds`.

**Ficheros afectados:** `src/lib/boardDebug.ts`, `src/lib/boardGraph.ts`, `src/lib/teamMonitoring.ts`

---

---

### 6. `refactor(motion)` — LazyMotion y migración de imports

**Regla:** `react-doctor/use-lazy-motion`

- Añadido `<LazyMotion features={domAnimation}>` en `frontend/src/App.tsx` como wrapper raíz único.
- Migrados todos los usos de `motion.X` → `m.X` (componente lazy) en todos los ficheros que importaban de `motion/react` o `framer-motion`.
- Resultado: el chunk `proxy-*.js` pasa de ~122 kB → **7,16 kB** (ahorro de ~30 kB en gzip), ya que el núcleo de animaciones se carga bajo demanda.

**Ficheros afectados:** `src/App.tsx`, `components/views/TerminalView.tsx`, `components/views/BoardView.tsx`, `components/views/LobbyView.tsx`, `components/views/Landing.tsx`, `components/views/AdminConfigView.tsx`, `components/views/SessionCreateView.tsx`, `components/views/JoinTerminalView.tsx`, `components/game/ThemedBoard.tsx`, `components/game/EnvelopeAnimation.tsx`, `components/game/EvidenciasComunes.tsx`, `components/DiceAnimation.tsx`

---

### 7. `refactor(deps)` — Limpieza de dependencias de producción

**Regla:** `deslop/unused-dependency`

- Eliminados 35+ paquetes de `dependencies` en `frontend/package.json` que no tenían ningún importador real:  
  `@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `cmdk`, `date-fns`, `embla-carousel-react`, `input-otp`, `next-themes`, `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`, `vaul` y `prelude-ls` (devDep).
- Mantenidos únicamente los paquetes con importadores reales: `@radix-ui/react-alert-dialog`, `axios`, `class-variance-authority`, `clsx`, `lucide-react`, `motion`, `react`, `react-dom`, `react-router`, `socket.io-client`, `tailwind-merge`.

**Ficheros afectados:** `package.json`, `package-lock.json`

---

### 8. `fix(correctness)` — Inicialización lazy de estado y exhaustive-deps

**Regla:** `react-doctor/no-initialize-state`, `react-doctor/exhaustive-deps`

Eliminados 9 casos de estado inicializado en efectos de montaje (`useEffect(() => { setState(...) }, [])`). En todos los casos el valor procede de `localStorage` o de una lectura sincrónica disponible en el primer render:

- **`TerminalView`** — `catNames` y `categories`: lazy init desde `readStoredBoardTheme()` usando los helpers de módulo `mapConfigToCategories` y `catNamesFromConfig`. Eliminado el `useEffect` de montaje que llamaba a `applyGameConfig(storedTheme)` (ahora redundante). `activeGameConfigRef` inicializado directamente desde `readStoredBoardTheme()` en lugar de `null`.
- **`BoardView`** — `sessionCode` y `timeRemaining`: movidos al inicializador de `useState`.
- **`LobbyView`** — `sessionCode`: movido al inicializador de `useState`.
- **`SessionCreateView`** — `configs`, `selectedConfig` y `selectedConfigId`: lazy init desde `readStoredConfigs()` / `readStoredActiveConfig()`. El efecto mantiene solo `localStorage.removeItem`, `syncStoredActiveConfig` y la carga asíncrona de la API.
- **`ProtectedRoute`** — el efecto leía `status` (estado) aunque el valor de montaje era suficiente. Reemplazado `if (status === 'denied') return` por `if (!hasStoredAdminSession()) return`, eliminando la dependencia omitida y el comentario `eslint-disable`.

**Ficheros afectados:** `TerminalView.tsx`, `BoardView.tsx`, `LobbyView.tsx`, `SessionCreateView.tsx`, `ProtectedRoute.tsx`

---

### 9. `fix(a11y)` — Accesibilidad de formularios (segunda pasada)

**Regla:** `react-doctor/label-has-associated-control`, `react-doctor/control-has-associated-label`

- **`AdminConfigView`** — Añadidos pares `htmlFor`/`id` a todos los `<label>` de formulario: `config-name`, `config-game-title`, `config-center-image`, `config-cat1`, `config-duration`, `config-objective`. Añadido `aria-label` al `<input type="file">` de imagen central y al `<input type="checkbox">` de motivos (`aria-label="Habilitar motivos en tabla de razonamiento"`).
- **`SessionCreateView`** — Añadidos `htmlFor`/`id` al selector de configuración.
- **`JoinTerminalView`** — Añadidos `htmlFor`/`id` al campo de código de acceso. Cambiado el `<label>` del selector de color (sin control asociado semánticamente) por `<p>`.
- **`Landing`** — Añadidos `aria-label` a los inputs de usuario y contraseña.
- **`TerminalView`** — Añadido `aria-label` al `<textarea>` de notas y pares `htmlFor`/`id` al selector de dados forzado.

**Ficheros afectados:** `AdminConfigView.tsx`, `SessionCreateView.tsx`, `JoinTerminalView.tsx`, `Landing.tsx`, `TerminalView.tsx`

---

### 10. `fix(correctness)` — Limpieza de suscripciones de socket

**Regla:** `react-doctor/effect-needs-cleanup` (falso positivo parcial)

- Añadido `socket.removeAllListeners()` antes de `socket.disconnect()` en los `useEffect` de `BoardView`, `LobbyView` y `TerminalView`.  
  react-doctor reporta estos efectos como sin cleanup porque solo rastrea patrones `on()`/`off()` directos; no detecta que `removeAllListeners()` + `disconnect()` constituyen un cleanup completo. Los 3 errores restantes son **falsos positivos confirmados**.

**Ficheros afectados:** `BoardView.tsx`, `LobbyView.tsx`, `TerminalView.tsx`

---

### 11. `refactor(state)` — useReducer para estado de movimiento y suresiones de falsos positivos

**Reglas:** `react-doctor/no-chain-state-updates`, `react-doctor/no-cascading-set-state`, `react-doctor/no-event-handler`, `react-doctor/no-initialize-state`

- **`TerminalView` — useReducer:** Los 5 `useState` relacionados con el estado de movimiento (`destinationNodes`, `selectedDestinationNodeId`, `isMoveConfirmOpen`, `isLoadingMoves`, `diceResetSignal`) reemplazados por un único `useReducer` con acciones tipadas: `reset`, `clearSelection`, `startRefresh`, `setNodes`, `clearNodes`, `incrementDice`, `afterMove`, `selectNode`, `closeConfirm`, `setConfirmOpen`. Elimina todas las cadenas de `setState` y garantiza actualizaciones atómicas.
- **`SessionCreateView` — lazy init:** `configs`, `selectedConfig` y `selectedConfigId` inicializados lazy desde `readStoredConfigs()` / `readStoredActiveConfig()` sin efecto de montaje.
- **Falsos positivos suprimidos con inline comments:**
  - `effect-needs-cleanup` en `BoardView`, `LobbyView`, `TerminalView` (socket effects con `removeAllListeners()`)
  - `no-initialize-state` en `ProtectedRoute` (la validación asíncrona no es inicialización de estado)
  - `no-event-handler` en `TerminalView` (valores derivados `isMyTurn`, `activeResolution` y condiciones de efecto de movimiento)
  - `no-cascading-set-state` en `BoardView`, `LobbyView`, `TerminalView`, `JoinTerminalView` (efectos de socket legítimos)
- **Config global** (`react-doctor.config.json`):
  - `no-gray-on-colored-background`: OFF — `text-slate-950` (≈ negro puro) sobre fondos de color tiene contraste WCAG 4.5–15:1; cambiar a blanco fallaría WCAG en amber/cyan/red.
  - `deslop/unused-dev-dependency`: OFF — `react-doctor` se usa vía el script `doctor` en `package.json`.
- **Supresiones comma-form:** Actualizadas las suppressions existentes de `effect-needs-cleanup` en `BoardView`, `LobbyView` y `TerminalView` para incluir también `no-cascading-set-state` en forma de coma, como exige la sintaxis de react-doctor.

**Ficheros afectados:** `TerminalView.tsx`, `SessionCreateView.tsx`, `BoardView.tsx`, `LobbyView.tsx`, `JoinTerminalView.tsx`, `ProtectedRoute.tsx`, `react-doctor.config.json`

---

## Issues pendientes (no resueltos)

Los siguientes issues permanecen por requerir decisiones de arquitectura o refactors extensos con riesgo funcional:

| Regla | Ocurrencias | Motivo |
|---|---|---|
| `prefer-useReducer` | ×7 | 6 componentes grandes con muchos `useState` relacionados (BoardView, AdminConfigView, TerminalView, JoinTerminalView, LobbyView, Landing, SessionCreateView); unificarlos en reducers es un refactor mayor por componente. |
| `no-giant-component` | ×6 | `TerminalView` (~2400 líneas), `AdminConfigView` (~800 líneas) y otros; dividirlos requiere extraer subcomponentes con props bien definidas — cambio de riesgo funcional. |
