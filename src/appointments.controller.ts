import { Controller } from "@nestjs/common";
import { MessagePattern, Payload, RpcException } from "@nestjs/microservices";
import { APPOINTMENTS } from "./patterns";
import { AppointmentsService } from "./appointments.service";
import {
  CreateAppointmentDto,
  ListAppointmentsDto,
  CancelAppointmentDto,
  ConfirmAppointmentDto,
} from "./dto/appointments.dto";
import { CreateSlotDto, ListSlotsDto } from "./dto/slots.dto";

function toRpc(e: any): RpcException {
  if (e instanceof RpcException) return e;
  const status = Number.isInteger(e?.statusCode)
    ? e.statusCode
    : Number.isInteger(e?.status)
    ? e.status
    : 500;
  const message = typeof e?.message === "string" ? e.message : "Internal error";
  return new RpcException({ statusCode: status, message });
}

@Controller()
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @MessagePattern(APPOINTMENTS.Create)
  async create(@Payload() dto: CreateAppointmentDto) {
    try {
      // Reservar un slot
      return await this.svc.reserveSlot(dto);
    } catch (error) {
      throw toRpc(error);
    }
  }

  @MessagePattern(APPOINTMENTS.List)
  async list(@Payload() q: ListAppointmentsDto) {
    try {
      // Listar "turnos" = slots con status tomado
      return await this.svc.listAppointmentsView(q);
    } catch (error) {
      throw toRpc(error);
    }
  }

  @MessagePattern(APPOINTMENTS.GetById)
  async getById(@Payload() p: { id: string; orgId: string }) {
    try {
      // Obtener el slot
      return await this.svc.getAppointmentViewById(p.id, p.orgId);
    } catch (error) {
      throw toRpc(error);
    }
  }

  @MessagePattern(APPOINTMENTS.Cancel)
  async cancel(@Payload() dto: CancelAppointmentDto) {
    try {
      // Cancelar/ liberar slot
      return await this.svc.cancelSlot(dto.id, dto.id, dto.reason);
    } catch (error) {
      throw toRpc(error);
    }
  }

  @MessagePattern(APPOINTMENTS.Confirm)
  async confirm(@Payload() dto: ConfirmAppointmentDto) {
    try {
      // Confirmar slot
      return await this.svc.confirmSlot(dto.id, dto.id);
    } catch (error) {
      throw toRpc(error);
    }
  }

  @MessagePattern(APPOINTMENTS.Slots_Create)
  async createSlot(@Payload() dto: CreateSlotDto) {
    try {
      return await this.svc.createSlot({
        centerId: Number(dto.centerId),
        staffUserId: dto.staffUserId,
        startAt: dto.startAt,
        endAt: dto.endAt,
        startDate: dto.startDate,
        workStartTime: dto.workStartTime,
        workEndTime: dto.workEndTime,
        slotDurationMin: dto.slotDurationMin
          ? Number(dto.slotDurationMin)
          : undefined,
        days: dto.days ? Number(dto.days) : undefined,
        specialty: dto.specialty,
      });
    } catch (error) {
      throw toRpc(error);
    }
  }

  @MessagePattern(APPOINTMENTS.Slots_List)
  async listSlots(@Payload() q: ListSlotsDto) {
    try {
      return await this.svc.listSlots(q);
    } catch (error) {
      throw toRpc(error);
    }
  }

  @MessagePattern(APPOINTMENTS.Slots_GetById)
  async getSlotById(@Payload() p: { id: string }) {
    try {
      return await this.svc.getSlotById(p.id);
    } catch (error) {
      throw toRpc(error);
    }
  }
}
