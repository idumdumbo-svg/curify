import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const HISTORY_KEY = 'curify_history';

function formatPrice(amount, currencyCode) {
  if (amount == null || isNaN(amount)) return null;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const symbolMatch = formatted.match(/^([^0-9,\s]+)/);
  const rawSymbol = symbolMatch ? symbolMatch[1] : '';
  const symbol = rawSymbol.replace(/^[A-Za-z]+/, ''); // strip prefix letters (A$, CA$, etc.)
  const number = formatted.replace(rawSymbol, '').trim();
  return { symbol, number, code: currencyCode };
}

function PriceDisplay({ amount, currencyCode }) {
  const parts = formatPrice(amount, currencyCode);
  if (!parts) return <span>—</span>;
  return (
    <span className="price-display">
      <span className="price-symbol">{parts.symbol}</span>
      <span className="price-number">{parts.number}</span>
      <span className="price-code">{parts.code}</span>
    </span>
  );
}

function ResultView({ result, currency }) {
  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="card-label">Manufacturing Cost</div>
          <div className="card-value">
            <PriceDisplay amount={result.manufacturingCost} currencyCode={result.currency || currency} />
          </div>
        </div>
        <div className="card">
          <div className="card-label">Wholesale Price</div>
          <div className="card-value">
            <PriceDisplay amount={result.wholesalePrice} currencyCode={result.currency || currency} />
          </div>
        </div>
        <div className="card">
          <div className="card-label">Retail Price</div>
          <div className="card-value">
            <PriceDisplay amount={result.retailPrice} currencyCode={result.currency || currency} />
          </div>
        </div>
        <div className="card">
          <div className="card-label">Confidence</div>
          <div className="card-value">{result.confidence}</div>
        </div>
      </div>

      {result.profitMarginComparison && (() => {
        const { industry, productMargin, industryAvgMargin, rating } = result.profitMarginComparison;
        const ratingColor = rating === 'high' ? '#ef4444' : rating === 'medium' ? '#f59e0b' : '#22c55e';
        const ratingLabel = rating === 'high' ? 'High' : rating === 'medium' ? 'Medium' : 'Low';
        return (
          <div className="card margin-card">
            <div className="card-label">Profit Margin vs. Industry</div>
            <div className="margin-industry">{industry}</div>
            <div className="margin-rows">
              <div className="margin-row">
                <span className="margin-row-label">This product</span>
                <span className="margin-row-value">{productMargin}%</span>
              </div>
              <div className="margin-row">
                <span className="margin-row-label">Industry avg.</span>
                <span className="margin-row-value">{industryAvgMargin}%</span>
              </div>
            </div>
            <div className="margin-badge" style={{ backgroundColor: ratingColor }}>
              {ratingLabel}
            </div>
          </div>
        );
      })()}

      <div className="history-card">
        <div className="card-label">History</div>
        <p>{result.history}</p>
      </div>

      <p className="disclaimer">{result.disclaimer}</p>
    </>
  );
}

function App() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [productText, setProductText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);
  const [country, setCountry] = useState('United States');
  const [savedHistory, setSavedHistory] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [tab, setTab] = useState('photo'); // 'photo' | 'search'
  const [locationDetected, setLocationDetected] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [logoFill, setLogoFill] = useState(100); // 100=empty, 0=full
  const fillInterval = useRef(null);

  const COUNTRY_CODE_MAP = {
    US: 'United States', GB: 'United Kingdom', CA: 'Canada',
    AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan',
    CN: 'China', IN: 'India', BR: 'Brazil', MX: 'Mexico',
    KR: 'South Korea', IT: 'Italy', ES: 'Spain', NL: 'Netherlands',
  };

  useEffect(() => {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) setSavedHistory(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!flagOpen) return;
    const close = (e) => { if (!e.target.closest('.flag-picker')) setFlagOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [flagOpen]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const res = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`
        );
        const data = await res.json();
        const mapped = COUNTRY_CODE_MAP[data.countryCode];
        if (mapped) {
          setCountry(mapped);
          setLocationDetected(true);
        }
      } catch (_) {}
    }, () => {}); // silently ignore denied permission
  }, []);

  useEffect(() => {
    clearInterval(fillInterval.current);
    if (loading) {
      // Reset and slowly creep toward ~8% remaining (never finishing on its own)
      let current = 100;
      setLogoFill(100);
      fillInterval.current = setInterval(() => {
        const remaining = current - 8;
        const step = Math.max(remaining * 0.04, 0.2);
        current = Math.max(current - step, 8);
        setLogoFill(current);
        if (current <= 8) clearInterval(fillInterval.current);
      }, 50);
    } else {
      // Data arrived — snap to full, then reset
      setLogoFill(0);
      const reset = setTimeout(() => setLogoFill(100), 500);
      return () => clearTimeout(reset);
    }
    return () => clearInterval(fillInterval.current);
  }, [loading]);

  const saveToHistory = (data, previewUrl) => {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      previewUrl,
      result: data,
      currency: data.currency || currency,
    };
    const updated = [entry, ...savedHistory].slice(0, 50);
    setSavedHistory(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  };

  const deleteFromHistory = (id, e) => {
    e.stopPropagation();
    const updated = savedHistory.filter(h => h.id !== id);
    setSavedHistory(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    if (expandedId === id) setExpandedId(null);
  };

  const clearHistory = () => {
    setSavedHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    setExpandedId(null);
  };

  const COUNTRY_CURRENCY = {
    'United States': 'USD',
    'United Kingdom': 'GBP',
    'Canada': 'CAD',
    'Australia': 'AUD',
    'Germany': 'EUR',
    'France': 'EUR',
    'Japan': 'JPY',
    'China': 'CNY',
    'India': 'INR',
    'Brazil': 'BRL',
    'Mexico': 'MXN',
    'South Korea': 'KRW',
    'Italy': 'EUR',
    'Spain': 'EUR',
    'Netherlands': 'EUR',
  };

  const currency = COUNTRY_CURRENCY[country] || 'USD';
  const COUNTRY_OPTIONS = Object.keys(COUNTRY_CURRENCY);

  const COUNTRY_FLAG = {
    'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Canada': '🇨🇦',
    'Australia': '🇦🇺', 'Germany': '🇩🇪', 'France': '🇫🇷', 'Japan': '🇯🇵',
    'China': '🇨🇳', 'India': '🇮🇳', 'Brazil': '🇧🇷', 'Mexico': '🇲🇽',
    'South Korea': '🇰🇷', 'Italy': '🇮🇹', 'Spain': '🇪🇸', 'Netherlands': '🇳🇱',
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setAnalyzed(false);
    setProductText('');
  };

  const switchTab = (t) => {
    setTab(t);
    resetPhoto();
    setProductText('');
    setResult(null);
    setError(null);
    setAnalyzed(false);
  };

  const resetPhoto = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setAnalyzed(false);
    // reset the file input so the same photo can be re-selected
    const input = document.getElementById('imageInput');
    if (input) input.value = '';
  };

  const handleTextChange = (e) => {
    setProductText(e.target.value);
    // typing anything resets the photo
    if (preview || image) resetPhoto();
    if (!e.target.value.trim()) return;
    setAnalyzed(false);
    setResult(null);
    setError(null);
  };

  const canAnalyze = (preview || productText.trim()) && !loading && !analyzed;

  const handleSubmit = async () => {
    if (!canAnalyze) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    if (image) formData.append('image', image);
    formData.append('productText', productText);
    formData.append('currency', currency);
    formData.append('country', country);

    try {
      const response = await fetch('/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setAnalyzed(true);
      saveToHistory(data, preview);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="app">
      {/* ── Hero search section ── */}
      <div className="hero">
        <p className="subtitle">Curious? Let me handle that!</p>

        {/* Tab row + flag picker */}
        <div className="input-tabs-row">
          <div className="input-tabs">
            <button
              className={`input-tab${tab === 'photo' ? ' input-tab--active' : ''}`}
              onClick={() => switchTab('photo')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.5 4L16.5 6H20C20.55 6 21 6.45 21 7V19C21 19.55 20.55 20 20 20H4C3.45 20 3 19.55 3 19V7C3 6.45 3.45 6 4 6H7.5L9.5 4H14.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
            </button>
            <button
              className={`input-tab${tab === 'search' ? ' input-tab--active' : ''}`}
              onClick={() => switchTab('search')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="flag-picker">
            <button
              className={`flag-btn${locationDetected ? ' flag-btn--detected' : ''}`}
              onClick={() => setFlagOpen(o => !o)}
              title={`${country} (${currency})`}
            >
              {COUNTRY_FLAG[country]}
            </button>
            {flagOpen && (
              <div className="flag-dropdown">
                {COUNTRY_OPTIONS.map(c => (
                  <button
                    key={c}
                    className={`flag-option${c === country ? ' flag-option--active' : ''}`}
                    onClick={() => { setCountry(c); setFlagOpen(false); setLocationDetected(false); }}
                  >
                    <span>{COUNTRY_FLAG[c]}</span>
                    <span className="flag-option-name">{c}</span>
                    <span className="flag-option-code">{COUNTRY_CURRENCY[c]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        {tab === 'photo' ? (
          <div className="upload-section">
            <label
              className="upload-label"
              htmlFor="imageInput"
              style={{ borderColor: canAnalyze ? '#0ea5e9' : 'rgba(14,165,233,0.35)', transition: 'border-color 0.2s' }}
            >
              {preview ? (
                <img src={preview} alt="Preview" className="preview-image" />
              ) : (
                <div className="upload-placeholder">
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.5 4L16.5 6H20C20.55 6 21 6.45 21 7V19C21 19.55 20.55 20 20 20H4C3.45 20 3 19.55 3 19V7C3 6.45 3.45 6 4 6H7.5L9.5 4H14.5Z" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="13" r="3.5" stroke="#0ea5e9" strokeWidth="1.5"/>
                  </svg>
                  <span>Tap to upload or take a photo</span>
                </div>
              )}
            </label>
            <input
              id="imageInput"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
            {preview && (
              <button className="photo-reset-btn" onClick={resetPhoto} aria-label="Remove photo">✕</button>
            )}
          </div>
        ) : (
          <div className="search-box" style={{ borderColor: canAnalyze ? '#0ea5e9' : 'rgba(14,165,233,0.35)', transition: 'border-color 0.2s' }}>
            <svg className="search-box-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="7" stroke="#0ea5e9" strokeWidth="1.5"/>
              <path d="M16.5 16.5L21 21" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              className="search-box-input"
              type="text"
              placeholder="Type a product name…"
              value={productText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {productText && (
              <button className="text-clear-btn" onClick={() => { setProductText(''); setAnalyzed(false); setResult(null); }}>✕</button>
            )}
          </div>
        )}


        {/* Logo as submit button */}
        <div
          className={`title-wrap${canAnalyze ? ' title-wrap--active' : ''}`}
          onClick={canAnalyze ? handleSubmit : undefined}
          role={canAnalyze ? 'button' : undefined}
          aria-label="Curify It"
        >
          {/* Background fill — rises from bottom */}
          <div
            className="title-fill-bg"
            style={{ transform: `translateY(${logoFill}%)` }}
          />
          <h1 className="title title-base">CURIFY</h1>
          <h1
            className="title title-fill"
            style={{ clipPath: `inset(${logoFill}% 0 0 0)` }}
          >CURIFY</h1>
        </div>

        {error && <p className="error">{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="results">
          <h2 className="product-name">{result.productName}</h2>
          <ResultView result={result} currency={currency} />
        </div>
      )}

      {/* ── Saved history ── */}
      {savedHistory.length > 0 && (
        <div className="inventory-section">
          <div className="inventory-header">
            <span className="inventory-title">Previously Curified</span>
            <button className="clear-btn" onClick={clearHistory}>Clear all</button>
          </div>

          {savedHistory.map(entry => (
            <div key={entry.id} className="inventory-item" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
              <div className="inventory-item-row">
                {entry.previewUrl && (
                  <img src={entry.previewUrl} alt={entry.result.productName} className="inventory-thumb" />
                )}
                {!entry.previewUrl && (
                  <div className="inventory-thumb-placeholder">🔍</div>
                )}
                <div className="inventory-info">
                  <div className="inventory-name">{entry.result.productName}</div>
                  <div className="inventory-meta">
                    <span className="inventory-price">
                      {(() => {
                        const p = formatPrice(entry.result.retailPrice, entry.currency);
                        return p ? `${p.symbol}${p.number} ${p.code}` : '—';
                      })()}
                    </span>
                    <span className="inventory-date">{formatDate(entry.timestamp)}</span>
                  </div>
                </div>
                <div className="inventory-actions">
                  <span className="inventory-chevron">{expandedId === entry.id ? '▲' : '▼'}</span>
                  <button className="delete-btn" onClick={(e) => deleteFromHistory(entry.id, e)}>✕</button>
                </div>
              </div>

              {expandedId === entry.id && (
                <div className="inventory-expanded">
                  <ResultView result={entry.result} currency={entry.currency} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
