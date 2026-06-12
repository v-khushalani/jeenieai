const root = document.getElementById('root');
const errorBox = document.getElementById('error');

const params = new URLSearchParams(window.location.search);
const moduleUrl = params.get('src');
const title = params.get('title');

if (title) {
  document.title = title;
}

const showError = (message) => {
  if (!errorBox) return;

  errorBox.hidden = false;
  errorBox.textContent = `Simulation error\n${message}`;
};

const React = window.React;
const ReactDOM = window.ReactDOM;

const isRenderableExport = (value) => {
  if (!value) return false;
  if (typeof value === 'function') return true;
  if (typeof value === 'object' && React?.isValidElement?.(value)) return true;
  return typeof value === 'object' && '$$typeof' in value;
};

const renderSimulation = async () => {
  if (!root) {
    throw new Error('Simulation root not found.');
  }

  if (!moduleUrl) {
    throw new Error('Simulation source is missing.');
  }

  if (!React || !ReactDOM?.createRoot) {
    throw new Error('Simulation runtime is unavailable. Please reopen the animation.');
  }

  window.__JEENIE_SIM_REACT__ = React;
  window.__JEENIE_SIM_REACT_DOM__ = ReactDOM;
  window.simRoot = root;
  window.canvas = root;

  let mod;
  try {
    mod = await import(moduleUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load simulation module: ${message}`);
  }

  const candidate =
    mod.default ??
    mod.App ??
    mod.Simulation ??
    Object.values(mod).find((value) => isRenderableExport(value));

  if (!candidate) {
    throw new Error('No mountable React component was exported.');
  }

  const node = React.isValidElement(candidate) ? candidate : React.createElement(candidate);
  ReactDOM.createRoot(root).render(node);
};

renderSimulation().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown simulation runtime error';
  showError(message);
});
