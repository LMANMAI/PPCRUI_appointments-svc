import { Controller } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { APPOINTMENTS } from "./patterns";
import { AppointmentsService } from "./appointments.service";
import { CreateAppointmentDto, ListAppointmentsDto, CancelAppointmentDto } from "./dto/appointments.dto";

@Controller()
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @MessagePattern(APPOINTMENTS.Create)
  create(@Payload() dto: CreateAppointmentDto) { return this.svc.create(dto); }

  @MessagePattern(APPOINTMENTS.List)
  list(@Payload() q: ListAppointmentsDto) { return this.svc.list(q); }

  @MessagePattern(APPOINTMENTS.GetById)
  getById(@Payload() p: { id: string; orgId: string }) { return this.svc.getById(p.id, p.orgId); }

  @MessagePattern(APPOINTMENTS.Cancel)
  cancel(@Payload() dto: CancelAppointmentDto) { return this.svc.cancel(dto.id, dto.orgId, dto.reason); }
}