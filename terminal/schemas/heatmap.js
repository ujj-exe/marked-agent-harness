/**
 * Schema for the "heatmap" panel.
 *
 * Component: heatMap({ rows, columns, width, colorScale })
 *
 * Expected shape: { rows: Array<{label, values}>, columns: string[] }
 */

const VALID_COLOR_SCALES = ['diverging', 'sequential'];

export const schema = {
  type: 'object',
  required: [],
  defaults: {
    colorScale: 'diverging',
  },
  coerce: {},
  validate(data) {
    const warnings = [];

    data.rows    = data.rows    ?? [];
    data.columns = data.columns ?? [];

    if (!Array.isArray(data.rows) || data.rows.length === 0) {
      warnings.push('⚠ rows missing or empty');
    }

    if (!Array.isArray(data.columns) || data.columns.length === 0) {
      warnings.push('⚠ columns missing or empty');
    }

    // Apply default for colorScale if missing
    if (data.colorScale == null) {
      data.colorScale = 'diverging';
    } else if (!VALID_COLOR_SCALES.includes(data.colorScale)) {
      warnings.push(`⚠ unknown colorScale "${data.colorScale}" — using diverging`);
      data.colorScale = 'diverging';
    }

    // Coerce row values to numbers
    if (Array.isArray(data.rows)) {
      data.rows = data.rows.map(r => {
        const out = { ...r };
        if (Array.isArray(out.values)) {
          out.values = out.values.map(v => (typeof v === 'string' ? Number(v) : v));
        }
        return out;
      });
    }

    if (warnings.length > 0) return { data, warnings };
    return data;
  },
  shape: 'object with { rows: [{label, values}], columns: string[] }',
  dataSources: [],
};
