# Marked TUI shapes

The TUI is a stable presentation surface. Marked data is the source of truth;
workers turn the returned packets into these small, evidence-linked shapes.

| Shape | Marked inputs | India-first use |
|---|---|---|
| Quote | prices, instruments | NSE/BSE price, currency, freshness, provenance |
| Financial profile | financials, financial-metrics | consolidated/standalone facts, fiscal period, units |
| Ownership | shareholding | promoter, FII, DII, public and pledge context |
| Disclosures | filings | filing type, publication date, source link |
| Events | events, corporate-actions | event date, known-at date, source link |
| Verdict | worker result + evidence IDs | thesis, conviction, catalysts, risks, invalidation |
| Sources | every evidence record | audit trail for each material claim |

Workers should emit the existing block protocol rather than inventing a new
renderer. The runtime owns session state, render timing, cancellation and
worker selection. Marked owns data retrieval, identity resolution and
provenance.

## Required display conventions

- Show `NSE:` or `BSE:` plus the resolved symbol and ISIN when available.
- Show `₹` only for INR values; retain the API currency for other instruments.
- Show dates and fiscal periods explicitly; do not turn stale or amended data
  into a current-looking number.
- Keep consolidated versus standalone basis visible beside financial facts.
- Render source links and evidence IDs in the final sources table.
- Label analysis as research, not a recommendation or execution instruction.
