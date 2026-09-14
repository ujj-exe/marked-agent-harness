/**
 * Schema for the "news" panel.
 *
 * Component: newsStream({ items: [{title, source, time, url}], width, limit })
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {
    items: [],
    limit: 8,
  },
  coerce: {
    // string[] → [{title, source, time, url}]
    items: (val, data) => {
      if (Array.isArray(val)) {
        data.items = val.map(item => {
          if (typeof item === 'string') {
            return { title: item, source: '', time: '', url: '' };
          }
          return item;
        });
      }
    },
    // Coerce limit from string to number; cap at 50
    limit: (val, data) => {
      if (typeof val === 'string') {
        const n = Number(val);
        if (!isNaN(n)) data.limit = n;
      }
      if (typeof data.limit === 'number' && data.limit > 50) data.limit = 50;
    },
  },
  shape: 'object with { items: [{title, source, time, url}] }',
  dataSources: ['marked.filings', 'external-news-provider'],
};
