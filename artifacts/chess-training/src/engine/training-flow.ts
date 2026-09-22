import type { OpeningColor, OpeningVariant } from '@/data/openings';

/**
 * The color used for an opening exercise is a pedagogical role, not a random
 * presentation setting. Named defenses are trained from Black's perspective;
 * openings, attacks and gambits are trained from White's perspective.
 */
export function getOpeningTrainingColor(variant: OpeningVariant): OpeningColor {
  const name = variant.name.toLocaleLowerCase('es');
  const defense = variant.defense.toLocaleLowerCase('es');
  return name.includes('defensa') || defense.startsWith('defensa') ? 'black' : 'white';
}

export function openingRoleLabel(variant: OpeningVariant): string {
  return getOpeningTrainingColor(variant) === 'black' ? 'Defensa · negras' : 'Apertura/ataque · blancas';
}
