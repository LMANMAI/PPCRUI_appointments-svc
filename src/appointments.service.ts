import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { RpcException } from "@nestjs/microservices";
import { PrismaClient, Prisma } from "@prisma/client";

function buildUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm || 0, 0, 0));
}

function rpc(statusCode: number, message: string, details?: any) {
  return new RpcException({
    statusCode,
    message,
    ...(details ? { details } : {}),
  });
}

function mapPrismaError(e: any) {
  if (e?.code === "P2002")
    return rpc(409, "Ya existe un slot en ese inicio para ese operador");
  if (e?.code === "P2003")
    return rpc(400, "centerId inválido (el centro no existe)");
  return rpc(500, "Error interno", { code: e?.code, msg: e?.message });
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(dto: {
    orgId: string;
    slotId: string;
    patientUserId: string;
    notes?: string;
  }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const taken = await tx.slot.updateMany({
        where: { id: dto.slotId, status: "FREE" as any },
        data: { status: "BOOKED" as any, reservedById: dto.patientUserId },
      });
      if (taken.count === 0)
        throw new BadRequestException(
          "El turno ya fue tomado o no está disponible"
        );

      const slot = await tx.slot.findUnique({ where: { id: dto.slotId } });
      if (!slot) throw new NotFoundException("Slot no encontrado");

      return tx.appointment.create({
        data: {
          orgId: dto.orgId,
          centerId: slot.centerId,
          patientUserId: dto.patientUserId,
          staffUserId: slot.staffUserId,
          slotId: slot.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
          status: "PENDING",
          notes: dto.notes ?? null,
        },
      });
    });
  }

  async list(q: {
    orgId: string;
    centerId?: string;
    patientUserId?: string;
    staffUserId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: any = { orgId: q.orgId };
    if (q.centerId) where.centerId = Number(q.centerId);
    if (q.patientUserId) where.patientUserId = q.patientUserId;
    if (q.staffUserId) where.staffUserId = q.staffUserId;
    if (q.status) where.status = q.status;
    if (q.dateFrom || q.dateTo) {
      where.startAt = {};
      if (q.dateFrom) where.startAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.startAt.lte = new Date(q.dateTo);
    }
    return this.prisma.appointment.findMany({
      where,
      orderBy: { startAt: "asc" },
      include: { slot: true },
    });
  }

  async getById(id: string, orgId: string) {
    const ap = await this.prisma.appointment.findFirst({
      where: { id, orgId },
      include: { slot: true },
    });
    if (!ap) throw new NotFoundException("Turno no encontrado");
    return ap;
  }

  async confirm(id: string, orgId: string) {
    const ap = await this.getById(id, orgId);
    if (ap.status === "CANCELLED")
      throw new ForbiddenException("La cita está cancelada");
    return this.prisma.appointment.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });
  }

  async cancel(id: string, orgId: string, reason?: string) {
    const now = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ap = await tx.appointment.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelReason: reason ?? null,
          cancelledAt: now,
        },
        include: { slot: true },
      });
      if (ap.orgId !== orgId)
        throw new ForbiddenException("No pertenece a la organización");

      if (ap.slot && ap.slot.startAt > now) {
        await tx.slot.update({
          where: { id: ap.slotId! },
          data: { status: "FREE", reservedById: null },
        });
      }
      return ap;
    });
  }

  async createSlot(dto: {
    centerId: number;
    staffUserId: string;

    // modo single
    startAt?: string;
    endAt?: string;

    // modo bulk
    startDate?: string;
    workStartTime?: string;
    workEndTime?: string;
    slotDurationMin?: number;
    days?: number;
  }) {
    const isSingle = !!(dto.startAt && dto.endAt);

    if (isSingle) {
      // ----- SINGLE -----
      const start = new Date(dto.startAt!);
      const end = new Date(dto.endAt!);
      if (!(start < end))
        throw new BadRequestException("endAt debe ser posterior a startAt");

      // bloquear superposiciones para el mismo operador (cualquier centro)
      const overlap = await this.prisma.slot.findFirst({
        where: {
          staffUserId: dto.staffUserId,
          startAt: { lt: end },
          endAt: { gt: start },
        },
      });
      if (overlap)
        throw new BadRequestException(
          "El operador ya tiene un slot superpuesto en ese rango"
        );

      try {
        return await this.prisma.slot.create({
          data: {
            centerId: dto.centerId,
            staffUserId: dto.staffUserId,
            startAt: start,
            endAt: end,
            status: "FREE" as any,
          },
        });
      } catch (e: any) {
        console.error("[slots.create.single] error:", e);
        throw mapPrismaError(e);
      }
    } else {
      // ----- BULK/AGENDA -----
      const { startDate, workStartTime, workEndTime, slotDurationMin, days } =
        dto;
      if (
        !startDate ||
        !workStartTime ||
        !workEndTime ||
        !slotDurationMin ||
        !days
      ) {
        throw new BadRequestException(
          "Faltan campos de agenda (startDate, workStartTime, workEndTime, slotDurationMin, days)"
        );
      }

      const dayStart0 = buildUtc(startDate, workStartTime);
      const dayEnd0 = buildUtc(startDate, workEndTime);
      if (!(dayStart0 < dayEnd0))
        throw new BadRequestException(
          "workEndTime debe ser posterior a workStartTime"
        );
      if (slotDurationMin <= 0)
        throw new BadRequestException("slotDurationMin inválida");
      if (days < 1) throw new BadRequestException("days debe ser >= 1");

      const durMs = slotDurationMin * 60 * 1000;
      const totalStart = dayStart0;
      const totalEnd = new Date(+dayEnd0 + (days - 1) * 24 * 60 * 60 * 1000);

      const conflict = await this.prisma.slot.findFirst({
        where: {
          staffUserId: dto.staffUserId,
          startAt: { lt: totalEnd },
          endAt: { gt: totalStart },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new BadRequestException(
          "Existen slots del operador que se superponen con la agenda solicitada"
        );
      }

      const toCreate: Array<{
        centerId: number;
        staffUserId: string;
        startAt: Date;
        endAt: Date;
        status: any;
      }> = [];
      for (let i = 0; i < days; i++) {
        const startDay = new Date(+dayStart0 + i * 24 * 60 * 60 * 1000);
        const endDay = new Date(+dayEnd0 + i * 24 * 60 * 60 * 1000);
        for (let t = +startDay; t + durMs <= +endDay; t += durMs) {
          toCreate.push({
            centerId: dto.centerId,
            staffUserId: dto.staffUserId,
            startAt: new Date(t),
            endAt: new Date(t + durMs),
            status: "FREE" as any,
          });
        }
      }

      const createdCount = await (async () => {
        try {
          return await this.prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
              const res = await tx.slot.createMany({
                data: toCreate,
                skipDuplicates: true,
              });
              return res.count;
            }
          );
        } catch (e: any) {
          console.error("[slots.create.bulk] error:", e);
          throw mapPrismaError(e);
        }
      })();

      return {
        mode: "BULK",
        requested: toCreate.length,
        created: createdCount,
        perDay: Math.floor((+dayEnd0 - +dayStart0) / durMs),
        days,
      };
    }
  }

  async listSlots(q: {
    centerId?: string;
    staffUserId?: string;
    status?: "FREE" | "BOOKED";
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: any = {};
    if (q.centerId) where.centerId = Number(q.centerId);
    if (q.staffUserId) where.staffUserId = q.staffUserId;
    if (q.status) where.status = q.status;
    if (q.dateFrom || q.dateTo) {
      where.startAt = {};
      if (q.dateFrom) where.startAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.startAt.lte = new Date(q.dateTo);
    }
    return this.prisma.slot.findMany({ where, orderBy: { startAt: "asc" } });
  }

  async getSlotById(id: string) {
    const s = await this.prisma.slot.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Slot no encontrado");
    return s;
  }
}
