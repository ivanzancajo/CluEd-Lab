import type { TeamColor } from './sessionApi';

export type TeamMeta = {
  color: TeamColor;
  slug: string;
  label: string;
  shortLabel: string;
  swatchClass: string;
  textClass: string;
  hexColor: string;
  location: string;
  position: {
    top: string;
    left: string;
  };
};

export const TEAM_METADATA: TeamMeta[] = [
  {
    color: 'ROJO',
    slug: 'rojo',
    label: 'Equipo Rojo',
    shortLabel: 'Rojo',
    swatchClass: 'bg-red-500',
    textClass: 'text-red-400',
    hexColor: '#ef4444',
    location: 'Sala Hedy Lamarr',
    position: { top: '25%', left: '48%' },
  },
  {
    color: 'AMARILLO',
    slug: 'amarillo',
    label: 'Equipo Amarillo',
    shortLabel: 'Amarillo',
    swatchClass: 'bg-yellow-500',
    textClass: 'text-yellow-400',
    hexColor: '#eab308',
    location: 'Central de Conmutación',
    position: { top: '33%', left: '87%' },
  },
  {
    color: 'AZUL',
    slug: 'azul',
    label: 'Equipo Azul',
    shortLabel: 'Azul',
    swatchClass: 'bg-blue-500',
    textClass: 'text-blue-400',
    hexColor: '#3b82f6',
    location: 'Club de radio',
    position: { top: '69%', left: '12%' },
  },
  {
    color: 'VERDE',
    slug: 'verde',
    label: 'Equipo Verde',
    shortLabel: 'Verde',
    swatchClass: 'bg-green-500',
    textClass: 'text-green-400',
    hexColor: '#22c55e',
    location: 'Lab. Electrónica',
    position: { top: '90%', left: '41%' },
  },
  {
    color: 'MORADO',
    slug: 'morado',
    label: 'Equipo Morado',
    shortLabel: 'Morado',
    swatchClass: 'bg-purple-500',
    textClass: 'text-purple-400',
    hexColor: '#a855f7',
    location: 'Cámara Anecoica',
    position: { top: '26%', left: '12%' },
  },
  {
    color: 'BLANCO',
    slug: 'blanco',
    label: 'Equipo Blanco',
    shortLabel: 'Blanco',
    swatchClass: 'bg-slate-200',
    textClass: 'text-slate-300',
    hexColor: '#f8fafc',
    location: 'Seminario Maxwell',
    position: { top: '89%', left: '58%' },
  },
];

export function getTeamMeta(color: TeamColor) {
  return TEAM_METADATA.find((team) => team.color === color) ?? TEAM_METADATA[0];
}