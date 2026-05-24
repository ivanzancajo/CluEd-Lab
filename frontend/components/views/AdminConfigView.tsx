import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Box,
  Clock,
  FileText,
  KeyRound,
  List,
  MapPin,
  Plus,
  Save,
  Settings,
  Target,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { clearAdminSession } from "../../src/lib/auth";
import {
  createSkinConfig,
  deleteSkinConfig,
  type GameConfig,
  getSkinConfig,
  getSkinErrorMessage,
  listSkinSummaries,
  COLLECTION_CONSTRAINTS,
  type SkinItem,
  type SkinItemPayload,
  type SkinSummary,
  updateSkinConfig,
  validateSkinComposition,
} from "../../src/lib/skinApi";

type ActiveTab = "list" | "general" | "sujetos" | "objetos" | "espacios";

type EditableSkinItem = SkinItemPayload & {
  localId: string;
};

const DEFAULT_CONFIG_NAME = "Nueva Configuración";
const DEFAULT_GAME_TITLE = "ClueLab Creator";
const DEFAULT_OBJECTIVE = "Evaluación de resolución de problemas lógicos en entornos técnicos.";
const DEFAULT_DURATION = "60";
const DEFAULT_CAT_1 = "Sujetos";
const DEFAULT_CAT_2 = "Objetos";
const DEFAULT_CAT_3 = "Espacios";

const GAME_CONFIGS_KEY = "gameConfigs";
const ACTIVE_CONFIG_KEY = "activeConfig";
const DURATION_KEY = "duration";
const GAME_TITLE_KEY = "gameTitle";
const CENTER_IMAGE_KEY = "centerImage";

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createLocalItemId() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toEditableItems(items: SkinItem[]) {
  return items.map((item) => ({
    ...item,
    localId: item.id,
  }));
}

function toPayloadItems(items: EditableSkinItem[]): SkinItemPayload[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    desc: item.desc,
    motif: normalizeOptionalText(item.motif ?? ""),
    imageUrl: normalizeOptionalText(item.imageUrl ?? ""),
  }));
}

function buildItemErrorMap(
  items: EditableSkinItem[],
  nameIndices: Set<number>,
  motifIndices: Set<number>
): Map<string, ("name" | "motif")[]> {
  const map = new Map<string, ("name" | "motif")[]>();
  items.forEach((item, index) => {
    const fields: ("name" | "motif")[] = [];
    if (nameIndices.has(index)) fields.push("name");
    if (motifIndices.has(index)) fields.push("motif");
    if (fields.length > 0) map.set(item.localId, fields);
  });
  return map;
}

function areCollectionsEqual(left: SkinItem[], right: SkinItemPayload[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const candidate = right[index];
    return (
      item.id === candidate.id &&
      item.name === candidate.name &&
      item.desc === candidate.desc &&
      (item.imageUrl ?? undefined) === (candidate.imageUrl ?? undefined) &&
      (item.motif ?? undefined) === (candidate.motif ?? undefined)
    );
  });
}

function readStoredConfigs() {
  if (typeof window === "undefined") {
    return [] as GameConfig[];
  }

  const stored = localStorage.getItem(GAME_CONFIGS_KEY);
  if (!stored) {
    return [] as GameConfig[];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? (parsed as GameConfig[]) : ([] as GameConfig[]);
  } catch {
    return [] as GameConfig[];
  }
}

function storeConfigList(configs: GameConfig[]) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(GAME_CONFIGS_KEY, JSON.stringify(configs));
}

function syncStoredActiveConfig(config: GameConfig) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(ACTIVE_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(DURATION_KEY, config.duration);
  localStorage.setItem(GAME_TITLE_KEY, config.gameTitle);
  localStorage.setItem(CENTER_IMAGE_KEY, config.centerImage);
}

function clearStoredActiveConfig() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ACTIVE_CONFIG_KEY);
  localStorage.removeItem(DURATION_KEY);
  localStorage.removeItem(GAME_TITLE_KEY);
  localStorage.removeItem(CENTER_IMAGE_KEY);
}

async function syncStoredConfigsFromRemote(summaries: SkinSummary[]) {
  if (typeof window === "undefined") {
    return;
  }

  if (summaries.length === 0) {
    storeConfigList([]);
    clearStoredActiveConfig();
    return;
  }

  const cachedById = new Map(readStoredConfigs().map((config) => [config.id, config]));
  const results = await Promise.allSettled(summaries.map((summary) => getSkinConfig(summary.id)));
  const loadedById = new Map<string, GameConfig>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      loadedById.set(result.value.id, result.value);
    }
  }

  const nextStoredConfigs = summaries.flatMap((summary) => {
    const loaded = loadedById.get(summary.id);
    if (loaded) {
      return [loaded];
    }

    const cached = cachedById.get(summary.id);
    return cached ? [cached] : [];
  });

  storeConfigList(nextStoredConfigs);
}

export function AdminConfigView() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("list");
  const [configs, setConfigs] = useState<SkinSummary[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [persistedConfig, setPersistedConfig] = useState<GameConfig | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [configName, setConfigName] = useState(DEFAULT_CONFIG_NAME);
  const [gameTitle, setGameTitle] = useState(DEFAULT_GAME_TITLE);
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [centerImage, setCenterImage] = useState("");
  const [cat1Name, setCat1Name] = useState(DEFAULT_CAT_1);
  const [cat2Name, setCat2Name] = useState(DEFAULT_CAT_2);
  const [cat3Name, setCat3Name] = useState(DEFAULT_CAT_3);
  const [hasMotifs, setHasMotifs] = useState(false);

  const [subjects, setSubjects] = useState<EditableSkinItem[]>([]);
  const [objects, setObjects] = useState<EditableSkinItem[]>([]);
  const [spaces, setSpaces] = useState<EditableSkinItem[]>([]);

  const fieldsDisabled = detailLoading || saving;
  const isBusy = listLoading || detailLoading || saving;

  const subjectPayload = useMemo(() => toPayloadItems(subjects), [subjects]);
  const objectPayload = useMemo(() => toPayloadItems(objects), [objects]);
  const spacePayload = useMemo(() => toPayloadItems(spaces), [spaces]);

  const validation = useMemo(
    () =>
      validateSkinComposition({
        hasMotifs,
        subjects: subjectPayload,
        objects: objectPayload,
        spaces: spacePayload,
      }),
    [hasMotifs, subjectPayload, objectPayload, spacePayload]
  );

  const itemErrors = useMemo(() => {
    const { duplicateIndices } = validation;
    return {
      subjects: buildItemErrorMap(subjects, duplicateIndices.subjectNames, new Set()),
      objects: buildItemErrorMap(objects, duplicateIndices.objectNames, new Set()),
      spaces: buildItemErrorMap(spaces, duplicateIndices.spaceNames, duplicateIndices.spaceMotifs),
    };
  }, [validation, subjects, objects, spaces]);

  const metadataReady = [configName, gameTitle, objective, cat1Name, cat2Name, cat3Name].every(
    (value) => value.trim().length > 0
  );

  const canSave = activeTab !== "list" && !fieldsDisabled;
  const saveBlockerMessage = useMemo(() => {
    if (activeTab === "list") {
      return "Crea o carga una configuración para poder guardarla.";
    }

    if (detailLoading) {
      return "Espera a que termine de cargarse la configuración antes de guardar.";
    }

    if (saving) {
      return "Guardando configuración...";
    }

    if (!metadataReady) {
      return "Completa nombre, título, objetivo y nombres de categorías antes de guardar.";
    }

    if (!validation.isValid) {
      return validation.errors[0] ?? "La skin no cumple las reglas de composición requeridas.";
    }

    return null;
  }, [activeTab, detailLoading, metadataReady, saving, validation.errors, validation.isValid]);

  const applyConfigToForm = (config: GameConfig) => {
    setPersistedConfig(config);
    setActiveConfigId(config.id);
    setConfigName(config.name);
    setGameTitle(config.gameTitle);
    setObjective(config.objective);
    setDuration(config.duration);
    setCenterImage(config.centerImage);
    setCat1Name(config.cat1Name);
    setCat2Name(config.cat2Name);
    setCat3Name(config.cat3Name);
    setHasMotifs(config.hasMotifs);
    setSubjects(toEditableItems(config.subjects));
    setObjects(toEditableItems(config.objects));
    setSpaces(toEditableItems(config.spaces));
  };

  const resetDraftForm = (configCount: number) => {
    setPersistedConfig(null);
    setActiveConfigId(null);
    setConfigName(`${DEFAULT_CONFIG_NAME} ${configCount + 1}`);
    setGameTitle(DEFAULT_GAME_TITLE);
    setObjective(DEFAULT_OBJECTIVE);
    setDuration(DEFAULT_DURATION);
    setCenterImage("");
    setCat1Name(DEFAULT_CAT_1);
    setCat2Name(DEFAULT_CAT_2);
    setCat3Name(DEFAULT_CAT_3);
    setHasMotifs(false);
    setSubjects([]);
    setObjects([]);
    setSpaces([]);
  };

  const refreshConfigs = useCallback(async () => {
    setListLoading(true);
    setErrorMessage(null);

    try {
      const items = await listSkinSummaries();
      setConfigs(items);
      await syncStoredConfigsFromRemote(items);

      if (items.length === 0) {
        clearStoredActiveConfig();
      }
    } catch (error) {
      setErrorMessage(getSkinErrorMessage(error, "No se pudieron cargar las configuraciones disponibles."));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshConfigs();
  }, [refreshConfigs]);

  const loadConfig = async (configId: string) => {
    if (detailLoading || saving) {
      return;
    }

    setDetailLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const config = await getSkinConfig(configId);
      applyConfigToForm(config);
      syncStoredActiveConfig(config);
      setStatusMessage(`Configuración "${config.name}" cargada correctamente.`);
      setActiveTab("general");
    } catch (error) {
      setErrorMessage(getSkinErrorMessage(error, "No se pudo cargar la configuración seleccionada."));
    } finally {
      setDetailLoading(false);
    }
  };

  const createNewConfig = () => {
    setErrorMessage(null);
    setStatusMessage("Borrador nuevo preparado. Completa las ternas y guarda cuando la skin cumpla 6-6-9.");
    resetDraftForm(configs.length);
    setActiveTab("general");
  };

  const deleteConfig = async (id: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (isBusy) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await deleteSkinConfig(id);

      if (activeConfigId === id) {
        clearStoredActiveConfig();
        resetDraftForm(Math.max(configs.length - 1, 0));
        setActiveTab("list");
      }

      await refreshConfigs();
      setStatusMessage("Configuración eliminada correctamente.");
    } catch (error) {
      setErrorMessage(getSkinErrorMessage(error, "No se pudo eliminar la configuración seleccionada."));
    } finally {
      setSaving(false);
    }
  };

  const handleCenterImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setCenterImage(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveConfig = async () => {
    if (activeTab === "list" || saving || detailLoading) {
      return;
    }

    if (!metadataReady) {
      setErrorMessage("Debes completar nombre, título, objetivo y nombres de categorías antes de guardar.");
      setStatusMessage(null);
      return;
    }

    if (!validation.isValid) {
      setErrorMessage(validation.errors[0] ?? "La skin no cumple las reglas de composición requeridas.");
      setStatusMessage(null);
      return;
    }

    const normalizedDuration = Number(duration.trim());

    if (!Number.isInteger(normalizedDuration) || normalizedDuration < 1 || normalizedDuration > 480) {
      setErrorMessage("La duración debe ser un número entero entre 1 y 480 minutos.");
      setStatusMessage(null);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const basePayload = {
      name: configName,
      gameTitle,
      objective,
      duration: normalizedDuration,
      centerImage: normalizeOptionalText(centerImage),
      cat1Name,
      cat2Name,
      cat3Name,
      hasMotifs,
    };

    const collectionsPayload = {
      subjects: subjectPayload,
      objects: objectPayload,
      spaces: spacePayload,
    };

    const hasCollectionChanges =
      !persistedConfig ||
      !areCollectionsEqual(persistedConfig.subjects, collectionsPayload.subjects) ||
      !areCollectionsEqual(persistedConfig.objects, collectionsPayload.objects) ||
      !areCollectionsEqual(persistedConfig.spaces, collectionsPayload.spaces);

    try {
      const savedConfig = activeConfigId
        ? await updateSkinConfig(
            activeConfigId,
            hasCollectionChanges ? { ...basePayload, ...collectionsPayload } : basePayload
          )
        : await createSkinConfig({
            ...basePayload,
            ...collectionsPayload,
          });

      applyConfigToForm(savedConfig);
      syncStoredActiveConfig(savedConfig);
      await refreshConfigs();
      setStatusMessage(`Configuración "${savedConfig.name}" guardada correctamente.`);
      setActiveTab("list");
    } catch (error) {
      setErrorMessage(getSkinErrorMessage(error, "No se pudo guardar la configuración."));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearAdminSession();
    window.location.assign("/");
  };

  const renderEditableItemList = (
    items: EditableSkinItem[],
    setItems: Dispatch<SetStateAction<EditableSkinItem[]>>,
    icon: ReactNode,
    type: string,
    collectionKey: "subjects" | "objects" | "spaces",
    minItems: number,
    maxItems: number,
    showMotif: boolean,
    errorItems: Map<string, ("name" | "motif")[]>
  ) => {
    const updateItem = (localId: string, updater: (item: EditableSkinItem) => EditableSkinItem) => {
      setItems((currentItems) => currentItems.map((item) => (item.localId === localId ? updater(item) : item)));
    };

    const removeItem = (localId: string) => {
      setItems((currentItems) => currentItems.filter((item) => item.localId !== localId));
    };

    const addItem = () => {
      if (items.length >= maxItems || fieldsDisabled) {
        return;
      }

      setItems((currentItems) => [
        ...currentItems,
        {
          localId: createLocalItemId(),
          name: "",
          desc: "",
          imageUrl: "",
          ...(showMotif ? { motif: "" } : {}),
        },
      ]);
    };

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300">
            {type}s configurados: {items.length}/{minItems === maxItems ? maxItems : `${minItems}-${maxItems}`}
          </div>
          {showMotif ? (
            <p>Cuando los motivos están habilitados, la tabla de razonamiento mostrará el motivo en lugar del nombre del espacio.</p>
          ) : minItems === maxItems ? (
            <p>Edita los elementos de esta terna y completa exactamente {maxItems} para poder guardar la skin.</p>
          ) : (
            <p>Edita los elementos de esta terna y completa entre {minItems} y {maxItems} para poder guardar la skin.</p>
          )}
        </div>

        {items.map((item, index) => (
          <div
            key={item.localId}
            data-cy={`admin-config-${collectionKey}-item`}
            className="group relative flex gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-cyan-800"
          >
            <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-950">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name || `${type} ${index + 1}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-700">
                  {icon}
                  <span className="text-[8px] uppercase">Sin Imagen</span>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center gap-2 text-cyan-500">
                {icon}
                <span className="text-xs font-bold uppercase">{type} {index + 1}</span>
                <button
                  onClick={() => removeItem(item.localId)}
                  disabled={fieldsDisabled}
                  data-cy={`admin-config-${collectionKey}-remove-button`}
                  className="ml-auto text-xs font-bold uppercase tracking-widest text-slate-600 hover:text-red-500 disabled:text-slate-700"
                >
                  Remover
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={item.name}
                  disabled={fieldsDisabled}
                  data-cy={`admin-config-${collectionKey}-name-input`}
                  onChange={(event) => updateItem(item.localId, (currentItem) => ({ ...currentItem, name: event.target.value }))}
                  className={`w-full rounded border bg-slate-950 p-3 font-bold text-cyan-100 outline-none disabled:opacity-60 ${
                    errorItems.get(item.localId)?.includes("name")
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-slate-700 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500"
                  }`}
                  placeholder={`Nombre del ${type.toLowerCase()}...`}
                />

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={item.imageUrl ?? ""}
                    disabled={fieldsDisabled}
                    data-cy={`admin-config-${collectionKey}-image-input`}
                    onChange={(event) => updateItem(item.localId, (currentItem) => ({ ...currentItem, imageUrl: event.target.value }))}
                    className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-cyan-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                    placeholder="URL de imagen..."
                  />
                  <label
                    className={`flex items-center justify-center rounded border px-3 ${
                      fieldsDisabled
                        ? "cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600"
                        : "cursor-pointer border-slate-700 bg-slate-800 text-slate-400 hover:border-cyan-500 hover:bg-cyan-900 hover:text-cyan-400"
                    }`}
                    title="Subir imagen local"
                  >
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={fieldsDisabled}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }

                        const reader = new FileReader();
                        reader.onloadend = () => {
                          updateItem(item.localId, (currentItem) => ({
                            ...currentItem,
                            imageUrl: typeof reader.result === "string" ? reader.result : "",
                          }));
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
              </div>

              {showMotif ? (
                <input
                  type="text"
                  value={item.motif ?? ""}
                  disabled={fieldsDisabled}
                  data-cy={`admin-config-${collectionKey}-motif-input`}
                  onChange={(event) => updateItem(item.localId, (currentItem) => ({ ...currentItem, motif: event.target.value }))}
                  className={`w-full rounded border bg-slate-950 p-3 text-xs outline-none disabled:opacity-60 ${
                    errorItems.get(item.localId)?.includes("motif")
                      ? "border-red-500 ring-1 ring-red-500 text-red-200"
                      : "border-purple-900/50 text-purple-200 focus:border-purple-400 focus:ring-1 focus:ring-purple-500"
                  }`}
                  placeholder="Motivo asociado a este espacio..."
                />
              ) : null}

              <textarea
                value={item.desc}
                disabled={fieldsDisabled}
                data-cy={`admin-config-${collectionKey}-desc-input`}
                onChange={(event) => updateItem(item.localId, (currentItem) => ({ ...currentItem, desc: event.target.value }))}
                rows={3}
                className="w-full resize-none rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                placeholder="Descripción o pista..."
              ></textarea>
            </div>
          </div>
        ))}

        <button
          onClick={addItem}
          disabled={fieldsDisabled || items.length >= maxItems}
          data-cy={`admin-config-${collectionKey}-add-button`}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 p-4 text-xs font-bold uppercase tracking-widest text-slate-500 transition-all hover:border-cyan-500 hover:bg-slate-900/50 hover:text-cyan-400 disabled:border-slate-800 disabled:bg-transparent disabled:text-slate-700"
        >
          <Plus className="h-4 w-4" /> Añadir {type}
        </button>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen w-full overflow-hidden bg-[#020617] font-mono text-cyan-400">
      <div className="sticky top-0 z-20 flex h-screen w-[320px] flex-col border-r border-cyan-800/50 bg-slate-900/40">
        <div className="flex items-center gap-4 border-b border-cyan-800/50 bg-slate-900/60 p-6">
          <Link to="/" className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-cyan-400">
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div>
            <h1 className="text-sm font-bold tracking-widest text-emerald-400">ADMINISTRACIÓN</h1>
            <p className="text-[10px] text-slate-500">CONFIGURAR CLUEDOSKIN</p>
          </div>

          <button
            onClick={handleLogout}
            data-cy="admin-config-logout-button"
            className="ml-auto rounded-md border border-red-900/60 bg-slate-950/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-300 transition-colors hover:border-red-500 hover:text-red-200"
          >
            Salir
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          <button
            onClick={() => setActiveTab("list")}
            data-cy="admin-config-tab-list"
            className={`flex items-center gap-3 rounded-lg border p-4 text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === "list"
                ? "border-indigo-500 bg-indigo-950/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                : "border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            }`}
          >
            <List className="h-4 w-4" /> Mis Configuraciones
          </button>

          {activeTab !== "list" ? (
            <>
              <div className="my-2 border-t border-slate-800"></div>

              <button
                onClick={() => setActiveTab("general")}
                data-cy="admin-config-tab-general"
                className={`flex items-center gap-3 rounded-lg border p-4 text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === "general"
                    ? "border-cyan-500 bg-cyan-950/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                }`}
              >
                <Settings className="h-4 w-4" /> Ajustes Generales
              </button>

              <button
                onClick={() => setActiveTab("sujetos")}
                data-cy="admin-config-tab-subjects"
                className={`flex items-center gap-3 rounded-lg border p-4 text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === "sujetos"
                    ? "border-cyan-500 bg-cyan-950/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                }`}
              >
                <User className="h-4 w-4" /> {cat1Name} ({subjects.length}/{COLLECTION_CONSTRAINTS.subjects.min}-{COLLECTION_CONSTRAINTS.subjects.max})
              </button>

              <button
                onClick={() => setActiveTab("objetos")}
                data-cy="admin-config-tab-objects"
                className={`flex items-center gap-3 rounded-lg border p-4 text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === "objetos"
                    ? "border-emerald-500 bg-emerald-950/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                    : "border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                }`}
              >
                <Box className="h-4 w-4" /> {cat2Name} ({objects.length}/{COLLECTION_CONSTRAINTS.objects.min}-{COLLECTION_CONSTRAINTS.objects.max})
              </button>

              <button
                onClick={() => setActiveTab("espacios")}
                data-cy="admin-config-tab-spaces"
                className={`flex items-center gap-3 rounded-lg border p-4 text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === "espacios"
                    ? "border-red-500 bg-red-950/30 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                    : "border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                }`}
              >
                <MapPin className="h-4 w-4" /> {cat3Name} ({spaces.length}/{COLLECTION_CONSTRAINTS.spaces.min})
              </button>
            </>
          ) : null}
        </nav>

        <div className="border-t border-cyan-800/50 bg-slate-900/80 p-6">
          <button
            onClick={handleSaveConfig}
            disabled={!canSave}
            data-cy="admin-config-save-button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-4 font-bold uppercase tracking-widest text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all active:scale-95 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
          >
            <Save className="h-5 w-5" /> {saving ? "Guardando..." : "Guardar Configuración"}
          </button>

          {saveBlockerMessage ? (
            <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
              {saveBlockerMessage}
            </p>
          ) : (
            <p className="mt-3 text-center text-[11px] leading-5 text-emerald-300">
              La skin cumple las reglas y está lista para guardarse.
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 to-[#020617] p-10">
        <div className="mb-6 flex max-w-4xl flex-col gap-4">
          {listLoading ? (
            <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
              Cargando configuraciones disponibles...
            </div>
          ) : null}

          {detailLoading ? (
            <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 px-4 py-3 text-sm text-indigo-100">
              Cargando el detalle completo de la configuración seleccionada...
            </div>
          ) : null}

          {statusMessage ? (
            <div data-cy="admin-config-status-message" className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
              {statusMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div data-cy="admin-config-error-message" className="rounded-xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {activeTab !== "list" ? (
            <div
              data-cy="admin-config-validation-summary"
              className={`rounded-xl border px-4 py-3 text-sm ${
                validation.isValid
                  ? "border-emerald-900/60 bg-emerald-950/20 text-emerald-100"
                  : "border-amber-900/60 bg-amber-950/20 text-amber-100"
              }`}
            >
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest">Estado de la skin</div>
              <div className="mb-2 flex flex-wrap gap-4">
                <span>{cat1Name}: {validation.counts.subjects}/{COLLECTION_CONSTRAINTS.subjects.min}-{COLLECTION_CONSTRAINTS.subjects.max}</span>
                <span>{cat2Name}: {validation.counts.objects}/{COLLECTION_CONSTRAINTS.objects.min}-{COLLECTION_CONSTRAINTS.objects.max}</span>
                <span>{cat3Name}: {validation.counts.spaces}/{COLLECTION_CONSTRAINTS.spaces.min}</span>
              </div>
              {!validation.isValid ? (
                <ul className="list-inside list-disc space-y-1">
                  {validation.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : (
                <p>La skin cumple la composición requerida y ya se puede guardar.</p>
              )}
            </div>
          ) : null}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "list" ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex max-w-4xl flex-col gap-8"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="mb-2 flex items-center gap-3 text-2xl font-black uppercase tracking-widest text-indigo-400">
                    <List className="h-8 w-8 text-indigo-500" /> Historial de Configuraciones
                  </h2>
                  <p className="text-sm text-slate-400">
                    Selecciona una skin existente o crea un nuevo borrador conectado al backend real.
                  </p>
                </div>

                <button
                  onClick={createNewConfig}
                  disabled={isBusy}
                  data-cy="admin-config-create-button"
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <Plus className="h-4 w-4" /> Crear Nueva
                </button>
              </div>

              {!listLoading && configs.length === 0 ? (
                <div data-cy="admin-config-empty-state" className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-slate-800 p-12 text-slate-500">
                  <List className="h-12 w-12 opacity-50" />
                  <p>No hay configuraciones remotas guardadas.</p>
                  <button data-cy="admin-config-empty-create-button" onClick={createNewConfig} className="text-indigo-400 hover:underline">
                    Comienza creando una aquí
                  </button>
                </div>
              ) : null}

              {configs.length > 0 ? (
                <div data-cy="admin-config-list" className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {configs.map((config) => (
                    <div
                      key={config.id}
                      onClick={() => void loadConfig(config.id)}
                      data-cy="admin-config-card"
                      className={`group relative rounded-xl border border-slate-700 bg-slate-900/60 p-6 transition-all ${
                        isBusy ? "cursor-wait opacity-70" : "cursor-pointer hover:border-indigo-500"
                      }`}
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <h3 data-cy="admin-config-card-title" className="text-lg font-bold text-white transition-colors group-hover:text-indigo-400">
                          {config.name}
                        </h3>
                        <button
                          onClick={(event) => void deleteConfig(config.id, event)}
                          disabled={isBusy}
                          data-cy="admin-config-card-delete-button"
                          className="p-1 text-slate-600 transition-colors hover:text-red-500 disabled:text-slate-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="space-y-2 text-sm text-slate-400">
                        <p><span className="text-slate-500">Título:</span> {config.gameTitle}</p>
                        <p><span className="text-slate-500">Duración:</span> {config.duration} min</p>
                        <div className="mt-2 flex gap-4 border-t border-slate-800 pt-2 text-xs">
                          <span className="flex items-center gap-1"><User className="h-3 w-3 text-cyan-500" /> {config.subjectCount}</span>
                          <span className="flex items-center gap-1"><Box className="h-3 w-3 text-emerald-500" /> {config.objectCount}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-red-500" /> {config.spaceCount}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </motion.div>
          ) : null}

          {activeTab === "general" ? (
            <motion.div
              key="general"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex max-w-3xl flex-col gap-8"
            >
              <div>
                <h2 className="mb-2 flex items-center gap-3 text-2xl font-black uppercase tracking-widest text-white">
                  <Settings className="h-8 w-8 text-cyan-500" /> Ajustes de la Sesión
                </h2>
                <p className="text-sm text-slate-400">
                  Configura los metadatos generales de la skin y habilita motivos en espacios si quieres que la matriz muestre esos textos en lugar de los espacios.
                </p>
              </div>

              <div className="flex flex-col gap-6 rounded-xl border border-cyan-900/50 bg-slate-900/50 p-6 shadow-[0_0_30px_-5px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2 border-b border-slate-800 pb-6">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                    <FileText className="h-4 w-4" /> Nombre de la cluedoskin
                  </label>
                  <input
                    type="text"
                    value={configName}
                    disabled={fieldsDisabled}
                    data-cy="admin-config-name-input"
                    onChange={(event) => setConfigName(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-bold text-indigo-100 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                    placeholder="Ej. Clásico IT v1"
                  />
                </div>

                <div className="flex flex-col gap-2 border-b border-slate-800 pb-6">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-500">
                    <Settings className="h-4 w-4" /> Título de la Partida Pública
                  </label>
                  <input
                    type="text"
                    value={gameTitle}
                    disabled={fieldsDisabled}
                    data-cy="admin-config-game-title-input"
                    onChange={(event) => setGameTitle(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-bold text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                    placeholder="Ej. ClueLab Creator"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-500">
                    <KeyRound className="h-4 w-4" /> Imagen Central del Mapa (Logo)
                  </label>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={centerImage}
                      disabled={fieldsDisabled}
                      data-cy="admin-config-center-image-input"
                      onChange={(event) => setCenterImage(event.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                      placeholder="URL de la imagen central..."
                    />
                    <label
                      className={`flex flex-col items-center justify-center rounded-lg border px-6 text-xs font-bold uppercase tracking-widest shadow-inner transition-colors ${
                        fieldsDisabled
                          ? "cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600"
                          : "cursor-pointer border-cyan-800 bg-slate-800 text-cyan-400 hover:bg-cyan-900"
                      }`}
                    >
                      <Upload className="mb-1 h-4 w-4" />
                      Subir
                      <input type="file" accept="image/*" className="hidden" disabled={fieldsDisabled} onChange={handleCenterImageUpload} />
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4 border-t border-slate-800 pt-6">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">
                    <Target className="h-4 w-4" /> Nombres de Categorías (Ternas)
                  </label>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <span className="mb-1 block text-[9px] uppercase text-slate-500">Terna 1</span>
                      <input
                        type="text"
                        value={cat1Name}
                        disabled={fieldsDisabled}
                        data-cy="admin-config-cat1-input"
                        onChange={(event) => setCat1Name(event.target.value)}
                        placeholder="Ej. Sujetos"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-bold text-cyan-100 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-500 disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-[9px] uppercase text-slate-500">Terna 2</span>
                      <input
                        type="text"
                        value={cat2Name}
                        disabled={fieldsDisabled}
                        data-cy="admin-config-cat2-input"
                        onChange={(event) => setCat2Name(event.target.value)}
                        placeholder="Ej. Objetos"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-bold text-emerald-100 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-500 disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-[9px] uppercase text-slate-500">Terna 3</span>
                      <input
                        type="text"
                        value={cat3Name}
                        disabled={fieldsDisabled}
                        data-cy="admin-config-cat3-input"
                        onChange={(event) => setCat3Name(event.target.value)}
                        placeholder="Ej. Espacios"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-bold text-red-100 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-500 disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <input
                      type="checkbox"
                      id="hasMotifs"
                      checked={hasMotifs}
                      disabled={fieldsDisabled}
                      data-cy="admin-config-has-motifs-input"
                      onChange={(event) => setHasMotifs(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-950 disabled:opacity-60"
                    />
                    <label htmlFor="hasMotifs" className="cursor-pointer text-xs text-slate-300">
                      Habilitar motivos para que la tabla de razonamiento muestre motivos en lugar de espacios.
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-6">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-500">
                    <Clock className="h-4 w-4" /> Duración Estimada (Minutos)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    disabled={fieldsDisabled}
                    data-cy="admin-config-duration-input"
                    onChange={(event) => setDuration(event.target.value)}
                    className="w-1/3 rounded-lg border border-slate-700 bg-slate-950 p-3 font-bold text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                  />
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-6">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-500">
                    <Target className="h-4 w-4" /> Objetivo de Evaluación
                  </label>
                  <textarea
                    value={objective}
                    disabled={fieldsDisabled}
                    data-cy="admin-config-objective-input"
                    onChange={(event) => setObjective(event.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 p-4 font-mono text-sm leading-relaxed text-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                  ></textarea>
                </div>
              </div>
            </motion.div>
          ) : null}

          {activeTab === "sujetos" ? (
            <motion.div
              key="sujetos"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex max-w-3xl flex-col gap-8"
            >
              <div>
                <h2 className="mb-2 flex items-center gap-3 text-2xl font-black uppercase tracking-widest text-cyan-400">
                  <User className="h-8 w-8" /> Configurar Sujetos
                </h2>
                <p className="text-sm text-slate-400">Define entre {COLLECTION_CONSTRAINTS.subjects.min} y {COLLECTION_CONSTRAINTS.subjects.max} sujetos para la skin.</p>
              </div>

              {renderEditableItemList(subjects, setSubjects, <User className="h-4 w-4" />, "Sujeto", "subjects", COLLECTION_CONSTRAINTS.subjects.min, COLLECTION_CONSTRAINTS.subjects.max, false)}
            </motion.div>
          ) : null}

          {activeTab === "objetos" ? (
            <motion.div
              key="objetos"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex max-w-3xl flex-col gap-8"
            >
              <div>
                <h2 className="mb-2 flex items-center gap-3 text-2xl font-black uppercase tracking-widest text-emerald-400">
                  <Box className="h-8 w-8" /> Configurar Objetos
                </h2>
                <p className="text-sm text-slate-400">Define entre {COLLECTION_CONSTRAINTS.objects.min} y {COLLECTION_CONSTRAINTS.objects.max} objetos para la skin.</p>
              </div>

              {renderEditableItemList(objects, setObjects, <Box className="h-4 w-4" />, "Objeto", "objects", COLLECTION_CONSTRAINTS.objects.min, COLLECTION_CONSTRAINTS.objects.max, false)}
            </motion.div>
          ) : null}

          {activeTab === "espacios" ? (
            <motion.div
              key="espacios"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex max-w-3xl flex-col gap-8"
            >
              <div>
                <h2 className="mb-2 flex items-center gap-3 text-2xl font-black uppercase tracking-widest text-red-400">
                  <MapPin className="h-8 w-8" /> Configurar Espacios
                </h2>
                <p className="text-sm text-slate-400">
                  Define exactamente {COLLECTION_CONSTRAINTS.spaces.min} espacios. Si los motivos están activos, cada espacio debe tener uno.
                </p>
              </div>

              {renderEditableItemList(spaces, setSpaces, <MapPin className="h-4 w-4" />, cat3Name, "spaces", COLLECTION_CONSTRAINTS.spaces.min, COLLECTION_CONSTRAINTS.spaces.max, hasMotifs)}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}