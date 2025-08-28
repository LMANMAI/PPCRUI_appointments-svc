import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { RpcException } from "@nestjs/microservices";
import { PrismaClient, Prisma } from "@prisma/client";
import { ListSlotsDto, SlotSpecialty, CreateSlotDto } from "./dto/slots.dto";
import {
  CreateAppointmentDto,
  ListAppointmentsDto,
  AppointmentStatus as ApptStatusDto,
} from "./dto/appointments.dto";

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

function mapApptStatusToSlotStatus(s?: ApptStatusDto): string[] | undefined {
  if (!s) return undefined;
  switch (s) {
    case ApptStatusDto.PENDING:
      return ["RESERVED"];
    case ApptStatusDto.CONFIRMED:
      return ["CONFIRMED"];
    case ApptStatusDto.CANCELLED:
      return ["CANCELLED"];
    case ApptStatusDto.COMPLETED:
      return ["COMPLETED"];
    default:
      return undefined;
  }
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  // Reserva un slot: FREE -> RESERVED y setea el paciente
  async reserveSlot(dto: CreateAppointmentDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const taken = await tx.slot.updateMany({
        where: { id: dto.slotId, status: "FREE" as any },
        data: {
          status: "RESERVED" as any,
          patientUserId: dto.patientUserId,
        },
      });
      if (taken.count === 0) {
        throw new BadRequestException(
          "El slot no está disponible o ya fue tomado"
        );
      }
      return tx.slot.findUnique({ where: { id: dto.slotId } });
    });
  }

  async listAppointmentsView(q: ListAppointmentsDto) {
    const where: any = {
      status: { in: ["RESERVED", "CONFIRMED", "CANCELLED", "COMPLETED"] },
    };

    if (q.centerId) where.centerId = Number(q.centerId);
    if (q.patientUserId) where.patientUserId = q.patientUserId;
    if (q.staffUserId) where.staffUserId = q.staffUserId;

    const mapped = mapApptStatusToSlotStatus(q.status);
    if (mapped) where.status = { in: mapped };

    if (q.dateFrom || q.dateTo) {
      where.startAt = {};
      if (q.dateFrom) where.startAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.startAt.lte = new Date(q.dateTo);
    }

    return this.prisma.slot.findMany({
      where,
      orderBy: { startAt: "asc" },
    });
  }

  async getAppointmentViewById(id: string, _orgId: string) {
    const s = await this.prisma.slot.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Slot no encontrado");
    return s;
  }

  async confirmSlot(id: string, _orgId: string) {
    const s = await this.prisma.slot.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Slot no encontrado");
    if (!s.patientUserId)
      throw new BadRequestException("El slot no está reservado");
    if (s.status === "CANCELLED")
      throw new BadRequestException("El slot está cancelado");

    return this.prisma.slot.update({
      where: { id },
      data: { status: "CONFIRMED" as any },
    });
  }

  // Cancelar/ liberar slot
  async cancelSlot(id: string, _orgId: string, reason?: string) {
    const s = await this.prisma.slot.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Slot no encontrado");

    const now = new Date();
    if (s.startAt > now) {
      return this.prisma.slot.update({
        where: { id },
        data: {
          status: "FREE" as any,
          patientUserId: null,
          notes: null,
          cancelReason: reason ?? null,
          cancelledAt: now,
        },
      });
    }
    // histórico si ya pasó
    return this.prisma.slot.update({
      where: { id },
      data: {
        status: "CANCELLED" as any,
        cancelReason: reason ?? null,
        cancelledAt: now,
      },
    });
  }

  // SLOTS
  async createSlot(dto: CreateSlotDto) {
    const isSingle = !!(dto.startAt && dto.endAt);

    if (isSingle) {
      const start = new Date(dto.startAt!);
      const end = new Date(dto.endAt!);
      if (!(start < end))
        throw new BadRequestException("endAt debe ser posterior a startAt");

      // evitar superposición para el mismo operador
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
            specialty: dto.specialty ?? null,
          },
        });
      } catch (e: any) {
        console.error("[slots.create.single] error:", e);
        throw mapPrismaError(e);
      }
    } else {
      // agenda / bulk
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
        specialty?: SlotSpecialty | null;
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
            specialty: dto.specialty ?? null,
          });
        }
      }

      const createdCount = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const res = await tx.slot.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
          return res.count;
        }
      );

      return {
        mode: "BULK",
        requested: toCreate.length,
        created: createdCount,
        perDay: Math.floor((+dayEnd0 - +dayStart0) / durMs),
        days,
        specialty: (dto as any).specialty ?? null,
      };
    }
  }

  async listSlots(q: ListSlotsDto) {
    const where: any = {};
    if (q.centerId) where.centerId = Number(q.centerId);
    if (q.staffUserId) where.staffUserId = q.staffUserId;
    if (q.status) where.status = q.status;

    if (q.dateFrom || q.dateTo) {
      where.startAt = {};
      if (q.dateFrom) where.startAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.startAt.lte = new Date(q.dateTo);
    }
    if (q.specialty) where.specialty = q.specialty as SlotSpecialty;
    return this.prisma.slot.findMany({ where, orderBy: { startAt: "asc" } });
  }

  async getSlotById(id: string) {
    const s = await this.prisma.slot.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Slot no encontrado");
    return s;
  }
}
