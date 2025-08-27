import { Controller } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { APPOINTMENTS } from "./patterns";
import { AppointmentsService } from "./appointments.service";
import {
  CreateAppointmentDto,
  ListAppointmentsDto,
  CancelAppointmentDto,
  ConfirmAppointmentDto,
} from "./dto/appointments.dto";
import { CreateSlotDto, ListSlotsDto } from "./dto/slots.dto";

@Controller()
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @MessagePattern(APPOINTMENTS.Create)
  create(@Payload() dto: CreateAppointmentDto) {
    return this.svc.create(dto);
  }

  @MessagePattern(APPOINTMENTS.List)
  list(@Payload() q: ListAppointmentsDto) {
    return this.svc.list(q);
  }

  @MessagePattern(APPOINTMENTS.GetById)
  getById(@Payload() p: { id: string; orgId: string }) {
    return this.svc.getById(p.id, p.orgId);
  }

  @MessagePattern(APPOINTMENTS.Cancel)
  cancel(@Payload() dto: CancelAppointmentDto) {
    return this.svc.cancel(dto.id, dto.orgId, dto.reason);
  }

  @MessagePattern(APPOINTMENTS.Confirm)
  confirm(@Payload() dto: ConfirmAppointmentDto) {
    return this.svc.confirm(dto.id, dto.orgId);
  }

  @MessagePattern(APPOINTMENTS.Slots_Create)
  createSlot(@Payload() dto: CreateSlotDto) {
    return this.svc.createSlot({
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
    });
  }

  @MessagePattern(APPOINTMENTS.Slots_List)
  listSlots(@Payload() q: ListSlotsDto) {
    return this.svc.listSlots(q);
  }

  @MessagePattern(APPOINTMENTS.Slots_GetById)
  getSlotById(@Payload() p: { id: string }) {
    return this.svc.getSlotById(p.id);
  }
}
