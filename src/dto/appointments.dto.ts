import { IsISO8601, IsOptional, IsString, IsEnum } from "class-validator";

export enum AppointmentStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}

export class CreateAppointmentDto {
  @IsString() orgId!: string;
  @IsString() slotId!: string; // se reserva un slot
  @IsString() patientUserId!: string;
  @IsOptional() @IsString() notes?: string;
}

export class ListAppointmentsDto {
  @IsString() orgId!: string;
  @IsOptional() @IsString() centerId?: string;
  @IsOptional() @IsString() patientUserId?: string;
  @IsOptional() @IsString() staffUserId?: string; // filtrar por personal de salud
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsISO8601() dateFrom?: string;
  @IsOptional() @IsISO8601() dateTo?: string;
}

export class CancelAppointmentDto {
  @IsString() id!: string;
  @IsString() orgId!: string;
  @IsOptional() @IsString() reason?: string;
}

export class ConfirmAppointmentDto {
  @IsString() id!: string;
  @IsString() orgId!: string;
}
