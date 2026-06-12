const JSX_LIKE_EXTS = new Set(['jsx', 'tsx', 'js']);
const HTML_EXTS = new Set(['html', 'htm']);
const REACT_IMPORT_RE = /^react(?:\/.*)?$/;

type TypeScriptModule = typeof import('typescript');

let typescriptPromise: Promise<TypeScriptModule> | null = null;

const loadTypeScript = () => {
  if (!typescriptPromise) {
    typescriptPromise = import('typescript');
  }

  return typescriptPromise;
};

const getExtension = (value?: string | null) => (value?.split('.').pop() || '').toLowerCase();

const HOOK_PREAMBLE = `
const React = window.__JEENIE_SIM_REACT__;
if (!React) {
  throw new Error('React runtime is unavailable for this simulation.');
}
const {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
  useContext,
  createContext,
  forwardRef,
  Fragment,
  memo,
  createElement,
} = React;
`;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function validateImports(source: string) {
  const imports = [...source.matchAll(/^\s*import\s+(?:.+?\s+from\s+)?['"]([^'"]+)['"];?\s*$/gm)];

  const unsupportedImport = imports.find(([, moduleId]) => !REACT_IMPORT_RE.test(moduleId));
  if (unsupportedImport) {
    throw new Error(
      `Unsupported import "${unsupportedImport[1]}". Simulation uploads must be self-contained React components.`
    );
  }
}

function normalizeSimulationSource(source: string) {
  validateImports(source);

  const candidateNames: string[] = [];
  let normalized = source.replace(/^\uFEFF/, '').trim();

  normalized = normalized.replace(
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    (_, name: string) => {
      candidateNames.push(name);
      return `function ${name}(`;
    }
  );

  normalized = normalized.replace(/export\s+default\s+function\s*\(/g, () => {
    candidateNames.unshift('__SIM_DEFAULT__');
    return 'const __SIM_DEFAULT__ = function(';
  });

  normalized = normalized.replace(
    /export\s+default\s+class\s+([A-Za-z_$][\w$]*)\s*/g,
    (_, name: string) => {
      candidateNames.push(name);
      return `class ${name} `;
    }
  );

  normalized = normalized.replace(/export\s+default\s+class\s*/g, () => {
    candidateNames.unshift('__SIM_DEFAULT__');
    return 'const __SIM_DEFAULT__ = class ';
  });

  normalized = normalized.replace(
    /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm,
    (_, name: string) => {
      candidateNames.unshift(name);
      return '';
    }
  );

  normalized = normalized.replace(/^\s*export\s+default\s+/gm, () => {
    candidateNames.unshift('__SIM_DEFAULT__');
    return 'const __SIM_DEFAULT__ = ';
  });

  normalized = normalized
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^\s*export\s+(const|function|class|let|var)\s+/gm, '$1 ');

  const discoveredCandidates = [
    ...normalized.matchAll(/(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)/g),
    ...normalized.matchAll(/(?:^|\n)\s*class\s+([A-Za-z_$][\w$]*)/g),
    ...normalized.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g),
  ].map((match) => match[1]);

  const orderedCandidates = unique([
    ...candidateNames,
    'App',
    'Simulation',
    ...discoveredCandidates,
  ]);

  if (orderedCandidates.length === 0) {
    throw new Error('No mountable React component found. Use export default function App() { ... }.');
  }

  return { normalizedSource: normalized, candidateNames: orderedCandidates };
}

function buildResolutionSuffix(candidateNames: string[]) {
  const resolution = candidateNames
    .map((name) => `(typeof ${name} !== 'undefined' ? ${name} : undefined)`)
    .join(' ?? ');

  return `
const __SIM_COMPONENT__ = ${resolution || 'undefined'};
export default __SIM_COMPONENT__ ?? null;
`;
}

async function transpileSimulationSource(source: string) {
  const typescript = await loadTypeScript();
  const { normalizedSource, candidateNames } = normalizeSimulationSource(source);

  const transpiled = typescript.transpileModule(
    `${HOOK_PREAMBLE}\n${normalizedSource}\n${buildResolutionSuffix(candidateNames)}`,
    {
      compilerOptions: {
        allowJs: true,
        jsx: typescript.JsxEmit.React,
        module: typescript.ModuleKind.ES2020,
        target: typescript.ScriptTarget.ES2020,
        useDefineForClassFields: false,
      },
      fileName: 'simulation.tsx',
      reportDiagnostics: true,
    }
  );

  const errors = (transpiled.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error
  );

  if (errors.length > 0) {
    const formatted = errors
      .map((diagnostic) => typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n');

    throw new Error(`Simulation compile failed:\n${formatted}`);
  }

  return `/* JEEnie simulation module */\n${transpiled.outputText}`;
}

export async function prepareSimulationUploadFile(file: File): Promise<File> {
  const ext = getExtension(file.name);

  if (HTML_EXTS.has(ext) || !JSX_LIKE_EXTS.has(ext)) {
    return file;
  }

  const code = await file.text();
  if (!code.trim()) {
    throw new Error('Simulation file is empty. Please upload a valid JSX/TSX/JS file.');
  }

  const compiledCode = await transpileSimulationSource(code);
  const jsName = file.name.replace(/\.[^.]+$/, '') + '.js';
  return new File([compiledCode], jsName, { type: 'text/javascript' });
}

export function getSimulationContentKind(
  filePath?: string | null,
  originalFilename?: string | null
): 'script' | 'document' {
  const ext = getExtension(filePath) || getExtension(originalFilename);
  return ext === 'js' ? 'script' : 'document';
}

export function buildHostedSimulationUrl(moduleUrl: string, title?: string) {
  const url = new URL('/simulation-host.html', window.location.origin);
  url.searchParams.set('src', moduleUrl);

  if (title) {
    url.searchParams.set('title', title);
  }

  return url.toString();
}