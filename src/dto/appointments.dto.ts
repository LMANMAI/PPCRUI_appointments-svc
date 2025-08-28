import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional, IsString, IsEnum } from "class-validator";

export enum AppointmentStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}

export class CreateAppointmentDto {
  @ApiProperty({ example: "slot-uuid", description: "ID del slot a reservar" })
  @IsString()
  slotId!: string;

  @ApiProperty({
    example: "user-uuid",
    description: "ID del usuario/paciente que toma el turno",
  })
  @IsString()
  patientUserId!: string;

  @ApiPropertyOptional({
    example: "Traer estudios previos",
    description: "Notas opcionales del turno",
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListAppointmentsDto {
  @ApiPropertyOptional({
    example: "1",
    description: "ID del centro (string; se convertirá a number internamente)",
  })
  @IsOptional()
  @IsString()
  centerId?: string;

  @ApiPropertyOptional({ example: "user-uuid" })
  @IsOptional()
  @IsString()
  patientUserId?: string;

  @ApiPropertyOptional({
    example: "staff-uuid",
    description: "Filtrar por operador/personal de salud",
  })
  @IsOptional()
  @IsString()
  staffUserId?: string;

  @ApiPropertyOptional({
    enum: AppointmentStatus,
    description:
      "Estado lógico de appointment. Mapeo interno a Slot.status: " +
      "PENDING→RESERVED, CONFIRMED→CONFIRMED, CANCELLED→CANCELLED, COMPLETED→COMPLETED",
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({ example: "2025-09-01T00:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2025-09-30T23:59:59.000Z" })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

export class CancelAppointmentDto {
  @ApiProperty({ example: "slot-uuid" })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ example: "El paciente no puede asistir" })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ConfirmAppointmentDto {
  @ApiProperty({ example: "slot-uuid" })
  @IsString()
  id!: string;
}
