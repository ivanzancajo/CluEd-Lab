import { isAxiosError } from "axios";
import api from "./api";

export interface SkinItem {
  id: string;
  name: string;
  desc: string;
  imageUrl?: string;
  motif?: string;
}

export interface SkinItemPayload {
  id?: string;
  name: string;
  desc: string;
  imageUrl?: string;
  motif?: string;
}

export interface SkinSummary {
  id: string;
  name: string;
  gameTitle: string;
  duration: string;
  centerImage: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs: boolean;
  createdAt: number;
  updatedAt: number;
  subjectCount: number;
  objectCount: number;
  spaceCount: number;
}

export interface GameConfig {
  id: string;
  name: string;
  gameTitle: string;
  objective: string;
  duration: string;
  centerImage: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs: boolean;
  subjects: SkinItem[];
  objects: SkinItem[];
  spaces: SkinItem[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateSkinPayload {
  name: string;
  gameTitle: string;
  objective: string;
  duration: number;
  centerImage?: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs: boolean;
  subjects: SkinItemPayload[];
  objects: SkinItemPayload[];
  spaces: SkinItemPayload[];
}

export interface UpdateSkinPayload {
  name?: string;
  gameTitle?: string;
  objective?: string;
  duration?: number;
  centerImage?: string;
  cat1Name?: string;
  cat2Name?: string;
  cat3Name?: string;
  hasMotifs?: boolean;
  subjects?: SkinItemPayload[];
  objects?: SkinItemPayload[];
  spaces?: SkinItemPayload[];
}

export const REQUIRED_ITEM_COUNTS = {
  subjects: 6,
  objects: 6,
  spaces: 9,
} as const;

export interface SkinValidationResult {
  isValid: boolean;
  errors: string[];
  counts: {
    subjects: number;
    objects: number;
    spaces: number;
  };
}

interface ListSkinsResponse {
  items: SkinSummary[];
}

interface SkinResponse {
  item: GameConfig;
}

interface SkinErrorResponse {
  error?: string;
  details?: string[];
}

export async function listSkinSummaries() {
  const response = await api.get<ListSkinsResponse>("/config/skins");
  return response.data.items;
}

export async function getSkinConfig(id: string) {
  const response = await api.get<SkinResponse>(`/config/skins/${id}`);
  return response.data.item;
}

export async function createSkinConfig(payload: CreateSkinPayload) {
  const response = await api.post<SkinResponse>("/config/skins", payload);
  return response.data.item;
}

export async function updateSkinConfig(id: string, payload: UpdateSkinPayload) {
  const response = await api.put<SkinResponse>(`/config/skins/${id}`, payload);
  return response.data.item;
}

export async function deleteSkinConfig(id: string) {
  await api.delete(`/config/skins/${id}`);
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("es");
}

function hasDuplicateNames(items: SkinItemPayload[]) {
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeName(item.name);
    if (seen.has(normalized)) {
      return true;
    }

    seen.add(normalized);
  }

  return false;
}

export function validateSkinComposition(config: {
  hasMotifs?: boolean;
  subjects?: SkinItemPayload[];
  objects?: SkinItemPayload[];
  spaces?: SkinItemPayload[];
}): SkinValidationResult {
  const subjects = config.subjects ?? [];
  const objects = config.objects ?? [];
  const spaces = config.spaces ?? [];
  const errors: string[] = [];

  if (subjects.length !== REQUIRED_ITEM_COUNTS.subjects) {
    errors.push(`La skin debe tener exactamente ${REQUIRED_ITEM_COUNTS.subjects} sujetos.`);
  }

  if (objects.length !== REQUIRED_ITEM_COUNTS.objects) {
    errors.push(`La skin debe tener exactamente ${REQUIRED_ITEM_COUNTS.objects} objetos.`);
  }

  if (spaces.length !== REQUIRED_ITEM_COUNTS.spaces) {
    errors.push(`La skin debe tener exactamente ${REQUIRED_ITEM_COUNTS.spaces} espacios.`);
  }

  if (hasDuplicateNames(subjects)) {
    errors.push("No se pueden repetir nombres de sujetos dentro de la misma skin.");
  }

  if (hasDuplicateNames(objects)) {
    errors.push("No se pueden repetir nombres de objetos dentro de la misma skin.");
  }

  if (hasDuplicateNames(spaces)) {
    errors.push("No se pueden repetir nombres de espacios dentro de la misma skin.");
  }

  if (subjects.some((item) => Boolean(item.motif))) {
    errors.push("Los sujetos no pueden tener motivos asociados.");
  }

  if (objects.some((item) => Boolean(item.motif))) {
    errors.push("Los objetos no pueden tener motivos asociados.");
  }

  if (config.hasMotifs && spaces.some((item) => !item.motif?.trim())) {
    errors.push("Debes indicar un motivo para cada espacio cuando la configuración tiene motivos habilitados.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    counts: {
      subjects: subjects.length,
      objects: objects.length,
      spaces: spaces.length,
    },
  };
}

export function getSkinErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError<SkinErrorResponse>(error)) {
    const apiError = error.response?.data;
    if (apiError?.details && apiError.details.length > 0) {
      return apiError.details.join(" ");
    }

    if (apiError?.error) {
      return apiError.error;
    }
  }

  return fallback;
}