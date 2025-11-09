import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from './router.jsx';
import App from './App.jsx';
import DemoApp from './demo/DemoApp.jsx';
import './styles.css';

function ModeSwitcher() {
  const location = useLocation();
  const isDemo = location.pathname.startsWith('/demo');

  return (
    <div className="mode-switcher" role="navigation" aria-label="模式切換">
      <Link to="/" className={!isDemo ? 'active' : ''}>
        Sandbox
      </Link>
      <span aria-hidden="true">/</span>
      <Link to="demo" className={isDemo ? 'active' : ''}>
        Demo
      </Link>
    </div>
  );
}

function RootRouter() {
  return (
    <>
      <ModeSwitcher />
      <Routes>
        <Route path="demo/*" element={<DemoApp />} />
        <Route index element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <RootRouter />
    </BrowserRouter>
  </React.StrictMode>
);
