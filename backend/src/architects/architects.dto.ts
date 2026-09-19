import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertArchitectDto {
  @IsString()
  @MaxLength(120)
  officeName!: string;

  @IsString()
  @MaxLength(80)
  representativeName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  kakaoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  regions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  specialties?: string;

  @IsString()
  @MaxLength(20)
  businessNumber!: string;

  @IsString()
  @MaxLength(20)
  businessStartDate!: string;

  @IsString()
  @MaxLength(120)
  businessName!: string;
}

export class VerifyBusinessDto {
  @IsString()
  @MaxLength(20)
  businessNumber!: string;

  @IsString()
  @MaxLength(20)
  businessStartDate!: string;

  @IsString()
  @MaxLength(80)
  representativeName!: string;

  @IsString()
  @MaxLength(120)
  businessName!: string;
}

export class UpdateArchitectStatusDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'HIDDEN'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
