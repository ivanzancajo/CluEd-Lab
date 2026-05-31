import { EstadoPartida, TipoEvento, type PrismaClient } from '@prisma/client';
import { HttpError } from './http.js';

export type AuditEventRow = {
  id: string;
  occurredAt: string;
  eventType: TipoEvento;
  emitterTeamName: string | null;
  receiverTeamName: string | null;
  resolvedSubjectName: string | null;
  resolvedObjectName: string | null;
  resolvedSpaceName: string | null;
  resolvedOutcome: string | null;
  resolvedSolution: string | null;
};

export type AuditLogData = {
  sessionId: string;
  accessCode: string;
  startedAt: string | null;
  finishedAt: string | null;
  events: AuditEventRow[];
};

function extractElementIds(events: { eventType: TipoEvento; detail: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    const d = event.detail as Record<string, unknown> | null;
    if (!d) continue;
    for (const key of ['subjectElementId', 'objectElementId', 'spaceElementId', 'shownElementId']) {
      if (typeof d[key] === 'string') ids.add(d[key] as string);
    }
    if (event.eventType === TipoEvento.SISTEMA && d['kind'] === 'GAME_RESOLUTION') {
      const solution = d['solution'] as Record<string, unknown> | null;
      if (solution) {
        for (const key of ['subject', 'object', 'space']) {
          const elem = solution[key] as Record<string, unknown> | null;
          if (elem && typeof elem['id'] === 'string') ids.add(elem['id'] as string);
        }
      }
    }
  }
  return Array.from(ids);
}

export async function loadSessionAuditLog(
  client: PrismaClient,
  accessCode: string
): Promise<AuditLogData> {
  const session = await client.partida.findUnique({
    where: { accessCode },
    select: { id: true, accessCode: true, status: true, startedAt: true, finishedAt: true },
  });

  if (!session) {
    throw new HttpError(404, 'La sesión solicitada no existe.');
  }

  if (session.status !== EstadoPartida.FINALIZADA) {
    throw new HttpError(409, 'El registro histórico solo está disponible cuando la partida ha finalizado.');
  }

  const rawEvents = await client.evento.findMany({
    where: { partidaId: session.id },
    orderBy: { occurredAt: 'asc' },
    include: {
      emitter: { select: { id: true, name: true } },
      receiver: { select: { id: true, name: true } },
    },
  });

  const elementIds = extractElementIds(rawEvents);
  const elementos = await client.elemento.findMany({
    where: { id: { in: elementIds } },
    select: { id: true, name: true },
  });
  const elementMap = new Map(elementos.map((e) => [e.id, e.name]));

  const events: AuditEventRow[] = rawEvents.map((ev) => {
    const d = ev.detail as Record<string, unknown> | null;
    let resolvedSubjectName: string | null = null;
    let resolvedObjectName: string | null = null;
    let resolvedSpaceName: string | null = null;
    let resolvedOutcome: string | null = null;
    let resolvedSolution: string | null = null;

    if (d) {
      if (typeof d['subjectElementId'] === 'string')
        resolvedSubjectName = elementMap.get(d['subjectElementId'] as string) ?? null;
      if (typeof d['objectElementId'] === 'string')
        resolvedObjectName = elementMap.get(d['objectElementId'] as string) ?? null;
      if (typeof d['spaceElementId'] === 'string')
        resolvedSpaceName = elementMap.get(d['spaceElementId'] as string) ?? null;
      if (typeof d['shownElementId'] === 'string')
        resolvedSubjectName = elementMap.get(d['shownElementId'] as string) ?? null;
      if (typeof d['outcome'] === 'string')
        resolvedOutcome = d['outcome'] as string;
      if (ev.eventType === TipoEvento.SISTEMA && d['kind'] === 'GAME_RESOLUTION') {
        const sol = d['solution'] as Record<string, Record<string, string>> | null;
        if (sol) {
          const sub = sol['subject']?.['id'] ? elementMap.get(sol['subject']['id']) : null;
          const obj = sol['object']?.['id'] ? elementMap.get(sol['object']['id']) : null;
          const spa = sol['space']?.['id'] ? elementMap.get(sol['space']['id']) : null;
          resolvedSolution = [sub, obj, spa].filter(Boolean).join(' / ') || null;
        }
      }
    }

    return {
      id: ev.id,
      occurredAt: ev.occurredAt?.toISOString() ?? '',
      eventType: ev.eventType,
      emitterTeamName: ev.emitter?.name ?? null,
      receiverTeamName: ev.receiver?.name ?? null,
      resolvedSubjectName,
      resolvedObjectName,
      resolvedSpaceName,
      resolvedOutcome,
      resolvedSolution,
    };
  });

  return {
    sessionId: session.id,
    accessCode: session.accessCode,
    startedAt: session.startedAt?.toISOString() ?? null,
    finishedAt: session.finishedAt?.toISOString() ?? null,
    events,
  };
}

export function toJson(data: AuditLogData): string {
  return JSON.stringify(data, null, 2);
}

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(data: AuditLogData): string {
  const header = 'timestamp,eventType,emitterTeam,receiverTeam,subject,object,space,outcome,solution';
  const rows = data.events.map((ev) =>
    [
      escapeCsvField(ev.occurredAt),
      escapeCsvField(ev.eventType),
      escapeCsvField(ev.emitterTeamName),
      escapeCsvField(ev.receiverTeamName),
      escapeCsvField(ev.resolvedSubjectName),
      escapeCsvField(ev.resolvedObjectName),
      escapeCsvField(ev.resolvedSpaceName),
      escapeCsvField(ev.resolvedOutcome),
      escapeCsvField(ev.resolvedSolution),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}
