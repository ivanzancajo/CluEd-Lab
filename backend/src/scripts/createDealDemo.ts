import 'dotenv/config';
import { Prisma, PrismaClient, ColorEquipo, EstadoPartida, TipoElemento } from '@prisma/client';
import {
  initializeStartedSession,
  loadTeamTerminalStateByAccessCode,
  type TeamHandCard,
} from '../lib/sessionGameplay.js';
import { createWithUniqueAccessCode } from '../lib/sessionAccessCode.js';
import { COLOR_LABELS } from '../lib/sessionSnapshots.js';
import { COLOR_SORT_ORDER } from '../lib/teamOrder.js';

const DEFAULT_TEAM_COUNT = 6;
const DEFAULT_DURATION_MINUTES = 45;
const MIN_TEAM_COUNT = 2;
const MAX_TEAM_COUNT = COLOR_SORT_ORDER.length;

let prismaClient: PrismaClient | null = null;

type CliOptions = {
  teamCount: number;
  durationMinutes: number;
  namePrefix: string;
  apiBase?: string | undefined;
  token?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
};

type DemoSkinInput = {
  timestamp: number;
  name: string;
  objective: string;
  gameTitle: string;
  duration: number;
  centerImage: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs: boolean;
  subjects: Array<{
    name: string;
    desc: string;
    imageUrl: string;
  }>;
  objects: Array<{
    name: string;
    desc: string;
    imageUrl: string;
  }>;
  spaces: Array<{
    name: string;
    desc: string;
    imageUrl: string;
  }>;
};

type TeamDealSummary = {
  teamId: string;
  teamName: string;
  color: ColorEquipo;
  counts: {
    total: number;
    SUJETO: number;
    OBJETO: number;
    ESPACIO: number;
  };
  cards: string[];
  terminalContext: {
    sessionId: string;
    sessionCode: string;
    sessionStatus: EstadoPartida;
    teamId: string;
    teamColor: ColorEquipo;
    teamName: string;
  };
};

type DemoResult = {
  mode: 'database' | 'api';
  sessionId: string;
  accessCode: string;
  teamCount: number;
  skin: {
    id: string;
    name: string;
  };
  teams: TeamDealSummary[];
};

type ApiTeamState = {
  session: {
    id: string;
    accessCode: string;
    status: EstadoPartida;
  };
  team: {
    id: string;
    name: string;
    color: ColorEquipo;
  };
  hand: TeamHandCard[];
};

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const result = await createDealDemo(options);

  console.log(JSON.stringify(result, null, 2));
}

async function createDealDemo(options: CliOptions): Promise<DemoResult> {
  if (options.apiBase) {
    return createDealDemoViaApi(options);
  }

  return createDealDemoViaDatabase(options);
}

async function createDealDemoViaDatabase(options: CliOptions): Promise<DemoResult> {
  const prisma = getPrismaClient();
  const demoSkin = buildDemoSkinInput(options);
  const teamColors = COLOR_SORT_ORDER.slice(0, options.teamCount);
  const skin = await prisma.cluEdSkin.create({
    data: {
      name: demoSkin.name,
      objective: demoSkin.objective,
      imageUrl: demoSkin.centerImage,
      context: buildSkinContext(demoSkin),
    },
  });

  await createCollectionItems(prisma, skin.id, TipoElemento.SUJETO, 'Sujeto', 6);
  await createCollectionItems(prisma, skin.id, TipoElemento.OBJETO, 'Objeto', 6);
  await createCollectionItems(prisma, skin.id, TipoElemento.ESPACIO, 'Espacio', 9);

  const session = await createWithUniqueAccessCode(
    (accessCode) =>
      prisma.partida.create({
        data: {
          accessCode,
          status: EstadoPartida.LOBBY,
          durationMinutes: options.durationMinutes,
          skinId: skin.id,
        },
      }),
    {
      isCollisionError: isAccessCodeCollisionError,
    }
  );

  for (const color of teamColors) {
    await prisma.equipo.create({
      data: {
        partidaId: session.id,
        color,
        name: COLOR_LABELS[color],
      },
    });
  }

  await prisma.$transaction((transaction) => initializeStartedSession(transaction, session.id));

  const teams = await prisma.equipo.findMany({
    where: {
      partidaId: session.id,
    },
    select: {
      id: true,
      name: true,
      color: true,
    },
  });

  const summaries = await Promise.all(
    teams.map(async (team) => {
      const state = await loadTeamTerminalStateByAccessCode(prisma, session.accessCode, team.id);
      return summarizeTeamState(session.id, session.accessCode, state);
    })
  );

  return {
    mode: 'database',
    sessionId: session.id,
    accessCode: session.accessCode,
    teamCount: teamColors.length,
    skin: {
      id: skin.id,
      name: skin.name,
    },
    teams: summaries,
  };
}

async function createDealDemoViaApi(options: CliOptions): Promise<DemoResult> {
  const apiBase = normalizeApiBase(options.apiBase);
  const token = await resolveApiToken(apiBase, options);
  const demoSkin = buildDemoSkinInput(options);
  const teamColors = COLOR_SORT_ORDER.slice(0, options.teamCount);
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const skinResponse = await apiRequest<{ item: { id: string; name: string } }>(`${apiBase}/config/skins`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: demoSkin.name,
      objective: demoSkin.objective,
      gameTitle: demoSkin.gameTitle,
      duration: demoSkin.duration,
      centerImage: demoSkin.centerImage,
      cat1Name: demoSkin.cat1Name,
      cat2Name: demoSkin.cat2Name,
      cat3Name: demoSkin.cat3Name,
      hasMotifs: demoSkin.hasMotifs,
      subjects: demoSkin.subjects,
      objects: demoSkin.objects,
      spaces: demoSkin.spaces,
    }),
  });

  const sessionResponse = await apiRequest<{ item: { id: string; accessCode: string } }>(`${apiBase}/game/sessions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      skinId: skinResponse.item.id,
    }),
  });

  const joinedTeams = [] as Array<{ id: string; name: string; color: ColorEquipo }>;

  for (const color of teamColors) {
    const joinResponse = await apiRequest<{ item: { team: { id: string; name: string; color: ColorEquipo } } }>(
      `${apiBase}/game/sessions/${sessionResponse.item.accessCode}/join`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ color }),
      }
    );

    joinedTeams.push(joinResponse.item.team);
  }

  await apiRequest<{ item: { status: EstadoPartida } }>(`${apiBase}/game/sessions/${sessionResponse.item.accessCode}/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const summaries = await Promise.all(
    joinedTeams.map(async (team) => {
      const stateResponse = await apiRequest<{ item: ApiTeamState }>(
        `${apiBase}/game/sessions/${sessionResponse.item.accessCode}/teams/${team.id}/state`
      );

      return summarizeTeamState(sessionResponse.item.id, sessionResponse.item.accessCode, stateResponse.item);
    })
  );

  return {
    mode: 'api',
    sessionId: sessionResponse.item.id,
    accessCode: sessionResponse.item.accessCode,
    teamCount: teamColors.length,
    skin: {
      id: skinResponse.item.id,
      name: demoSkin.name,
    },
    teams: summaries,
  };
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    teamCount: DEFAULT_TEAM_COUNT,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    namePrefix: 'Demo Reparto',
  };

  args.forEach((arg) => {
    if (arg.startsWith('--teams=')) {
      options.teamCount = parseIntegerOption(arg, '--teams', MIN_TEAM_COUNT, MAX_TEAM_COUNT);
      return;
    }

    if (arg.startsWith('--duration=')) {
      options.durationMinutes = parseIntegerOption(arg, '--duration', 1);
      return;
    }

    if (arg.startsWith('--name=')) {
      const value = arg.slice('--name='.length).trim();

      if (!value) {
        throw new Error('El valor de --name no puede estar vacío.');
      }

      options.namePrefix = value;
      return;
    }

    if (arg.startsWith('--api-base=')) {
      const value = arg.slice('--api-base='.length).trim();

      if (!value) {
        throw new Error('El valor de --api-base no puede estar vacío.');
      }

      options.apiBase = value;
      return;
    }

    if (arg.startsWith('--token=')) {
      const value = arg.slice('--token='.length).trim();

      if (!value) {
        throw new Error('El valor de --token no puede estar vacío.');
      }

      options.token = value;
      return;
    }

    if (arg.startsWith('--username=')) {
      const value = arg.slice('--username='.length).trim();

      if (!value) {
        throw new Error('El valor de --username no puede estar vacío.');
      }

      options.username = value;
      return;
    }

    if (arg.startsWith('--password=')) {
      const value = arg.slice('--password='.length).trim();

      if (!value) {
        throw new Error('El valor de --password no puede estar vacío.');
      }

      options.password = value;
      return;
    }

    throw new Error(`Opción no soportada: ${arg}`);
  });

  return options;
}

function parseIntegerOption(argument: string, optionName: string, min: number, max?: number) {
  const rawValue = argument.slice(argument.indexOf('=') + 1).trim();
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    const rangeLabel = max === undefined ? `>= ${min}` : `entre ${min} y ${max}`;
    throw new Error(`El valor de ${optionName} debe ser un entero ${rangeLabel}.`);
  }

  return parsed;
}

function isAccessCodeCollisionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function getPrismaClient() {
  if (!prismaClient) {
    normalizeDatabaseUrlForLocalAccess();
    prismaClient = new PrismaClient();
  }

  return prismaClient;
}

async function resolveApiToken(apiBase: string, options: CliOptions) {
  if (options.token) {
    return options.token;
  }

  const username = options.username?.trim() || process.env.ADMIN_USER?.trim();
  const password = options.password?.trim();

  if (!username || !password) {
    throw new Error(
      'El modo API requiere --token o bien --username/--password para autenticarse contra el backend activo.'
    );
  }

  const loginResponse = await apiRequest<{ token: string }>(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  return loginResponse.token;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const bodyText = await response.text();
  const body = bodyText ? (JSON.parse(bodyText) as T & { error?: string }) : undefined;

  if (!response.ok) {
    const message = typeof body === 'object' && body && 'error' in body && body.error ? body.error : bodyText;
    throw new Error(`Fallo en ${url}: ${response.status} ${message}`.trim());
  }

  return body as T;
}

function normalizeApiBase(apiBase?: string) {
  const trimmed = apiBase?.trim();

  if (!trimmed) {
    throw new Error('El valor de --api-base no puede estar vacío.');
  }

  return trimmed.endsWith('/api') ? trimmed : `${trimmed.replace(/\/$/, '')}/api`;
}

function normalizeDatabaseUrlForLocalAccess() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definida para generar la demo de reparto.');
  }

  const parsed = new URL(databaseUrl);

  if (parsed.hostname === 'host.docker.internal') {
    parsed.hostname = 'localhost';
    process.env.DATABASE_URL = parsed.toString();
  }
}

function buildDemoSkinInput(options: CliOptions): DemoSkinInput {
  const timestamp = Date.now();

  return {
    timestamp,
    name: `${options.namePrefix} ${options.teamCount} equipos ${timestamp}`,
    objective: `Visualizar el reparto inicial con ${options.teamCount} equipos.`,
    gameTitle: `Demo reparto ${options.teamCount} equipos`,
    duration: options.durationMinutes,
    centerImage: '',
    cat1Name: 'Sujetos',
    cat2Name: 'Objetos',
    cat3Name: 'Espacios',
    hasMotifs: false,
    subjects: buildCollectionPayload('Sujeto', 6),
    objects: buildCollectionPayload('Objeto', 6),
    spaces: buildCollectionPayload('Espacio', 9),
  };
}

function buildCollectionPayload(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${index + 1}`,
    desc: `Descripción de ${prefix} ${index + 1}`,
    imageUrl: '',
  }));
}

function buildSkinContext(demoSkin: DemoSkinInput) {
  return JSON.stringify({
    version: 1,
    gameTitle: demoSkin.gameTitle,
    duration: String(demoSkin.duration),
    cat1Name: demoSkin.cat1Name,
    cat2Name: demoSkin.cat2Name,
    cat3Name: demoSkin.cat3Name,
    hasMotifs: demoSkin.hasMotifs,
    createdAt: demoSkin.timestamp,
    updatedAt: demoSkin.timestamp,
  });
}

function summarizeTeamState(sessionId: string, accessCode: string, state: ApiTeamState): TeamDealSummary {
  return {
    teamId: state.team.id,
    teamName: state.team.name,
    color: state.team.color,
    counts: summarizeHand(state.hand),
    cards: state.hand.map((card) => card.name),
    terminalContext: {
      sessionId,
      sessionCode: accessCode,
      sessionStatus: state.session.status,
      teamId: state.team.id,
      teamColor: state.team.color,
      teamName: state.team.name,
    },
  };
}

function summarizeHand(hand: TeamHandCard[]) {
  return hand.reduce(
    (accumulator, card) => {
      accumulator.total += 1;
      accumulator[card.kind] += 1;
      return accumulator;
    },
    {
      total: 0,
      SUJETO: 0,
      OBJETO: 0,
      ESPACIO: 0,
    }
  );
}

async function createCollectionItems(
  prisma: PrismaClient,
  skinId: string,
  kind: TipoElemento,
  prefix: string,
  count: number
) {
  for (let index = 0; index < count; index += 1) {
    const element = await prisma.elemento.create({
      data: {
        name: `${prefix} ${index + 1}`,
        kind,
        imageUrl: '',
      },
    });

    await prisma.descripcionElemento.create({
      data: {
        skinId,
        elementId: element.id,
        description: `Descripción de ${prefix} ${index + 1}`,
        motif: kind === TipoElemento.ESPACIO ? `Motivo ${index + 1}` : null,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaClient?.$disconnect();
  });