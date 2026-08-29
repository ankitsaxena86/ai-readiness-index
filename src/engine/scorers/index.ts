/**
 * The scorer registry. Order here is display order in the UI; scoring itself
 * is order-independent.
 */

import type { DimensionScorer } from '../types';
import { contextScorer } from './context';
import { verifiabilityScorer } from './verifiability';
import { reproducibilityScorer } from './reproducibility';
import { documentationScorer } from './documentation';
import { navigabilityScorer } from './navigability';
import { changeSafetyScorer } from './changeSafety';

export const SCORERS: readonly DimensionScorer[] = [
  contextScorer,
  verifiabilityScorer,
  reproducibilityScorer,
  documentationScorer,
  navigabilityScorer,
  changeSafetyScorer,
];

export {
  contextScorer,
  verifiabilityScorer,
  reproducibilityScorer,
  documentationScorer,
  navigabilityScorer,
  changeSafetyScorer,
};
