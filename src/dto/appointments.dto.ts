import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty() @IsString() orgId!: string;
  @ApiProperty() @IsString() centerId!: string;
  @ApiProperty() @IsString() patientUserId!: string;

  @ApiProperty({ example: '2025-08-20T14:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2025-08-20T14:30:00.000Z' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class ListAppointmentsDto {
  @ApiProperty() @IsString() orgId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() patientUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}

export class CancelAppointmentDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() orgId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
