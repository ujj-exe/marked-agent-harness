#!/usr/bin/env node
/**
 * bin/screenshot.js — marked --screenshot
 *
 * Render a single demo frame to stdout or a file.
 * No TUI server needed — uses engine.js + src/index.js directly.
 *
 * Usage:
 *   marked --screenshot [width] [output-file]
 *
 * Env vars (set by the Marked launcher):
 *   MARKED_SCREENSHOT_WIDTH   — terminal width (default 120)
 *   MARKED_SCREENSHOT_OUTPUT  — output file path (default: stdout)
 */
import { renderBlocks } from '../terminal/engine.js';
import { setTheme } from '../src/index.js';
import fs from 'fs';
import path from 'path';

const width = parseInt(process.env.MARKED_SCREENSHOT_WIDTH || '120', 10);
const outputFile = process.env.MARKED_SCREENSHOT_OUTPUT || null;

// Apply the retained lime theme so colors match the live TUI
setTheme('marked');

// ── Demo payload — NVDA analyst deep dive ──────────────────────────────────

// Load from ~/.marked/demo.json if it exists, otherwise use built-in
let blocks;
const demoPath = path.join(process.env.HOME || '~', '.marked', 'demo.json');
if (fs.existsSync(demoPath)) {
  try {
    blocks = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
    process.stderr.write(`screenshot: loaded demo payload from ${demoPath}\n`);
  } catch (err) {
    process.stderr.write(`screenshot: failed to parse ${demoPath}: ${err.message}\n`);
  }
}

if (!blocks) {
  blocks = [
    {
      text: '\x1b[38;2;61;122;0m▐\x1b[38;2;127;191;0m█\x1b[38;2;192;255;0m█\x1b[0m \x1b[1m\x1b[38;2;192;255;0mMARKED\x1b[0m · analyst · RELIANCE',
    },
    {
      panel: 'quote',
      data: {
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        price: 131.28,
        changePct: -2.4,
        volume: 82100000,
        marketCap: 3240000000000,
        yearHigh: 195,
        yearLow: 98,
        variant: 'dense',
      },
    },
    {
      row: [
        {
          panel: 'chart',
          data: {
            values: [168, 172, 180, 175, 160, 155, 148, 145, 140, 138, 135, 131],
            label: '6M weekly',
          },
          w: 0.55,
        },
        {
          panel: 'technical',
          data: {
            rsi: 33.4,
            signals: [
              'Trend: bearish',
              'Momentum: bearish',
              'MACD: -4.12 (signal: -2.88)',
              'Support: $120 | Resistance: $145',
              'Signal: sell (85%)',
            ],
          },
          w: 0.45,
        },
      ],
    },
    { divider: 'ANALYST CONSENSUS' },
    {
      panel: 'analyst',
      data: { buy: 42, hold: 6, sell: 1, target: 178, current: 131.28 },
    },
    { divider: 'MACRO CONTEXT' },
    {
      panel: 'macro',
      data: {
        pillars: [
          { pillar: 'inflation', state: 'STICKY', direction: 'flat' },
          { pillar: 'growth', state: 'MODERATING', direction: 'down' },
          { pillar: 'labor', state: 'COOLING', direction: 'down' },
          { pillar: 'rates', state: 'HAWKISH HOLD', direction: 'up' },
        ],
      },
    },
    { divider: 'VERDICT' },
    {
      panel: 'verdict',
      data: {
        sections: [
          { type: 'conviction', value: 'bear', ticker: 'NVDA' },
          {
            type: 'thesis',
            text: 'NVIDIA is a falling knife disguised as a dip buy. Forward P/E of 38x prices in datacenter perfection — one weak GTC guidance print and this unwinds to $115. The Blackwell ramp is real, but so is the China export wall. Wait for the pullback to $120 where the 200-day provides structural support.',
          },
          {
            type: 'catalysts',
            items: [
              'Q1 FY26 earnings May 28',
              'GTC 2026 keynote — Blackwell Ultra',
              'TSMC CoWoS 3x expansion H2',
            ],
          },
          {
            type: 'risks',
            items: [
              'China export controls — 15% revenue at risk',
              'Hyperscaler capex cycle peaking',
              'ARM custom silicon competition',
            ],
          },
          { type: 'levels', support: 120, resistance: 145, timeframe: 'weeks' },
          {
            type: 'invalidation',
            text: 'Above $145 on volume with datacenter beat invalidates the bear case',
          },
        ],
      },
    },
  ];
}

// ── Render ──────────────────────────────────────────────────────────────────

const output = renderBlocks(blocks, width);

if (outputFile) {
  fs.writeFileSync(outputFile, output + '\n');
  process.stderr.write(`screenshot: written to ${outputFile} (${width} cols)\n`);
} else {
  process.stdout.write(output + '\n');
}
