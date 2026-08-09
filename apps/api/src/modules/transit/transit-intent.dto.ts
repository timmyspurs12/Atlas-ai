import { IsString, Length } from 'class-validator';

export class InterpretTransitJourneyDto {
  @IsString()
  @Length(2, 300)
  question: string;
}
