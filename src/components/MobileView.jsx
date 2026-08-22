import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Shield, User, Smartphone, RefreshCw, CheckCircle, Flame, Leaf, Candy, HelpCircle } from 'lucide-react';
// MENU_ITEMS is now loaded dynamically from the backend API /api/menu

const ALLERGEN_OPTIONS = [
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'gluten', label: 'Gluten' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'soy', label: 'Soy' }
];

const PREFERENCE_OPTIONS = [
  { id: 'spicy', label: 'Spicy', icon: <Flame size={14} style={{ marginRight: '4px' }} /> },
  { id: 'vegan', label: 'Vegan', icon: <Leaf size={14} style={{ marginRight: '4px' }} /> },
  { id: 'sweet', label: 'Sweet', icon: <Candy size={14} style={{ marginRight: '4px' }} /> }
];

function MobileView({ kioskId, onResetSession }) {
  // --- Load localStorage values ---
  const [allergens, setAllergens] = useState(() => {
    const saved = localStorage.getItem('synapse_allergens');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('synapse_preferences');
    return saved ? JSON.parse(saved) : [];
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('synapse_order_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedItemId, setSelectedItemId] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(() => {
    return localStorage.getItem('synapse_onboarded') === 'true';
  });
  const [lastOrder, setLastOrder] = useState(() => {
    const saved = localStorage.getItem('synapse_last_order');
    return saved ? JSON.parse(saved) : null;
  });
  const socketRef = useRef(null);

  const [menuItems, setMenuItems] = useState([]);
  const [captiveParams, setCaptiveParams] = useState(null);

  // Load menu items dynamically from API
  useEffect(() => {
    fetch('/api/menu')
      .then(res => res.json())
      .then(data => setMenuItems(data))
      .catch(err => console.error("Error loading menu:", err));
  }, []);

  // Check for OpenNDS captive portal parameters in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('tok');
    const gatewayaddress = params.get('gatewayaddress');
    const clientmac = params.get('clientmac');
    const redir = params.get('redir');

    if (tok && gatewayaddress) {
      setCaptiveParams({ tok, gatewayaddress, clientmac, redir });
    }
  }, []);


  // Sync state to localStorage on changes
  useEffect(() => {
    localStorage.setItem('synapse_allergens', JSON.stringify(allergens));
  }, [allergens]);

  useEffect(() => {
    localStorage.setItem('synapse_preferences', JSON.stringify(preferences));
  }, [preferences]);

  // Setup WebSocket connection if kioskId is present and user is onboarded
  useEffect(() => {
    if (!kioskId || !isOnboarded) return;

    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      console.log("[Mobile] Connected to server, sending handshake for kiosk:", kioskId);
      socket.emit('join-session', { kioskId, role: 'mobile' });
      // Push initial preferences instantly
      socket.emit('project-preferences', { kioskId, allergens, preferences });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [kioskId]);

  // Instantly push preferences to the socket room whenever preferences or allergens change
  useEffect(() => {
    if (socketRef.current && socketConnected && kioskId) {
      socketRef.current.emit('project-preferences', {
        kioskId,
        allergens,
        preferences
      });
    }
  }, [allergens, preferences, socketConnected, kioskId]);

  // Toggle handlers
  const handleAllergenToggle = (id) => {
    setAllergens(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handlePreferenceToggle = (id) => {
    setPreferences(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Factory reset: clear all local storage
  const handleClearAllData = () => {
    localStorage.clear();
    setAllergens([]);
    setPreferences([]);
    setHistory([]);
    setSelectedItemId(null);
    setIsOnboarded(false);
    setLastOrder(null);
    alert("Profile and order history reset to factory defaults.");
  };

  // Place order flow
  const handlePlaceOrder = () => {
    if (!selectedItemId) {
      alert("Please select a food item to order.");
      return;
    }

    const orderedItem = menuItems.find(item => item.id === selectedItemId);
    if (!orderedItem) return;

    // 1. Update local user history with ordered food item tags to fine-tune preferences
    const newHistory = [...history, ...orderedItem.tags];
    localStorage.setItem('synapse_order_history', JSON.stringify(newHistory));
    setHistory(newHistory);

    // 2. Update active preferences based on ordered item tags (e.g. if they order spicy, add spicy to profile)
    const newPreferences = [...preferences];
    let prefUpdated = false;
    orderedItem.tags.forEach(tag => {
      if (['spicy', 'vegan', 'sweet'].includes(tag) && !newPreferences.includes(tag)) {
        newPreferences.push(tag);
        prefUpdated = true;
      }
    });
    if (prefUpdated) {
      localStorage.setItem('synapse_preferences', JSON.stringify(newPreferences));
      setPreferences(newPreferences);
    }

    // 3. Store this item as the last ordered item for quick repeat ordering
    localStorage.setItem('synapse_last_order', JSON.stringify(orderedItem));
    setLastOrder(orderedItem);

    // 4. Emit success command to close Kiosk session via WebSocket
    if (socketRef.current && socketConnected) {
      socketRef.current.emit('place-order', {
        kioskId,
        item: orderedItem
      });
    }

    // 5. Clear session memory locally on phone (redirects to clear kioskId)
    setSelectedItemId(null);
    onResetSession();
  };

  // Safe foods filtering (Mobile list)
  const safeItems = menuItems.filter(item => {
    return !item.allergens.some(a => allergens.includes(a));
  });

  // Simple taste profiling analytics
  const tagCounts = history.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});

  const recommendedFromHistory = Object.entries(tagCounts)
    .filter(([_, count]) => count >= 2)
    .map(([tag]) => tag);

  return (
    <div className="mobile-wrapper fade-in">
      {/* App Header */}
      <header style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--accent-teal)', marginBottom: '8px' }}>
          <Shield size={20} />
          <span style={{ fontWeight: '800', letterSpacing: '0.05em', fontSize: '14px' }}>SYNAPSE ID</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: '700' }}>Local Dietary Vault</h2>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🔒 ALL DATA ENCRYPTED IN LOCALSTORAGE ONLY</p>
      </header>

      {/* VIEW 2: ACTIVE KIOSK SCAN VIEW */}
      {kioskId && isOnboarded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          <div className="glass-card" style={{ padding: '16px', background: 'rgba(45, 106, 79, 0.04)', borderColor: 'rgba(45, 106, 79, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--accent-green)', fontWeight: '700', letterSpacing: '0.05em' }}>
                  Broadcasting Securely
                </span>
                <h4 style={{ fontSize: '15px', fontWeight: '600' }}>Kiosk Session #{kioskId}</h4>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={`pulse-indicator ${socketConnected ? 'active' : 'disconnected'}`}></span>
                <span style={{ fontSize: '11px', color: socketConnected ? 'var(--text-secondary)' : 'var(--accent-danger)' }}>
                  {socketConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Edit settings in connected view */}
          <div>
            <h5 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '700' }}>
              Active Profile Filters (Syncs Live)
            </h5>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {ALLERGEN_OPTIONS.map(opt => {
                const checked = allergens.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleAllergenToggle(opt.id)}
                    style={{
                      fontSize: '11px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: checked ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface-elevated)',
                      color: checked ? '#fca5a5' : 'var(--text-secondary)',
                      border: `1px solid ${checked ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-glass)'}`,
                      fontWeight: '600'
                    }}
                  >
                    Excl. {opt.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PREFERENCE_OPTIONS.map(opt => {
                const checked = preferences.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => handlePreferenceToggle(opt.id)}
                    style={{
                      fontSize: '11px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: checked ? 'rgba(45, 106, 79, 0.12)' : 'var(--bg-surface-elevated)',
                      color: checked ? 'var(--accent-green)' : 'var(--text-secondary)',
                      border: `1px solid ${checked ? 'rgba(45, 106, 79, 0.25)' : 'var(--border-glass)'}`,
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ordering Panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h5 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '700' }}>
              Select Food to Order
            </h5>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '260px', paddingRight: '4px', marginBottom: '16px' }}>
              {lastOrder && !lastOrder.allergens.some(a => allergens.includes(a)) && (
                <div
                  onClick={() => setSelectedItemId(lastOrder.id)}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    background: selectedItemId === lastOrder.id ? 'rgba(45, 106, 79, 0.08)' : 'rgba(245, 166, 35, 0.04)',
                    border: `1px solid ${selectedItemId === lastOrder.id ? 'var(--accent-green)' : 'rgba(245, 166, 35, 0.25)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px'
                  }}
                >
                  <div style={{ paddingRight: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '9px', background: 'rgba(245, 166, 35, 0.15)', color: '#B45309', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', letterSpacing: '0.05em' }}>
                        🔄 RE-ORDER LAST
                      </span>
                      <h6 style={{ fontSize: '14px', fontWeight: '700' }}>{lastOrder.name}</h6>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{lastOrder.description}</p>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: '800', fontSize: '14px', minWidth: '60px' }}>
                    ₱{lastOrder.price.toFixed(2)}
                  </div>
                </div>
              )}

              {safeItems.map(item => {
                const isSelected = selectedItemId === item.id;
                const isMatch = preferences.some(p => item.tags.includes(p));
                
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '12px',
                      background: isSelected ? 'rgba(217, 56, 58, 0.06)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--accent-red)' : 'var(--border-glass)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ paddingRight: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h6 style={{ fontSize: '14px', fontWeight: '700' }}>{item.name}</h6>
                        {isMatch && <span style={{ fontSize: '9px', background: 'var(--accent-gradient)', color: '#04060b', padding: '1px 4px', borderRadius: '4px', fontWeight: '700' }}>MATCH</span>}
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.description}</p>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: '800', fontSize: '14px' }}>
                      ₱{item.price.toFixed(2)}
                    </div>
                  </div>
                );
              })}

              {safeItems.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No meals match your active allergen safety filters.
                </div>
              )}
            </div>

            {/* Place Order Footer */}
            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
              <button
                onClick={handlePlaceOrder}
                className="btn-primary"
                disabled={!selectedItemId}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '14px',
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: selectedItemId ? 1 : 0.4,
                  cursor: selectedItemId ? 'pointer' : 'not-allowed'
                }}
              >
                Place Order
              </button>
              
              <button 
                onClick={onResetSession}
                className="btn-secondary"
                style={{ width: '100%', padding: '10px', marginTop: '10px', fontSize: '13px', borderRadius: '12px' }}
              >
                Disconnect Session
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW 1: PROFILE SETUP / ONBOARDING VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Captive Portal Activation Banner */}
          {captiveParams && (
            <div className="glass-card highlighted" style={{ padding: '20px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ background: 'rgba(45, 106, 79, 0.08)', padding: '8px', borderRadius: '10px', color: 'var(--accent-green)' }}>
                  <Shield size={20} />
                </div>
                <div>
                  <h5 style={{ fontSize: '15px', fontWeight: '700' }}>Restaurant Wi-Fi Connected</h5>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Device MAC: {captiveParams.clientmac || 'Unknown'}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '16px' }}>
                To unlock full internet access on this network, authenticate your device. Your dietary preferences will remain secure and private.
              </p>
              <button
                onClick={() => {
                  // Redirect client to opennds authentication URL (mock or real)
                  const authUrl = `http://${captiveParams.gatewayaddress}/opennds_auth/?tok=${captiveParams.tok}&redir=${encodeURIComponent(captiveParams.redir || window.location.origin)}`;
                  window.location.href = authUrl;
                }}
                className="btn-primary"
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  fontSize: '13px', 
                  borderRadius: '10px', 
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                Connect to Guest Wi-Fi
              </button>
            </div>
          )}

          {/* Quick Repeat Last Order Card */}
          {lastOrder && (
            <div className="glass-card" style={{ padding: '16px', background: 'rgba(245, 166, 35, 0.04)', borderColor: 'rgba(245, 166, 35, 0.25)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '9px', background: 'rgba(245, 166, 35, 0.15)', color: '#B45309', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    🔄 Repeat Last Order
                  </span>
                  <h5 style={{ fontSize: '15px', fontWeight: '700', marginTop: '6px' }}>{lastOrder.name}</h5>
                </div>
                <span style={{ fontSize: '14px', fontWeight: '800' }}>₱{lastOrder.price.toFixed(2)}</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {lastOrder.description}
              </p>
              {kioskId ? (
                <button
                  onClick={() => {
                    setSelectedItemId(lastOrder.id);
                    localStorage.setItem('synapse_onboarded', 'true');
                    setIsOnboarded(true);
                  }}
                  className="btn-primary"
                  style={{ width: '100%', padding: '10px', marginTop: '12px', fontSize: '13px', borderRadius: '10px', fontWeight: '600' }}
                >
                  Quick Re-Order & Pair
                </button>
              ) : (
                <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>👉 Scan any Kiosk terminal to repeat this order instantly.</span>
                </div>
              )}
            </div>
          )}

          {/* Allergens Checklist */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🚫 1. Exclude Allergens
            </h4>
            <div className="preference-list">
              {ALLERGEN_OPTIONS.map(opt => {
                const checked = allergens.includes(opt.id);
                return (
                  <label key={opt.id} className={`custom-checkbox ${checked ? 'checked' : ''}`}>
                    <input 
                      type="checkbox" 
                      checked={checked}
                      onChange={() => handleAllergenToggle(opt.id)}
                    />
                    <div className="checkbox-box"></div>
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Preferences Checklist */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⭐ 2. Flavor Preferences
            </h4>
            <div className="preference-list">
              {PREFERENCE_OPTIONS.map(opt => {
                const checked = preferences.includes(opt.id);
                return (
                  <label key={opt.id} className={`custom-checkbox ${checked ? 'checked' : ''}`}>
                    <input 
                      type="checkbox" 
                      checked={checked}
                      onChange={() => handlePreferenceToggle(opt.id)}
                    />
                    <div className="checkbox-box"></div>
                    <span style={{ fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center' }}>
                      {opt.icon}
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Automated Taste Profile Training (History Insights) */}
          {history.length > 0 && (
            <div className="glass-card" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)' }}>
              <h5 style={{ fontSize: '12px', color: 'var(--accent-green)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={14} /> Taste Profile AI Insights
              </h5>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '10px' }}>
                Your order history is stored in local browser state. Based on your past orders, we have identified these affinities:
              </p>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Object.entries(tagCounts).map(([tag, count]) => {
                  const isStrongSuggestion = count >= 2;
                  const isChecked = preferences.includes(tag);
                  
                  return (
                    <div
                      key={tag}
                      style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: isStrongSuggestion ? 'rgba(45, 106, 79, 0.08)' : 'rgba(44, 26, 17, 0.02)',
                        border: `1px solid ${isStrongSuggestion ? 'var(--accent-green)' : 'var(--border-glass)'}`,
                        color: isStrongSuggestion ? 'var(--text-primary)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{tag.toUpperCase()} ({count}x)</span>
                      {isStrongSuggestion && !isChecked && (
                        <button
                          onClick={() => handlePreferenceToggle(tag)}
                          style={{
                            background: 'var(--accent-gradient)',
                            color: '#000',
                            border: 'none',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '8px',
                            fontWeight: '800',
                            cursor: 'pointer'
                          }}
                        >
                          ADD FILTER
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Proceed to Kiosk or Standby Scan Message */}
          {kioskId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => {
                  localStorage.setItem('synapse_onboarded', 'true');
                  setIsOnboarded(true);
                }}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '14px',
                  fontSize: '15px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                Pair & Connect to Kiosk #{kioskId}
              </button>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Your allergens and preferences will be projected temporarily.
              </p>
            </div>
          ) : (
            <div className="glass-card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(255, 255, 255, 0.01)' }}>
              <Smartphone size={20} color="var(--text-muted)" />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong>Awaiting scan.</strong> Scan a QR code on a kiosk table terminal to securely pair and order.
              </span>
            </div>
          )}

          {/* Factory Reset */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
            <button
              onClick={handleClearAllData}
              className="btn-danger"
              style={{ width: '100%', padding: '12px', fontSize: '13px', borderRadius: '12px' }}
            >
              Factory Reset (Wipe LocalStorage)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileView;
