import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CleanOptional, ToNumber } from '@/common/dto/transforms';

/**
 * A kind of unit a property has — "1B", "2B", "3B".
 *
 * A property declares its own kinds, because two estates call the same thing
 * different things and the deposit for a "2B" in one is not the deposit for a
 * "2B" in another. The deposit rule hangs off this row (see the deposits
 * module), which is why it has to be a controlled value rather than a string
 * typed on the unit.
 */
export class CreateUnitTypeDto {
  /** What the estate calls it: "1B". */
  @IsString()
  @MaxLength(30)
  @CleanOptional()
  code!: string;

  /** What people read: "One Bedroom". */
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ToNumber()
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ToNumber()
  bathrooms?: number;
}

/** Every editable field of a unit type, all optional. */
export class UpdateUnitTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @CleanOptional()
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @CleanOptional()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ToNumber()
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ToNumber()
  bathrooms?: number;
}
