/**
 * Mapper: Parameter Mapping Engine
 * Transforms normalized biophysical feature inputs (RMS tension envelope, Spectral Centroid)
 * into target synthesis parameter values with customizable transfer curves.
 */

export class Mapper {
  constructor() {
    this.mappings = {
      // RMS Tension -> Filter Cutoff
      rmsToFilter: {
        min: 100,
        max: 8000,
        curve: 'exp', // 'linear', 'log', 'exp'
        curveParam: 2.0,
        inverted: false
      },
      // RMS Tension -> Pitch Bend / Frequency
      rmsToPitch: {
        min: 45, // Base MIDI note / Hz
        max: 300,
        curve: 'log',
        curveParam: 3.0,
        inverted: false
      },
      // RMS Tension -> Grain Density
      rmsToGrainDensity: {
        min: 5,
        max: 60,
        curve: 'exp',
        curveParam: 1.5,
        inverted: false
      },
      // Spectral Centroid -> Granular Pitch / Brightness
      centroidToPitch: {
        min: 0.5,
        max: 3.0,
        curve: 'linear',
        curveParam: 1.0,
        inverted: false
      }
    };
  }

  /**
   * Apply transfer curve to normalized input x in [0.0, 1.0]
   */
  evaluateCurve(x, curveType, param = 2.0, inverted = false) {
    let clampedX = Math.max(0.0, Math.min(1.0, x));
    if (inverted) clampedX = 1.0 - clampedX;

    switch (curveType) {
      case 'log':
        // Logarithmic response curve
        const kLog = Math.max(0.1, param * 5);
        return Math.log(1 + kLog * clampedX) / Math.log(1 + kLog);

      case 'exp':
        // Exponential response curve
        return Math.pow(clampedX, param);

      case 'linear':
      default:
        return clampedX;
    }
  }

  /**
   * Map input value to output range using mapping config key
   */
  mapValue(featureVal, mappingKey) {
    const config = this.mappings[mappingKey];
    if (!config) return featureVal;

    const normalizedVal = Math.max(0.0, Math.min(1.0, featureVal));
    const curvedVal = this.evaluateCurve(normalizedVal, config.curve, config.curveParam, config.inverted);
    return config.min + (config.max - config.min) * curvedVal;
  }
}
