import { useState, useEffect, useCallback } from 'react';
import { rehydrateDeep } from '../agents/rehydrate';

const ACCENT = 'rgba(91,140,255,';
const ACCENT_B = 'rgba(160,107,255,';

const URGENCY_COLOR = (score) => {
  if (score >= 8) return { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.2)', dot: '#f87171' };
  if (score >= 5) return { bg: 'rgba(251,146,60,.06)', border: 'rgba(251,146,60,.2)', dot: '#fb923c' };
  return { bg: 'rgba(74,222,128,.05)', border: 'rgba(74,222,128,.15)', dot: '#4ade80' };
};

const DOC_TYPE_LABELS = {
  immigration: 'Immigration',
  medical:     'Medical discharge',
  housing:     'Housing',
  education:   'Special education',
  juvenile:    'Juvenile court',
  legal:       'Legal notice',
  unknown:     'Document',
};

const STORAGE_KEY = (docType) => `rh_checklist_${docType}_${Date.now().toString(36)}`;

/**
 * CrisisActionRoom — Phase 0 output shell
 *
 * Four zones (spec §"The Crisis Action Room"):
 *   1. Privacy Badge   — the demoable moment proof
 *   2. Plain Summary   — re-hydrated, grade-6, second person
 *   3. Urgency Checklist — actions ranked by harm score, check-off with localStorage
 *   4. (Phase 1) Deadline Clock + Local Resources
 *
 * Props:
 *   analysis    {object}           — structured output from Simplifier
 *   mappingTable {Map<string,str>} — Guardian's mapping (for re-hydration)
 *   guardianStats {object}         — { total, types } from Guardian (for badge)
 *   onReset     {function}         — return to UploadZone
 *   onNewDoc    {function}         — alias for onReset
 */
export default function CrisisActionRoom({ analysis, mappingTable, guardianStats, onReset }) {
  // Re-hydrate all string values in the analysis object client-side
  const hydrated = rehydrateDeep(analysis, mappingTable);

  // Checklist state persisted in localStorage
  const [storageKey] = useState(() => STORAGE_KEY(analysis?.docType ?? 'doc'));
  const [checked, setChecked] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggle = useCallback(
    (id) => {
      setChecked((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch { /* quota exceeded — silent fail */ }
        return next;
      });
    },
    [storageKey]
  );

  const actions = (hydrated.actions ?? []).slice().sort((a, b) => b.urgencyScore - a.urgencyScore);
  const completedCount = actions.filter((a) => checked.has(a.id)).length;

  // ─── Shared styles ──────────────────────────────────────────────────────
  const panel = (extra = {}) => ({
    background: 'rgba(255,255,255,.035)',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 16,
    padding: '24px 28px',
    ...extra,
  });

  const label = (color = '#5a637c') => ({
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '.16em',
    textTransform: 'uppercase',
    color,
    marginBottom: 12,
    display: 'block',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#06070e',
        color: '#eef1f7',
        fontFamily: "'Hanken Grotesk', 'D-DIN Bold', system-ui, sans-serif",
      }}
    >
      {/* ── Nav ── */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 32px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
          position: 'sticky',
          top: 0,
          background: 'rgba(6,7,14,.85)',
          backdropFilter: 'blur(14px)',
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: `linear-gradient(135deg,${ACCENT}1),${ACCENT_B}1))`,
              boxShadow: `0 0 10px ${ACCENT}0.9)`,
            }}
          />
          <span
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 18,
              letterSpacing: '.005em',
            }}
          >
            ResilienceHub
          </span>
          {hydrated.docType && hydrated.docType !== 'unknown' && (
            <span
              style={{
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: 999,
                background: `${ACCENT}0.1)`,
                border: `1px solid ${ACCENT}0.2)`,
                color: '#5b8cff',
                marginLeft: 4,
              }}
            >
              {DOC_TYPE_LABELS[hydrated.docType] ?? hydrated.docType}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onReset}
            style={{
              background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 999,
              padding: '9px 18px',
              color: '#eef1f7',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background .2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.09)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.05)')}
          >
            Analyze another document
          </button>
        </div>
      </nav>

      <div
        style={{
          maxWidth: 780,
          margin: '0 auto',
          padding: '40px 24px 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >

        {/* ── Zone 0: Privacy Badge — the demoable moment ── */}
        <div
          style={{
            ...panel(),
            background: 'rgba(91,140,255,.06)',
            border: '1px solid rgba(91,140,255,.18)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${ACCENT}0.12)`,
              border: `1px solid ${ACCENT}0.2)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            🔒
          </div>
          <div>
            <span style={label('#5b8cff')}>Privacy guarantee</span>
            <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6, color: '#eef1f7' }}>
              {guardianStats?.total > 0 ? (
                <>
                  <strong>{guardianStats.total} identifier{guardianStats.total > 1 ? 's' : ''}</strong> were
                  replaced with tokens before this document left your device.{' '}
                  {Object.entries(guardianStats.types ?? {})
                    .map(([k, n]) => `${n} ${k.toLowerCase()}`)
                    .join(' · ')
                    .replace(/,([^,]*)$/, ' and$1')}
                  .
                </>
              ) : (
                'No structured identifiers were detected in this document. The Guardian found no SINs, SSNs, health card numbers, phone numbers, dates, amounts, or postal codes.'
              )}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#5a637c', fontFamily: "'IBM Plex Mono', monospace" }}>
              Open DevTools → Network → look at the outgoing request body.
              You will see tokens like [DATE_1], not your real values.
            </p>
          </div>
        </div>

        {/* ── Zone 1: Urgency note ── */}
        {hydrated.urgencyNote && (
          <div
            style={{
              ...panel(),
              background: 'rgba(239,68,68,.05)',
              border: '1px solid rgba(239,68,68,.16)',
            }}
          >
            <span style={label('#f87171')}>Most urgent</span>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, fontWeight: 500, color: '#eef1f7' }}>
              {hydrated.urgencyNote}
            </p>
          </div>
        )}

        {/* ── Zone 2: Plain Summary ── */}
        <div style={panel()}>
          <span style={label()}>Plain language summary</span>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.75, color: '#d8dff0' }}>
            {hydrated.summary}
          </p>
          {hydrated.jurisdiction && hydrated.jurisdiction !== 'unknown' && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid rgba(255,255,255,.06)',
                fontSize: 13,
                color: '#5a637c',
              }}
            >
              Jurisdiction detected: <span style={{ color: '#98a2bb' }}>{hydrated.jurisdiction}</span>
            </div>
          )}
        </div>

        {/* ── Zone 3: Urgency Checklist ── */}
        <div style={panel({ padding: '24px 0' })}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 28px 16px',
              borderBottom: '1px solid rgba(255,255,255,.06)',
              marginBottom: 8,
            }}
          >
            <span style={{ ...label(), marginBottom: 0 }}>Action checklist</span>
            {actions.length > 0 && (
              <span style={{ fontSize: 13, color: '#5a637c' }}>
                {completedCount}/{actions.length} done
              </span>
            )}
          </div>

          {actions.length === 0 ? (
            <p style={{ padding: '0 28px', color: '#5a637c', fontSize: 14 }}>
              No required actions were identified in this document.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {actions.map((action, index) => {
                const done = checked.has(action.id);
                const colors = URGENCY_COLOR(action.urgencyScore);
                return (
                  <div
                    key={action.id}
                    onClick={() => toggle(action.id)}
                    style={{
                      display: 'flex',
                      gap: 16,
                      padding: '16px 28px',
                      cursor: 'pointer',
                      transition: 'background .15s',
                      background: done ? 'rgba(74,222,128,.025)' : 'transparent',
                      borderLeft: `3px solid ${done ? '#4ade80' : colors.dot}`,
                      marginLeft: 1,
                    }}
                    onMouseEnter={(e) => !done && (e.currentTarget.style.background = 'rgba(255,255,255,.025)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = done ? 'rgba(74,222,128,.025)' : 'transparent')}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: done ? '2px solid #4ade80' : `2px solid ${colors.dot}`,
                        background: done ? 'rgba(74,222,128,.15)' : 'transparent',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                        transition: 'all .15s',
                      }}
                    >
                      {done && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4l3 3.5L10 1" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, opacity: done ? 0.45 : 1 }}>
                      <p
                        style={{
                          margin: '0 0 6px',
                          fontWeight: 600,
                          fontSize: 15,
                          textDecoration: done ? 'line-through' : 'none',
                          color: '#eef1f7',
                        }}
                      >
                        {action.text}
                      </p>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {action.deadline && action.deadline !== 'no hard deadline — sooner is better' && (
                          <span
                            style={{
                              fontSize: 12,
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              color: colors.dot,
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}
                          >
                            {action.deadline}
                          </span>
                        )}
                        {action.deadline === 'no hard deadline — sooner is better' && (
                          <span
                            style={{
                              fontSize: 12,
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: 'rgba(255,255,255,.04)',
                              border: '1px solid rgba(255,255,255,.08)',
                              color: '#5a637c',
                            }}
                          >
                            No hard deadline
                          </span>
                        )}
                        {action.deadline === 'immediate' && (
                          <span
                            style={{
                              fontSize: 12,
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: 'rgba(239,68,68,.08)',
                              border: '1px solid rgba(239,68,68,.22)',
                              color: '#f87171',
                              fontWeight: 600,
                            }}
                          >
                            Do this now
                          </span>
                        )}
                      </div>

                      {action.consequence && (
                        <p style={{ margin: 0, fontSize: 13, color: '#5a637c', lineHeight: 1.5 }}>
                          If skipped: {action.consequence}
                        </p>
                      )}
                    </div>

                    {/* Urgency score */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.dot,
                        flexShrink: 0,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {action.urgencyScore}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Zone 4: Phase 1 placeholder ── */}
        <div
          style={{
            ...panel(),
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,.07)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <span style={{ fontSize: 20, opacity: 0.3 }}>🗓</span>
          <div>
            <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600, color: '#5a637c' }}>
              Deadline Clock + Local Resources
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#3a4255' }}>
              Phase 1 — countdown timers, .ics calendar export, and jurisdiction-specific
              phone numbers and office addresses.
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <p
          style={{
            fontSize: 12,
            color: '#3a4255',
            lineHeight: 1.6,
            textAlign: 'center',
            maxWidth: 580,
            margin: '0 auto',
          }}
        >
          ResilienceHub helps you understand documents — it is not legal, medical, or immigration
          advice. Verify critical deadlines and consequences with a qualified professional before acting.
        </p>
      </div>
    </div>
  );
}
