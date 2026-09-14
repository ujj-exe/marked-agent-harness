/**
 * Schema for flowSankey panel.
 *
 * Expected shape: { nodes: [{label, value}], flows?: [{from, to, value?}] }
 */
export const schema = {
  required: ['nodes'],

  coerce: {
    nodes: (val, data) => {
      if (!Array.isArray(val)) {
        data.nodes = [];
        return;
      }
      // Coerce node value (string → number)
      data.nodes = val.map(node => {
        if (typeof node !== 'object' || node === null) return node;
        const out = { ...node };
        if (typeof out.value === 'string') out.value = Number(out.value);
        return out;
      });
    },
    flows: (val, data) => {
      if (!Array.isArray(val)) {
        data.flows = [];
        return;
      }
      // Coerce flow value (string → number)
      data.flows = val.map(flow => {
        if (typeof flow !== 'object' || flow === null) return flow;
        const out = { ...flow };
        if (typeof out.value === 'string') out.value = Number(out.value);
        return out;
      });
    },
  },

  defaults: {
    flows: [],
  },
  dataSources: [],
};
