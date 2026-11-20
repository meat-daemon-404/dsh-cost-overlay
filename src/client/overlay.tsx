import React, { useState, useEffect, useCallback } from 'react';
import { getTranslations, type Locale } from './locales.ts';
import {
  formatTokens,
  formatYuan,
  cacheHitRateOf,
  cacheSavingsOf,
  budgetUtilizationOf,
  exportCostMarkdown,
  type CostSnapshot,
  type TurnUsage,
} from '../core/pricing.ts';

declare global {
  interface Window {
    __DSH_COST_BRIDGE__?: {
      subscribe(cb: (snap: CostSnapshot) => void): () => void;
      getSnapshot(): CostSnapshot | null;
      reset(): void;
      setBudget(yuan: number): void;
      setLocale?(locale: Locale): void;
    };
  }
}

const EMPTY_SNAPSHOT: CostSnapshot = {
  sessionId: 'init',
  startedAt: Date.now(),
  totalPromptTokens: 0,
  totalCacheHitTokens: 0,
  totalCacheMissTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  totalCostYuan: 0,
  turnCount: 0,
  budgetYuan: 5.0,
  warnThreshold: 0.8,
  turns: [],
  byModel: {},
};

const STORAGE_POS_KEY = 'dsh-cost-overlay:pos';
const STORAGE_EXPANDED_KEY = 'dsh-cost-overlay:expanded';

interface CornerPos {
  right: number;
  top: number;
}

function loadSavedPos(): CornerPos {
  try {
    const raw = localStorage.getItem(STORAGE_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.right === 'number' && typeof parsed.top === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return { right: 16, top: 12 };
}

export function CostOverlayApp({ initialLocale = 'zh' }: { initialLocale?: Locale }) {
  const [snap, setSnap] = useState<CostSnapshot>(() => {
    return window.__DSH_COST_BRIDGE__?.getSnapshot() ?? EMPTY_SNAPSHOT;
  });
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_EXPANDED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [pos] = useState<CornerPos>(loadSavedPos);

  useEffect(() => {
    const bridge = window.__DSH_COST_BRIDGE__;
    if (!bridge) return;
    const current = bridge.getSnapshot();
    if (current) setSnap(current);
    return bridge.subscribe((next) => setSnap({ ...next }));
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_EXPANDED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.__DSH_COST_BRIDGE__?.reset();
  }, []);

  const handleCopyReport = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const md = exportCostMarkdown(snap);
        await navigator.clipboard.writeText(md);
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 1800);
      } catch {
        // ignore clipboard permission errors
      }
    },
    [snap],
  );

  const toggleLocale = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'));
  }, []);

  const t = getTranslations(locale);
  const util = budgetUtilizationOf(snap);
  const hitRate = cacheHitRateOf(snap);
  const cacheSaved = cacheSavingsOf(snap);

  // Status indicator color based on budget utilization
  const statusColor =
    util >= 1
      ? '#ef4444' // red-500: over budget
      : util >= snap.warnThreshold
        ? '#f59e0b' // amber-500: approaching budget
        : '#10b981'; // emerald-500: healthy

  const recentTurns: TurnUsage[] = snap.turns.slice(-6).reverse();
  const modelEntries = Object.values(snap.byModel);

  return (
    <div
      style={{
        position: 'fixed',
        right: `${pos.right}px`,
        top: `${pos.top}px`,
        zIndex: 2147483640,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: '12px',
        lineHeight: 1.4,
        color: '#e5e7eb',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      {/* Collapsed / Header Pill */}
      <div
        onClick={toggleExpanded}
        title={expanded ? t['overlay.pill.Collapse'] : t['overlay.pill.Expand']}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 11px',
          borderRadius: expanded ? '10px 10px 0 0' : '9999px',
          background: 'rgba(17, 24, 39, 0.88)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
          cursor: 'pointer',
          transition: 'all 120ms ease',
        }}
      >
        {/* Budget status dot */}
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            flexShrink: 0,
          }}
        />

        {/* Token Counter */}
        <span style={{ fontWeight: 600, color: '#f9fafb' }}>
          {formatTokens(snap.totalTokens)} tok
        </span>

        <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>

        {/* Yuan Cost */}
        <span style={{ fontWeight: 600, color: statusColor }}>
          ¥{formatYuan(snap.totalCostYuan)}
        </span>

        {/* Cache hit badge if active */}
        {snap.totalPromptTokens > 0 && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
            <span
              style={{
                fontSize: '11px',
                color: '#60a5fa',
                background: 'rgba(59, 130, 246, 0.14)',
                padding: '1px 6px',
                borderRadius: '999px',
              }}
            >
              ⚡{Math.round(hitRate * 100)}%
            </span>
          </>
        )}

        <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>

        {/* Turn counter */}
        <span style={{ color: '#9ca3af', fontSize: '11px' }}>
          {snap.turnCount} {t['overlay.pill.calls']}
        </span>

        {/* Caret */}
        <span style={{ color: '#9ca3af', fontSize: '10px', marginLeft: '2px' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {/* Expanded Detail Panel */}
      {expanded && (
        <div
          style={{
            width: '300px',
            background: 'rgba(17, 24, 39, 0.94)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderTop: 'none',
            borderRadius: '0 0 10px 10px',
            padding: '10px 12px',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Section Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              paddingBottom: '6px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ fontWeight: 600, color: '#f3f4f6' }}>
              {t['overlay.detail.sessionUsage']}
            </span>
            <button
              onClick={toggleLocale}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#d1d5db',
                borderRadius: '4px',
                padding: '1px 6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              {locale === 'zh' ? 'EN' : '中文'}
            </button>
          </div>

          {/* Token & Cost Breakdown Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              rowGap: '4px',
              fontSize: '11.5px',
              marginBottom: '10px',
            }}
          >
            <Row label={t['overlay.detail.totalTokens']} value={snap.totalTokens.toLocaleString()} />
            <Row
              label={t['overlay.detail.prompt']}
              value={`${snap.totalPromptTokens.toLocaleString()} (${Math.round(hitRate * 100)}% ${t['overlay.turn.cached']})`}
            />
            <Row
              label={t['overlay.detail.completion']}
              value={snap.totalCompletionTokens.toLocaleString()}
            />
            <Row
              label={t['overlay.detail.cacheSaved']}
              value={`¥${formatYuan(cacheSaved)}`}
              highlight="#34d399"
            />
            <Row
              label={t['overlay.detail.cost']}
              value={`¥${formatYuan(snap.totalCostYuan)}`}
              highlight={statusColor}
            />
          </div>

          {/* Budget Progress Bar */}
          {snap.budgetYuan > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: '#9ca3af',
                  marginBottom: '3px',
                }}
              >
                <span>
                  {t['overlay.detail.budget']}: ¥{snap.budgetYuan.toFixed(2)}
                </span>
                <span style={{ color: statusColor }}>
                  {util >= 1
                    ? `${t['overlay.detail.budgetExceeded']} ¥${formatYuan(snap.totalCostYuan - snap.budgetYuan)}`
                    : `${t['overlay.detail.budgetRemaining']} ¥${formatYuan(Math.max(0, snap.budgetYuan - snap.totalCostYuan))}`}
                </span>
              </div>
              <div
                style={{
                  height: '5px',
                  width: '100%',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.round(util * 100))}%`,
                    background: statusColor,
                    transition: 'width 200ms ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Per-Model Aggregation */}
          {modelEntries.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div
                style={{
                  fontSize: '10.5px',
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '4px',
                }}
              >
                {t['overlay.detail.byModel']}
              </div>
              {modelEntries.map((m) => (
                <div
                  key={m.model}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    padding: '2px 0',
                  }}
                >
                  <span style={{ color: '#d1d5db' }}>
                    {m.model} <span style={{ color: '#6b7280' }}>({m.turns})</span>
                  </span>
                  <span style={{ color: '#f3f4f6' }}>
                    {formatTokens(m.promptTokens + m.completionTokens)} · ¥{formatYuan(m.costYuan)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Recent Turns List */}
          <div style={{ marginBottom: '10px' }}>
            <div
              style={{
                fontSize: '10.5px',
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '4px',
              }}
            >
              {t['overlay.detail.recentTurns']}
            </div>
            {recentTurns.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: '11px', fontStyle: 'italic' }}>
                {t['overlay.detail.noCalls']}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {recentTurns.map((turn) => (
                  <div
                    key={turn.turnIndex}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '3px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    <span style={{ color: '#9ca3af' }}>
                      #{turn.turnIndex} {turn.model}
                    </span>
                    <span>
                      {formatTokens(turn.totalTokens)} ·{' '}
                      <span style={{ color: '#10b981' }}>¥{formatYuan(turn.costYuan)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '6px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              onClick={handleReset}
              style={{
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                borderRadius: '5px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {t['overlay.detail.reset']}
            </button>
            <button
              onClick={handleCopyReport}
              style={{
                background: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#6ee7b7',
                borderRadius: '5px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {copiedReport ? t['overlay.detail.copiedReport'] : t['overlay.detail.copyReport']}
            </button>
            <button
              onClick={toggleExpanded}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                color: '#e5e7eb',
                borderRadius: '5px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {t['overlay.detail.close']}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <>
      <span style={{ color: '#9ca3af' }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight ?? '#f3f4f6', textAlign: 'right' }}>
        {value}
      </span>
    </>
  );
}
