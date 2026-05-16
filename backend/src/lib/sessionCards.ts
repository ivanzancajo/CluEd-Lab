import { TipoElemento } from '@prisma/client';
import type { LoadedSkinConfiguration } from './skinConfigs.js';

export type TeamHandCard = {
  id: string;
  kind: TipoElemento;
  name: string;
  desc: string;
  imageUrl?: string | undefined;
  motif?: string | undefined;
};

type SkinConfigItem = LoadedSkinConfiguration['subjects'][number];

export function buildSkinItemLookup(skin: LoadedSkinConfiguration): Map<string, SkinConfigItem> {
  return new Map<string, SkinConfigItem>(
    [...skin.subjects, ...skin.objects, ...skin.spaces].map((item) => [item.id, item])
  );
}

export function sortHandCards(left: TeamHandCard, right: TeamHandCard): number {
  const kindOrder = [TipoElemento.SUJETO, TipoElemento.OBJETO, TipoElemento.ESPACIO];
  const kindDifference = kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind);

  if (kindDifference !== 0) {
    return kindDifference;
  }

  return left.name.localeCompare(right.name, 'es');
}
