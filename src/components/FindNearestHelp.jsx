import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SUPPORT_URL = import.meta.env.DEV
  ? 'http://localhost:3001/api/find-support'
  : (import.meta.env.VITE_SUPPORT_URL || '/api/find-support');

export default function FindNearestHelp({ report, mappingTable }) {
  const [location, setLocation] = useState(() => guessLocation(report, mappingTable));
  const [manualLocation, setManualLocation] = useState('');
  const [results, setResults] = useState([]);
  const [origin, setOrigin] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [mapFailed, setMapFailed] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const mapEl = useRef(null);
  const mapRef = useRef(null);

  async function findHelp(nextLocation = location) {
    const resolvedLocation = (nextLocation || manualLocation).trim();
    if (!resolvedLocation) {
      setStatus('Enter your city or address first.');
      return;
    }

    setLocation(resolvedLocation);
    setHasSearched(true);
    setStatus('Finding nearby help...');
    setResults([]);
    setOrigin(null);
    setMapFailed(false);
    setIsSearching(true);
    setShowAll(false);

    try {
      const response = await fetch(SUPPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineType: report?.pipeline_type || 'common', location: resolvedLocation }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Support search failed (${response.status})`);

      setQuery(body.query || '');
      setOrigin(body.origin || null);
      setResults(body.results || []);
      setExpandedId(body.results?.[0] ? getPlaceId(body.results[0]) : '');
      setManualLocation('');
      setEditingLocation(false);
      setStatus((body.results || []).length ? '' : 'No nearby support results found. Try a broader city name.');
    } catch (err) {
      setMapFailed(true);
      setStatus(err.message || 'Could not find nearby help right now.');
    } finally {
      setIsSearching(false);
    }
  }

  useEffect(() => {
    if (!results.length || !mapEl.current || mapFailed) return undefined;

    try {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const center = origin || { lat: results[0].lat, lng: results[0].lng };
      const map = L.map(mapEl.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 12);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      if (origin) {
        L.circleMarker([origin.lat, origin.lng], {
          radius: 7,
          color: '#c4d0ff',
          fillColor: '#5b8cff',
          fillOpacity: 0.9,
        }).addTo(map).bindPopup('Search location');
      }

      const bounds = [];
      results.forEach((place) => {
        const marker = L.marker([place.lat, place.lng], { icon: supportIcon() }).addTo(map);
        marker.on('click', () => setExpandedId(getPlaceId(place)));
        marker.bindPopup(`
          <strong>${escapeHtml(place.name)}</strong><br/>
          ${escapeHtml(place.address || 'Address unavailable')}<br/>
          ${place.phone ? `${escapeHtml(place.phone)}<br/>` : ''}
          ${formatDistance(place.distanceMeters)}
        `);
        bounds.push([place.lat, place.lng]);
      });

      if (origin) bounds.push([origin.lat, origin.lng]);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28] });
      setTimeout(() => map.invalidateSize(), 0);

      return () => {
        map.remove();
        mapRef.current = null;
      };
    } catch (err) {
      console.warn('[support-map] Leaflet failed:', err);
      setMapFailed(true);
      return undefined;
    }
  }, [results, origin, mapFailed]);

  function resetSearch() {
    setEditingLocation(true);
    setManualLocation('');
    setResults([]);
    setOrigin(null);
    setQuery('');
    setStatus('');
    setMapFailed(false);
    setExpandedId('');
    setShowAll(false);
  }

  const needsManualLocation = !location || editingLocation;
  const visibleResults = showAll ? results : results.slice(0, 4);
  const canSearch = Boolean((needsManualLocation ? manualLocation : location).trim());

  return (
    <section className="report-section" style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 18,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <span className="report-label" style={{ marginBottom: 10 }}>Find Nearest Help</span>
          <p className="report-meta" style={{ margin: 0, maxWidth: 620, lineHeight: 1.6 }}>
            {location && !editingLocation
              ? `Searching near ${location}.`
              : 'Enter a city or address and Clearline will look for nearby support matched to this report.'}
          </p>
        </div>
        {results.length > 0 && (
          <span
            className="report-mono"
            style={{
              border: '1px solid rgba(91,140,255,.26)',
              borderRadius: 999,
              color: '#c4d0ff',
              fontSize: 11,
              letterSpacing: '.08em',
              padding: '7px 11px',
              whiteSpace: 'nowrap',
            }}
          >
            {results.length} nearby
          </span>
        )}
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,.085)',
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.018))',
          padding: 16,
          boxShadow: '0 22px 70px rgba(0,0,0,.18)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: 12,
            alignItems: 'center',
          }}
        >
          {needsManualLocation ? (
            <input
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') findHelp(manualLocation); }}
              placeholder="City or address"
              style={{
                minWidth: 0,
                minHeight: 42,
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 6,
                background: 'rgba(0,0,0,.2)',
                color: '#eef1f7',
                padding: '0 13px',
                font: '14px/1.4 "Hanken Grotesk", system-ui, sans-serif',
              }}
            />
          ) : (
            <p className="report-meta" style={{ margin: 0 }}>
              Location source: report text
            </p>
          )}

          <button
            className="report-nav-btn accent"
            type="button"
            onClick={() => (results.length && !editingLocation ? resetSearch() : findHelp(needsManualLocation ? manualLocation : location))}
            disabled={isSearching || (!results.length && !canSearch)}
            style={{
              minWidth: 178,
              minHeight: 42,
              width: '100%',
              maxWidth: 260,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
              justifySelf: 'end',
            }}
          >
            {isSearching ? 'Finding...' : results.length && !editingLocation ? 'Search Another Address' : 'Find Nearest Help'}
          </button>
        </div>

        {(query || status) && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginTop: 14,
            }}
          >
            {query && (
              <span className="report-meta" style={{ margin: 0 }}>
                Search: {query}
              </span>
            )}
            {status && (
              <span className="report-meta" style={{ margin: 0, color: mapFailed ? '#fca5a5' : '#c4d0ff' }}>
                {status}
              </span>
            )}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: mapFailed ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: 16,
            marginTop: 18,
            alignItems: 'stretch',
          }}
        >
          {!mapFailed && (
            <div
              ref={mapEl}
              style={{
                minHeight: 390,
                height: 390,
                border: '1px solid rgba(255,255,255,.09)',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#080a14',
                boxShadow: 'inset 0 0 0 1px rgba(91,140,255,.06)',
              }}
            />
          )}

          <div
            style={{
              border: '1px solid rgba(255,255,255,.085)',
              borderRadius: 8,
              background: 'rgba(0,0,0,.16)',
              overflow: 'hidden',
              minHeight: 390,
              maxHeight: 390,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 15px',
                borderBottom: '1px solid rgba(255,255,255,.07)',
              }}
            >
              <span className="report-label" style={{ margin: 0, fontSize: 11 }}>Nearby options</span>
              {results.length > 4 && (
                <button
                  type="button"
                  className="switch-link"
                  onClick={() => setShowAll((value) => !value)}
                  style={{ fontSize: 12 }}
                >
                  {showAll ? 'Show top 4' : `Show all ${results.length}`}
                </button>
              )}
            </div>

            <div style={{ overflow: 'auto' }}>
              {visibleResults.map((place, index) => {
                const id = getPlaceId(place);
                const expanded = expandedId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setExpandedId(expanded ? '' : id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      borderBottom: '1px solid rgba(255,255,255,.065)',
                      background: expanded ? 'rgba(91,140,255,.11)' : 'transparent',
                      color: 'inherit',
                      padding: '15px',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      className="report-mono"
                      style={{
                        display: 'inline-flex',
                        color: '#5b8cff',
                        fontSize: 10,
                        letterSpacing: '.12em',
                        marginBottom: 8,
                      }}
                    >
                      {String(index + 1).padStart(2, '0')} / {formatDistance(place.distanceMeters)}
                    </span>
                    <span className="report-name" style={{ display: 'block', lineHeight: 1.25 }}>
                      {place.name}
                    </span>
                    <span className="report-meta" style={{ display: 'block', marginTop: 5, lineHeight: 1.45 }}>
                      {place.address || 'Address unavailable'}
                    </span>
                    {expanded && (
                      <span style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                        {place.phone && <span className="report-contact">{place.phone}</span>}
                        <span className="report-meta" style={{ lineHeight: 1.5 }}>
                          Call first to confirm eligibility, hours, and whether appointments are required.
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {hasSearched && !results.length && !isSearching && !status && (
        <p className="report-meta" style={{ marginTop: 14 }}>
          No nearby support results found. Try a broader city name.
        </p>
      )}
    </section>
  );
}

function supportIcon() {
  return L.divIcon({
    className: '',
    html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:#5b8cff;border:2px solid #eef1f7;box-shadow:0 0 18px rgba(91,140,255,.9)"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function guessLocation(report, mappingTable) {
  const values = mappingTable instanceof Map ? [...mappingTable.values()] : [];
  const text = `${values.join('\n')}\n${JSON.stringify(report || {})}`;
  const patterns = [
    /\b\d{1,6}\s+[A-Za-z0-9 .'-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b(?:,\s*[A-Za-z .'-]+)?(?:,\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?/i,
    /\b[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/,
    /\b\d{5}(?:-\d{4})?\b/,
    /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim();
  }
  return '';
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'Distance unavailable';
  const miles = meters / 1609.344;
  if (miles < 0.1) return 'Less than 0.1 mi away';
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi away`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getPlaceId(place) {
  return String(place.id || `${place.name}-${place.address || ''}`);
}
