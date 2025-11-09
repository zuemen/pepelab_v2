import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);
const RouteBaseContext = createContext('/');

function normalizeAbsolutePath(path) {
  if (!path || path === '/') {
    return '/';
  }
  const segments = path.split('/').filter(Boolean);
  return '/' + segments.join('/');
}

function joinSegments(segments) {
  if (!segments.length) {
    return '/';
  }
  return '/' + segments.join('/');
}

function resolveTo(to, base) {
  if (!to || to === '.') {
    return base;
  }
  if (to.startsWith('/')) {
    return normalizeAbsolutePath(to);
  }
  const segments = base === '/' ? [] : base.split('/').filter(Boolean);
  const parts = to.split('/');
  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return joinSegments(segments);
}

function splitPath(path) {
  if (!path || path === '/') {
    return [];
  }
  return path.split('/').filter(Boolean);
}

export function BrowserRouter({ children }) {
  const [pathname, setPathname] = useState(() => normalizeAbsolutePath(window.location.pathname));

  useEffect(() => {
    const handlePop = () => {
      setPathname(normalizeAbsolutePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = useCallback((to, options = {}) => {
    const target = normalizeAbsolutePath(to);
    if (target === pathname) {
      return;
    }
    if (options.replace) {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
    setPathname(target);
  }, [pathname]);

  const value = useMemo(() => ({ pathname, navigate }), [pathname, navigate]);

  return (
    <RouterContext.Provider value={value}>
      <RouteBaseContext.Provider value="/">
        {children}
      </RouteBaseContext.Provider>
    </RouterContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useLocation must be used inside a BrowserRouter.');
  }
  return { pathname: ctx.pathname };
}

export function useNavigate() {
  const router = useContext(RouterContext);
  const base = useContext(RouteBaseContext);
  if (!router) {
    throw new Error('useNavigate must be used inside a BrowserRouter.');
  }
  return useCallback((to, options = {}) => {
    router.navigate(resolveTo(to, base), options);
  }, [router, base]);
}

export function Link({ to, onClick, ...rest }) {
  const navigate = useNavigate();
  const base = useContext(RouteBaseContext);
  const href = resolveTo(to, base);

  function handleClick(event) {
    if (onClick) {
      onClick(event);
    }
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }

  return <a {...rest} href={href} onClick={handleClick} />;
}

export function Route(_props) {
  return null;
}

export function Routes({ children }) {
  const router = useContext(RouterContext);
  const base = useContext(RouteBaseContext);

  if (!router) {
    throw new Error('Routes must be used inside a BrowserRouter.');
  }

  const allChildren = Array.isArray(children) ? children : [children];
  const baseSegments = splitPath(base);
  const pathSegments = splitPath(router.pathname);

  for (const child of allChildren) {
    if (!child || child.type !== Route) {
      continue;
    }
    const props = child.props || {};

    if (props.index) {
      if (pathSegments.length === baseSegments.length) {
        return (
          <RouteBaseContext.Provider value={joinSegments(baseSegments)}>
            {props.element}
          </RouteBaseContext.Provider>
        );
      }
      continue;
    }

    if (props.path === '*') {
      return (
        <RouteBaseContext.Provider value={joinSegments(baseSegments)}>
          {props.element}
        </RouteBaseContext.Provider>
      );
    }

    if (!props.path) {
      continue;
    }

    const hasWildcard = props.path.endsWith('/*');
    const pattern = hasWildcard ? props.path.slice(0, -2) : props.path;
    const patternSegments = pattern.startsWith('/')
      ? splitPath(pattern)
      : [...baseSegments, ...splitPath(pattern)];

    const matchLength = patternSegments.length;
    let isMatch = true;
    for (let i = 0; i < matchLength; i += 1) {
      if (pathSegments[i] !== patternSegments[i]) {
        isMatch = false;
        break;
      }
    }

    if (!isMatch) {
      continue;
    }

    if (!hasWildcard) {
      if (pathSegments.length !== matchLength) {
        continue;
      }
    } else if (pathSegments.length < matchLength) {
      continue;
    }

    const childBase = hasWildcard
      ? joinSegments(patternSegments)
      : joinSegments(patternSegments.slice(0, -1));

    return (
      <RouteBaseContext.Provider value={childBase}>
        {props.element}
      </RouteBaseContext.Provider>
    );
  }

  return null;
}

export function Navigate({ to, replace = false }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}
