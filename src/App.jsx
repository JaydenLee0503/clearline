/**
 * App.jsx — ResilienceHub
 *
 * State machine:
 *   'landing'   → Beacon Atlas marketing page (existing template)
 *   'upload'    → UploadZone (document input)
 *   'analyzing' → Processing state (Guardian + Simplifier running)
 *   'results'   → CrisisActionRoom (analysis output)
 *
 * The landing page stays mounted in all states (display:none when hidden)
 * so its scroll animations don't reset when returning from the product.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import beaconSource from '../legacy/Beacon Atlas.dc.html?raw';

import UploadZone from './components/UploadZone';
import CrisisActionRoom from './components/CrisisActionRoom';

import { runGuardian } from './agents/guardian';
import { runSimplifier } from './agents/simplifier';

// ─── Beacon Atlas template helpers (unchanged from original) ───────────────

const HEADLINE =
  'When life sends hard documents, Beacon Atlas turns them into clear next steps.';

function buildBeaconTemplate() {
  const style = beaconSource.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const root = beaconSource.match(
    /<div ref="\{\{ rootRef \}\}"([^>]*)>([\s\S]*)<\/div>\s*<\/x-dc>/
  );

  if (!root) {
    return {
      style,
      markup: '<div data-beacon-root>Beacon Atlas template could not be loaded.</div>',
    };
  }

  const [, attrs, inner] = root;
  const markup = `<div data-beacon-root${attrs}>${inner}</div>`
    .replaceAll('{{ headline }}', HEADLINE)
    .replaceAll('ref="{{ globeRef }}"', 'data-globe-canvas=""');

  return { style, markup };
}

function installHoverStyles(root) {
  return [...root.querySelectorAll('[style-hover]')].map((element) => {
    const baseStyle = element.getAttribute('style') || '';
    const hoverStyle = element.getAttribute('style-hover') || '';
    const activeStyle = `${baseStyle}${baseStyle.endsWith(';') ? '' : ';'}${hoverStyle}`;

    const show = () => element.setAttribute('style', activeStyle);
    const hide = () => element.setAttribute('style', baseStyle);

    element.addEventListener('mouseenter', show);
    element.addEventListener('mouseleave', hide);
    element.addEventListener('focus', show);
    element.addEventListener('blur', hide);

    return () => {
      element.removeEventListener('mouseenter', show);
      element.removeEventListener('mouseleave', hide);
      element.removeEventListener('focus', show);
      element.removeEventListener('blur', hide);
    };
  });
}

function useBeaconAnimations(hostRef) {
  useEffect(() => {
    const host = hostRef.current;
    const root = host?.querySelector('[data-beacon-root]');
    if (!root) return undefined;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (start, end, amount) => start + (end - start) * amount;
    const hoverCleanups = installHoverStyles(root);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduce = Boolean(media?.matches);

    let pendingReveals = [...root.querySelectorAll('[data-reveal]')];
    let warned = false;
    const nav = root.querySelector('[data-nav]');
    const parallaxEls = [...root.querySelectorAll('[data-parallax]')];
    const scenes = [...root.querySelectorAll('[data-scene]')];
    const cache = {
      chips: [...root.querySelectorAll('[data-chip]')],
      clarityPanel: root.querySelector('[data-clarity-panel]'),
      clarityTag: root.querySelector('[data-clarity-tag]'),
      tdoc: root.querySelector('[data-tdoc]'),
      tconn: root.querySelector('[data-tconn]'),
      tcards: [...root.querySelectorAll('[data-tcard]')],
      pipeTrack: root.querySelector('[data-pipe-track]'),
      pipeProgress: root.querySelector('[data-pipe-progress]'),
      globalText: root.querySelector('[data-global-text]'),
      globalStats: root.querySelector('[data-global-stats]'),
      words: [...root.querySelectorAll('[data-word]')],
    };

    const hexRgba = (hex, alpha) => {
      let clean = (hex || '').trim().replace('#', '');
      if (clean.length === 3) clean = clean.split('').map((char) => char + char).join('');
      const value = parseInt(clean || '5b8cff', 16);
      return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
    };

    const sceneProblem = (progress) => {
      const eased = 1 - Math.pow(1 - clamp(progress / 0.8, 0, 1), 3);
      cache.chips.forEach((chip) => {
        const from = (chip.getAttribute('data-from') || '0,0,0').split(',').map(Number);
        const amount = 1 - eased;
        chip.style.transform = `translate(${from[0] * amount}px,${from[1] * amount}px) rotate(${from[2] * amount}deg) scale(${lerp(0.92, 1, eased)})`;
      });
      if (cache.clarityPanel) {
        cache.clarityPanel.style.opacity = clamp((eased - 0.4) / 0.5, 0, 1) * 0.9;
      }
      if (cache.clarityTag) {
        const tagProgress = clamp((eased - 0.6) / 0.4, 0, 1);
        cache.clarityTag.style.opacity = tagProgress;
        cache.clarityTag.style.transform = `translateX(-50%) translateY(${(1 - tagProgress) * 12}px)`;
      }
    };

    const sceneTransform = (progress) => {
      const slide = clamp(progress / 0.22, 0, 1);
      if (cache.tdoc) cache.tdoc.style.transform = `translateX(${lerp(120, 0, slide)}px)`;
      if (cache.tconn) cache.tconn.style.opacity = clamp((progress - 0.18) / 0.12, 0, 1);
      cache.tcards.forEach((card, index) => {
        const start = 0.3 + index * 0.125;
        const local = clamp((progress - start) / 0.14, 0, 1);
        const eased = 1 - Math.pow(1 - local, 3);
        card.style.opacity = eased;
        card.style.transform = `translateX(${(1 - eased) * 40}px)`;
      });
    };

    const scenePipelines = (progress) => {
      const track = cache.pipeTrack;
      if (!track) return;
      const maxOffset = track.scrollWidth - window.innerWidth + 40;
      const eased = clamp(progress, 0, 1);
      track.style.transform = `translateX(${-Math.max(0, maxOffset) * eased}px)`;
      if (cache.pipeProgress) cache.pipeProgress.style.width = `${14 + eased * 86}%`;
    };

    const sceneGlobal = (progress) => {
      if (cache.globalText) {
        const amount = clamp(progress / 0.35, 0, 1);
        cache.globalText.style.opacity = amount;
        cache.globalText.style.transform = `translateY(${(1 - amount) * 28}px)`;
      }
      if (cache.globalStats) {
        const amount = clamp((progress - 0.3) / 0.3, 0, 1);
        cache.globalStats.style.opacity = amount;
        cache.globalStats.style.transform = `translateY(${(1 - amount) * 20}px)`;
      }
    };

    const sceneMission = (progress) => {
      const words = cache.words;
      const count = words.length;
      words.forEach((word, index) => {
        const start = (index / count) * 0.62;
        const local = clamp((progress - start) / 0.16, 0, 1);
        word.style.opacity = (0.12 + 0.88 * local).toFixed(3);
        word.style.transform = `translateY(${(1 - local) * 10}px)`;
      });
    };

    const sceneHandlers = {
      problem: sceneProblem,
      transform: sceneTransform,
      pipelines: scenePipelines,
      global: sceneGlobal,
      mission: sceneMission,
    };

    const initGlobe = () => {
      const canvas = root.querySelector('[data-globe-canvas]');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return null;

      const computed = getComputedStyle(root);
      const accentA = (computed.getPropertyValue('--a') || '#5b8cff').trim();
      const accentB = (computed.getPropertyValue('--b') || '#a06bff').trim();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const deg = Math.PI / 180;
      let running = true;
      let theta = 0.4;
      let time = 0;
      let raf = 0;

      const resize = () => {
        const size = canvas.clientWidth || 480;
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      };

      const nodes = [
        [40.7, -74], [51.5, -0.1], [19.4, -99.1], [28.6, 77.2],
        [-23.5, -46.6], [35.7, 139.7], [-33.9, 18.4], [1.3, 103.8],
        [30, 31.2], [48.8, 2.3], [-1.3, 36.8], [25, 55.3],
      ].map((node) => [node[0] * deg, node[1] * deg]);
      const arcs = [[0,1],[0,4],[1,8],[3,7],[5,9],[2,0],[6,10],[8,3],[11,5]];

      const vec = (phi, lam) => [
        Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam),
      ];
      const rotY = (vector, angle) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [vector[0]*cos+vector[2]*sin, vector[1], -vector[0]*sin+vector[2]*cos];
      };

      const draw = () => {
        if (!running) return;
        const width = canvas.width, height = canvas.height;
        const cx = width / 2, cy = height / 2;
        const radius = Math.min(width, height) * 0.42;

        ctx.clearRect(0, 0, width, height);
        ctx.lineWidth = Math.max(1, dpr * 0.8);

        const rings = [];
        for (let la = -60; la <= 60; la += 30) {
          const pts = [];
          for (let k = 0; k <= 72; k++) {
            pts.push(rotY(vec(la * deg, (k / 72) * Math.PI * 2), theta));
          }
          rings.push(pts);
        }
        for (let lo = 0; lo < 180; lo += 30) {
          const pts = [];
          for (let k = 0; k <= 48; k++) {
            pts.push(rotY(vec(-Math.PI / 2 + (k / 48) * Math.PI, lo * deg), theta));
          }
          rings.push(pts);
        }

        rings.forEach((pts) => {
          let previousFront = null;
          pts.forEach((v, i) => {
            const front = v[2] >= 0;
            const sx = cx + radius * v[0], sy = cy - radius * v[1];
            if (i === 0 || front !== previousFront) {
              if (i > 0) ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.strokeStyle = front ? hexRgba(accentA, 0.34) : hexRgba(accentA, 0.07);
            } else ctx.lineTo(sx, sy);
            previousFront = front;
          });
          ctx.stroke();
        });

        arcs.forEach((pair, index) => {
          const start = vec(nodes[pair[0]][0], nodes[pair[0]][1]);
          const end   = vec(nodes[pair[1]][0], nodes[pair[1]][1]);
          const dot   = Math.max(-1, Math.min(1, start[0]*end[0]+start[1]*end[1]+start[2]*end[2]));
          const omega = Math.acos(dot) || 0.0001;
          const sinOmega = Math.sin(omega);
          let started = false;

          ctx.beginPath();
          for (let step = 0; step <= 40; step++) {
            const amount = step / 40;
            const wA = Math.sin((1-amount)*omega)/sinOmega, wB = Math.sin(amount*omega)/sinOmega;
            let vector = [start[0]*wA+end[0]*wB, start[1]*wA+end[1]*wB, start[2]*wA+end[2]*wB];
            const lift = 1 + 0.16 * Math.sin(Math.PI * amount);
            vector = rotY([vector[0]*lift, vector[1]*lift, vector[2]*lift], theta);
            const sx = cx+radius*vector[0], sy = cy-radius*vector[1];
            if (vector[2] < -0.1) { started = false; }
            else if (!started) { ctx.moveTo(sx, sy); started = true; }
            else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = hexRgba(index%2 ? accentB : accentA, 0.5);
          ctx.lineWidth = Math.max(1, dpr * 1.1);
          ctx.stroke();

          const pulse = (time * 0.18 + index * 0.23) % 1;
          const wA = Math.sin((1-pulse)*omega)/sinOmega, wB = Math.sin(pulse*omega)/sinOmega;
          let pv = [start[0]*wA+end[0]*wB, start[1]*wA+end[1]*wB, start[2]*wA+end[2]*wB];
          const lift2 = 1 + 0.16 * Math.sin(Math.PI * pulse);
          pv = rotY([pv[0]*lift2, pv[1]*lift2, pv[2]*lift2], theta);
          if (pv[2] >= -0.1) {
            const sx = cx+radius*pv[0], sy = cy-radius*pv[1];
            ctx.beginPath();
            ctx.arc(sx, sy, dpr*2.4, 0, Math.PI*2);
            ctx.fillStyle = hexRgba(index%2 ? accentB : accentA, 0.95);
            ctx.fill();
          }
        });

        nodes.forEach((node) => {
          const vector = rotY(vec(node[0], node[1]), theta);
          if (vector[2] < 0) return;
          const sx = cx+radius*vector[0], sy = cy-radius*vector[1];
          ctx.beginPath(); ctx.arc(sx,sy,dpr*3.2,0,Math.PI*2);
          ctx.fillStyle = hexRgba(accentB,0.18); ctx.fill();
          ctx.beginPath(); ctx.arc(sx,sy,dpr*1.5,0,Math.PI*2);
          ctx.fillStyle = '#dfe6ff'; ctx.fill();
        });

        theta += 0.0018; time += 0.016;
        raf = requestAnimationFrame(draw);
      };

      resize();
      window.addEventListener('resize', resize);
      draw();
      return { stop: () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); } };
    };

    const globe = initGlobe();

    const tick = () => {
      const viewportHeight = window.innerHeight;
      const scrollY = window.scrollY || window.pageYOffset;

      if (pendingReveals.length) {
        const trigger = viewportHeight * 0.88;
        pendingReveals = pendingReveals.filter((element) => {
          if (element.getBoundingClientRect().top < trigger) {
            element.style.transitionDelay = `${element.getAttribute('data-reveal-delay') || 0}ms`;
            element.style.opacity = '1';
            element.style.transform = 'none';
            return false;
          }
          return true;
        });
      }

      if (nav) {
        if (scrollY > 30) {
          nav.style.background = 'rgba(6,7,14,.72)';
          nav.style.backdropFilter = 'blur(14px)';
          nav.style.borderBottomColor = 'rgba(255,255,255,.07)';
        } else {
          nav.style.background = 'transparent';
          nav.style.backdropFilter = 'none';
          nav.style.borderBottomColor = 'transparent';
        }
      }

      if (!reduce) {
        parallaxEls.forEach((element) => {
          const speed = parseFloat(element.getAttribute('data-parallax'));
          const base = element.style.transform.includes('translateX(-50%)') ? 'translateX(-50%) ' : '';
          element.style.transform = `${base}translate3d(0,${-scrollY * speed}px,0)`;
        });
      }

      scenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        const total = rect.height - viewportHeight;
        const progress = clamp(total > 0 ? -rect.top / total : 0, 0, 1);
        sceneHandlers[scene.getAttribute('data-scene')]?.(progress);
      });
    };

    const safeTick = () => {
      try { tick(); }
      catch (error) {
        if (!warned) { console.warn('Beacon Atlas animation tick failed', error); warned = true; }
      }
    };

    const showStaticState = () => {
      root.querySelectorAll('[data-reveal]').forEach((el) => { el.style.opacity='1'; el.style.transform='none'; });
      cache.tcards.forEach((card) => { card.style.opacity='1'; card.style.transform='none'; });
      cache.words.forEach((word) => { word.style.opacity='1'; });
      if (cache.globalText)  { cache.globalText.style.opacity='1';  cache.globalText.style.transform='none'; }
      if (cache.globalStats) { cache.globalStats.style.opacity='1'; cache.globalStats.style.transform='none'; }
    };

    if (reduce) {
      showStaticState();
      safeTick();
      return () => { globe?.stop(); hoverCleanups.forEach((c) => c()); };
    }

    const onScrollOrResize = () => safeTick();
    const settleTimers = [60, 200, 500, 1000].map((delay) => window.setTimeout(safeTick, delay));
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    safeTick();

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      globe?.stop();
      hoverCleanups.forEach((c) => c());
    };
  }, [hostRef]);
}

// ─── Analyzing state ────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Guardian running', sub: 'Scanning for PII and replacing with tokens' },
  { label: 'Sending tokenized text', sub: 'Your real values stay on this device' },
  { label: 'Simplifier agent', sub: 'Extracting actions and deadlines' },
  { label: 'Re-hydrating on device', sub: 'Swapping tokens back to your real values' },
];

function AnalyzingState({ step = 0 }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#06070e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        fontFamily: "'Hanken Grotesk', 'D-DIN Bold', system-ui, sans-serif",
        color: '#eef1f7',
        padding: 24,
      }}
    >
      {/* Animated ring */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid rgba(91,140,255,.15)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#5b8cff',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>
          Analyzing your document
        </p>
        <p style={{ margin: 0, fontSize: 14, color: '#5a637c' }}>
          {STEPS[Math.min(step, STEPS.length - 1)].sub}
        </p>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
        {STEPS.map((s, i) => (
          <div
            key={s.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              opacity: i <= step ? 1 : 0.25,
              transition: 'opacity .4s',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `2px solid ${i < step ? '#4ade80' : i === step ? '#5b8cff' : 'rgba(255,255,255,.15)'}`,
                background: i < step ? 'rgba(74,222,128,.15)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {i < step && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 3L9 1" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontSize: 14, color: i <= step ? '#eef1f7' : '#3a4255' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root component ─────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('landing');      // 'landing' | 'upload' | 'analyzing' | 'results'
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [result, setResult] = useState(null);        // { analysis, mappingTable, guardianStats }
  const [apiError, setApiError] = useState('');

  const hostRef = useRef(null);
  const template = useMemo(buildBeaconTemplate, []);
  useBeaconAnimations(hostRef);

  // Wire landing page "Try" buttons to product entry
  useEffect(() => {
    if (view !== 'landing') return;
    const host = hostRef.current;
    if (!host) return;

    const timer = window.setTimeout(() => {
      const tryButtons = [...host.querySelectorAll('button')].filter((b) =>
        b.textContent.includes('Try')
      );
      const handler = () => setView('upload');
      tryButtons.forEach((b) => b.addEventListener('click', handler));
      return () => tryButtons.forEach((b) => b.removeEventListener('click', handler));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [view]);

  const handleText = useCallback(async (rawText) => {
    setView('analyzing');
    setAnalyzeStep(0);
    setApiError('');
    setResult(null);

    try {
      // Step 0 — Guardian (client-side, synchronous)
      const { tokenized, mappingTable, stats } = runGuardian(rawText);
      setAnalyzeStep(1);

      // Small delay so the UI step is readable
      await new Promise((r) => setTimeout(r, 400));
      setAnalyzeStep(2);

      // Step 2 — Simplifier (API call with TOKENIZED text)
      const analysis = await runSimplifier(tokenized);
      setAnalyzeStep(3);

      await new Promise((r) => setTimeout(r, 300));

      // Step 3 — Re-hydration happens in CrisisActionRoom via rehydrateDeep
      setResult({ analysis, mappingTable, guardianStats: stats });
      setView('results');
    } catch (err) {
      setApiError(err.message ?? 'Something went wrong. Please try again.');
      setView('upload');
    }
  }, []);

  const handleReset = useCallback(() => {
    setView('upload');
    setResult(null);
    setApiError('');
  }, []);

  const handleBack = useCallback(() => {
    setView('landing');
    setResult(null);
    setApiError('');
    // Scroll landing page to top when returning
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <>
      {/* ── Landing page (always mounted, hidden when not active) ── */}
      <main
        className="beacon-app min-h-screen bg-[#06070e] text-[#eef1f7] font-ddin"
        style={{ display: view === 'landing' ? 'block' : 'none' }}
        aria-hidden={view !== 'landing'}
      >
        <style>{template.style}</style>
        <div ref={hostRef} dangerouslySetInnerHTML={{ __html: template.markup }} />
      </main>

      {/* ── Product overlay ── */}
      {view === 'upload' && (
        <UploadZone
          onText={handleText}
          onBack={handleBack}
          initialError={apiError}
        />
      )}

      {view === 'analyzing' && <AnalyzingState step={analyzeStep} />}

      {view === 'results' && result && (
        <CrisisActionRoom
          analysis={result.analysis}
          mappingTable={result.mappingTable}
          guardianStats={result.guardianStats}
          onReset={handleReset}
        />
      )}
    </>
  );
}
