// Component library entry point
export { setTheme, getTheme, palette, themeColors, themes, MARKET_GREEN, MARKET_RED } from './themes.js';
export * from './ansi.js';
export * from './formatters.js';
export { renderMarkdownInline, renderMarkdownBlock } from './markdown.js';

// Components
export { brailleChart } from './components/BrailleChart.js';
export { candlestickChart } from './components/CandlestickChart.js';
export { heatMap } from './components/HeatMap.js';
export { gaugeBar, gaugeStack } from './components/GaugeBar.js';
export { waterfallChart } from './components/WaterfallChart.js';
export { treeMap } from './components/TreeMap.js';
export { insiderTimeline } from './components/InsiderTimeline.js';
export { holderBar } from './components/HolderBar.js';
export { macroDashboard } from './components/MacroDashboard.js';
export { correlationMatrix } from './components/CorrelationMatrix.js';
export { earningsSurprise } from './components/EarningsSurprise.js';
export { flowSankey } from './components/FlowSankey.js';
export { newsStream } from './components/NewsStream.js';
export { verdict } from './components/Verdict.js';
export { quoteHeader } from './components/QuoteHeader.js';
export { analystBar } from './components/AnalystBar.js';
export { filingTimeline } from './components/FilingTimeline.js';
