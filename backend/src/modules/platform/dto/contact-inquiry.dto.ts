import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A visitor's message to the platform team (landing site contact form).
 *
 * No organization, no user — the sender has neither. `subject` is required
 * (not optional) because an untriaged "no subject" queue is where messages go
 * to be ignored, and the form asks for one anyway.
 */
export class CreateContactInquiryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;
}
