import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(dto: {
    orgId: string; centerId: string; patientUserId: string;
    startAt: string; endAt: string; notes?: string;
  }) {
    const start = new Date(dto.startAt);
    const end   = new Date(dto.endAt);
    if (end <= start) throw new BadRequestException("endAt must be after startAt");

    // overlap: (startAt < end) AND (endAt > start)
    const overlap = await this.prisma.appointment.findFirst({
      where: {
        orgId: dto.orgId,
        centerId: dto.centerId,
        status: { in: ["PENDING","CONFIRMED"] as any },
        startAt: { lt: end },
        endAt:   { gt: start }
      } as any,
    });
    if (overlap) throw new BadRequestException("Ya existe un turno superpuesto en ese rango.");

    return this.prisma.appointment.create({
      data: {
        orgId: dto.orgId,
        centerId: dto.centerId,
        patientUserId: dto.patientUserId,
        startAt: start,
        endAt: end,
        notes: dto.notes ?? null,
      },
    });
  }

  async list(q: { orgId: string; centerId?: string; patientUserId?: string; dateFrom?: string; dateTo?: string }) {
    const where: any = { orgId: q.orgId };
    if (q.centerId) where.centerId = q.centerId;
    if (q.patientUserId) where.patientUserId = q.patientUserId;
    if (q.dateFrom || q.dateTo) {
      where.startAt = {};
      if (q.dateFrom) where.startAt.gte = new Date(q.dateFrom);
      if (q.dateTo)   where.startAt.lte = new Date(q.dateTo);
    }
    return this.prisma.appointment.findMany({ where, orderBy: { startAt: "asc" } });
  }

  async getById(id: string, orgId: string) {
    const ap = await this.prisma.appointment.findFirst({ where: { id, orgId } });
    if (!ap) throw new NotFoundException("Turno no encontrado");
    return ap;
  }

  async cancel(id: string, orgId: string, reason?: string) {
    await this.getById(id, orgId);
    return this.prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" as any, cancelReason: reason ?? null, cancelledAt: new Date() },
    });
  }
}