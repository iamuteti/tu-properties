import { IsArray, IsString } from 'class-validator';

/**
 * Replaces the enabled modules for one organization. The caller sends the full
 * desired set each time — there is no per-module add/remove endpoint, so the
 * UI always renders the complete module list and saves whatever is checked.
 */
export class SetEnabledModulesDto {
  @IsArray()
  @IsString({ each: true })
  enabledModules!: string[];
}
