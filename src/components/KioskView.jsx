import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { Monitor, Smartphone, Check, ShieldCheck, Clock, EyeOff, UtensilsCrossed, AlertTriangle } from 'lucide-react';
// MASTER_MENU is now fetched dynamically from /api/menu

function generateKioskId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function KioskView() {
  const [kioskId, setKioskId] = useState(generateKioskId());
  const [state, setState] = useState('standby'); // 'standby' | 'connected' | 'success'
  const [allergens, setAllergens] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [orderedItem, setOrderedItem] = useState(null);
  const [timeLeft, setTimeLeft] = useState(90);
  const [socketConnected, setSocketConnected] = useState(false);
  
  const socketRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const [masterMenu, setMasterMenu] = useState([]);

  // Load menu items from API
  useEffect(() => {
    fetch('/api/menu')
      .then(res => res.json())
      .then(data => setMasterMenu(data))
      .catch(err => console.error("Error loading menu:", err));
  }, []);


  // Initialize Socket.io Connection
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      console.log("[Kiosk] Connected to socket server");
      socket.emit('join-session', { kioskId, role: 'kiosk' });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      console.log("[Kiosk] Disconnected from socket server");
    });

    // Listen for client handshake (preference projection)
    socket.on('preferences-projected', (data) => {
      console.log("[Kiosk] Received client preferences:", data);
      setAllergens(data.allergens || []);
      setPreferences(data.preferences || []);
      setState('connected');
      setTimeLeft(90); // Reset countdown to 90s
    });

    // Listen for order confirmation
    socket.on('order-placed', (data) => {
      console.log("[Kiosk] Order placed:", data);
      setOrderedItem(data.item);
      setState('success');
    });

    // Listen for mobile client disconnection
    socket.on('mobile-disconnected', () => {
      console.log("[Kiosk] Mobile companion disconnected. Resetting state.");
      handleReset();
    });

    return () => {
      socket.disconnect();
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [kioskId]);

  // Handle room join when kioskId changes
  useEffect(() => {
    if (socketRef.current && socketConnected) {
      socketRef.current.emit('join-session', { kioskId, role: 'kiosk' });
    }
  }, [kioskId, socketConnected]);

  // 90-Second Inactivity Countdown Timer
  useEffect(() => {
    if (state === 'connected') {
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            handleReset(); // Wipe memory and reset to standby
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [state]);

  // Success screen auto-reset after 5 seconds
  useEffect(() => {
    if (state === 'success') {
      const resetTimeout = setTimeout(() => {
        handleReset();
      }, 5000);
      return () => clearTimeout(resetTimeout);
    }
  }, [state]);

  const handleReset = () => {
    // 1. Wipe all active session variables in memory (zero-retention)
    setAllergens([]);
    setPreferences([]);
    setOrderedItem(null);
    setTimeLeft(90);
    
    // 2. Generate a brand new kioskId for the next customer
    const newId = generateKioskId();
    setKioskId(newId);
    
    // 3. Revert to standby state
    setState('standby');
  };

  // Generate mobile scanner URL
  const clientUrl = `${window.location.origin}/?kioskId=${kioskId}`;

  // Filtering and Sorting Menu Items
  // 1. Filter out items containing user allergens
  const filteredMenu = masterMenu.filter(item => {
    return !item.allergens.some(allergen => allergens.includes(allergen));
  });

  // 2. Count match score for preferences to sort/highlight
  const getMatchCount = (item) => {
    return item.tags.filter(tag => preferences.includes(tag)).length;
  };

  // 3. Sort so that items matching the most preferences appear first
  const sortedMenu = [...filteredMenu].sort((a, b) => {
    const scoreA = getMatchCount(a);
    const scoreB = getMatchCount(b);
    return scoreB - scoreA; // High score first
  });

  return (
    <div className="kiosk-container fade-in">
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--accent-gradient)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UtensilsCrossed size={24} color="#04060b" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #9ca3af)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              SYNAPSE CUISINE
            </h1>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '0.05em' }}>
              ZERO-RETENTION SMART MENU TERMINAL
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '6px 14px', borderRadius: '999px', border: '1px solid var(--border-glass)' }}>
            <div className={`pulse-indicator ${socketConnected ? 'active' : 'disconnected'}`}></div>
            <span style={{ fontSize: '12px', fontWeight: '500', color: socketConnected ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
              {socketConnected ? 'Server Active' : 'Connecting Server...'}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(45, 106, 79, 0.05)', padding: '6px 14px', borderRadius: '999px', border: '1px solid rgba(45, 106, 79, 0.15)' }}>
            <Monitor size={14} color="var(--accent-green)" />
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-green)' }}>
              Kiosk #{kioskId}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '40px 0', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        
        {/* STATE A: STANDBY VIEW */}
        {state === 'standby' && (
          <div className="slide-up" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '48px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', marginBottom: '24px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <ShieldCheck size={16} />
                Privacy-First Architecture
              </div>
              <h2 style={{ fontSize: '48px', fontWeight: '800', lineHeight: '1.1', marginBottom: '20px', letterSpacing: '-0.02em' }}>
                A dining experience tailored to <span style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>your profile</span>.
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '18px', marginBottom: '32px', maxWidth: '580px', fontWeight: '300', lineHeight: '1.6' }}>
                Scan the QR code with your mobile browser. Select your dietary needs in private, and project a safe, custom menu here instantly. Zero logs, zero user database.
              </p>
              
              <div className="glass-card" style={{ padding: '24px', maxWidth: '500px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'rgba(45, 106, 79, 0.06)', padding: '12px', borderRadius: '12px', color: 'var(--accent-green)' }}>
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <h4 style={{ fontWeight: '600', marginBottom: '4px', fontSize: '15px' }}>Single-Screen Simulation Tool</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.4', marginBottom: '16px' }}>
                      Testing on a single device? Click below to launch a simulated mobile scanner window side-by-side.
                    </p>
                    <a 
                      href={clientUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn-primary"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px' }}
                    >
                      Simulate Mobile Scan
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="glass-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', boxShadow: '0 20px 40px rgba(44, 26, 17, 0.04)', borderRadius: '32px' }}>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(44, 26, 17, 0.08)', display: 'inline-block' }}>
                  <QRCodeSVG value={clientUrl} size={220} level="H" includeMargin={false} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>Scan to Personalize</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Connects to Kiosk ID: {kioskId}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STATE B: HANDSHAKE RECEIVED & FILTERED MENU */}
        {state === 'connected' && (
          <div className="slide-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span className="pulse-indicator active"></span>
                  <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Connected to Dining Profile</h3>
                </div>
                
                {/* Active Filters Display */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {allergens.length > 0 ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>Excluded Allergens:</span>
                      {allergens.map(a => <span key={a} className="badge badge-allergen">{a}</span>)}
                    </div>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--accent-success)', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✓ No Allergens Excluded
                    </span>
                  )}
                  
                  {allergens.length > 0 && preferences.length > 0 && <span style={{ color: 'var(--border-glass)' }}>|</span>}

                  {preferences.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>Highlighted Preferences:</span>
                      {preferences.map(p => <span key={p} className="badge badge-recommend">{p}</span>)}
                    </div>
                  )}
                </div>
              </div>

              {/* Countdown Timer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '10px 20px', borderRadius: '14px' }}>
                <Clock size={18} color="var(--accent-warning)" />
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--accent-warning)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Session Timeout</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-warning)' }}>{timeLeft}s</div>
                </div>
              </div>
            </div>

            {/* Menu Grid */}
            <div className="menu-grid">
              {sortedMenu.map((item) => {
                const hasMatch = preferences.some(p => item.tags.includes(p));
                const matchCount = getMatchCount(item);
                
                return (
                  <div 
                    key={item.id} 
                    className={`glass-card ${hasMatch ? 'highlighted' : ''}`}
                    style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}
                  >
                    {hasMatch && (
                      <div style={{ position: 'absolute', top: '0', right: '0', background: 'var(--accent-gradient)', padding: '4px 12px', borderBottomLeftRadius: '12px', fontSize: '11px', fontWeight: '700', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        ★ Recommended Match
                      </div>
                    )}
                    
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', paddingRight: hasMatch ? '120px' : '0' }}>{item.name}</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5' }}>{item.description}</p>
                    </div>

                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>
                        ₱{item.price.toFixed(2)}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {item.tags.map(tag => (
                          <span 
                            key={tag} 
                            className={`badge ${preferences.includes(tag) ? 'badge-recommend' : 'badge-tag'}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {sortedMenu.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '60px', textAlign: 'center' }} className="glass-card">
                  <AlertTriangle size={48} color="var(--accent-warning)" style={{ marginBottom: '16px' }} />
                  <h3>No items match your dietary safety profile.</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
                    All items on the menu contain one or more of your registered allergens.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATE C: TRANSACTION SUCCESS SCREEN */}
        {state === 'success' && (
          <div className="slide-up" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto', padding: '40px' }}>
            <div className="success-checkmark" style={{ marginBottom: '32px' }}>
              <div className="check-icon"></div>
            </div>
            
            <h2 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '16px' }}>Order Received!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', lineHeight: '1.6', marginBottom: '40px' }}>
              Thank you! We've received your order for the <strong style={{ color: 'var(--text-primary)' }}>{orderedItem?.name}</strong>. Your meal is being prepared.
            </p>
            
            <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <EyeOff size={20} color="var(--accent-success)" />
              <span style={{ fontSize: '13px', color: 'var(--accent-success)', fontWeight: '600' }}>
                Zero-Retention Wipe: All preference data cleared from terminal memory.
              </span>
            </div>
            
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '40px' }}>
              Returning to standby mode shortly...
            </p>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
        <p>© 2026 Synapse Cuisine. All rights reserved.</p>
        <div style={{ display: 'flex', gap: '20px' }}>
          <span>Privacy Enforced (No Logs)</span>
          <span>•</span>
          <span>WebSockets Local Link</span>
        </div>
      </footer>
    </div>
  );
}

export default KioskView;
