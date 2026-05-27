# REACT_DOCTOR_FIXES

Rama: `fix/react-doctor`  
Puntuación inicial: **66/100** (323 issues — 7 errores, 316 advertencias)  
Puntuación final: **88/100** (133 issues — 3 errores, 130 advertencias)

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

## Issues pendientes (no resueltos)

Los siguientes issues permanecen por requerir decisiones de arquitectura, refactors extensos o cambios con riesgo funcional:

| Regla | Ocurrencias | Motivo |
|---|---|---|
| `effect-needs-cleanup` | ×3 | Los listeners de socket en `LobbyView`, `BoardView` y `TerminalView` necesitan análisis de ciclo de vida; el fix incorrecto causaría reconexiones. |
| `unused-dependency` | ×36 | Requiere borrar paquetes de `package.json` manualmente y verificar que ninguna importación dinámica los use. |
| `no-gray-on-colored-background` | ×15 | Ajuste puramente visual que requiere revisar el sistema de colores completo. |
| `no-chain-state-updates` | ×12 | En `TerminalView`, varias actualizaciones de estado están encadenadas en respuesta a eventos de socket; refactorizarlas a `useReducer` es un cambio amplio. |
| `use-lazy-motion` | ×11 | Requiere cambiar el import de `framer-motion`/`motion/react` a su variante lazy en todos los ficheros. |
| `label-has-associated-control` | ×10 | Algunos `<label>` no están asociados a su control (sin `htmlFor` o `<label>` wrapper); fix seguro pero laborioso. |
| `no-initialize-state` | ×9 | Inicializaciones de estado derivadas de props al primer render; requiere revisión caso por caso. |
| `prefer-useReducer` | ×7 | `TerminalView` y `AdminConfigView` tienen muchos estados relacionados que podrían fusionarse en un reducer. |
| `no-cascading-set-state` | ×7 | Actualizaciones de estado en cascada; refactor complejo. |
| `no-event-handler` | ×7 | Manejadores de evento nombrados como `handle*` pasados como prop directa sin memorizar. |
| `control-has-associated-label` | ×6 | Controles sin label accesible (algunos son intencionales como botones icono con tooltip). |
| `no-giant-component` | ×6 | `TerminalView` y `AdminConfigView` son componentes muy grandes; dividirlos es un refactor mayor. |
| `unused-dev-dependency` | ×2 | `prelude-ls` en devDependencies; eliminar después de confirmar que no es transitivo necesario. |
