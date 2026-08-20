import React, { useState, useEffect } from 'react';
import KioskView from './components/KioskView';
import MobileView from './components/MobileView';

function App() {
  const [kioskId, setKioskId] = useState(null);
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  // Check screen width for mobile layouts
  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check URL parameters for active session on load and when the URL changes
  useEffect(() => {
    const handleUrlCheck = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('kioskId');
      setKioskId(id);
    };

    handleUrlCheck();
    
    // Listen for history popstate events (e.g. back button)
    window.addEventListener('popstate', handleUrlCheck);
    return () => window.removeEventListener('popstate', handleUrlCheck);
  }, []);

  const handleResetSession = () => {
    // Clear URL query parameters in browser search bar
    window.history.pushState({}, document.title, window.location.pathname);
    setKioskId(null);
  };

  return (
    <div className="app-container">
      {kioskId || isMobileScreen ? (
        <MobileView kioskId={kioskId} onResetSession={handleResetSession} />
      ) : (
        <KioskView />
      )}
    </div>
  );
}

export default App;
