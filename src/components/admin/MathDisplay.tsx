import { useMemo } from 'react';
import { renderLatex, containsLatex, renderMathText } from '@/utils/mathRenderer';
import 'katex/dist/katex.min.css';

interface MathDisplayProps {
  text: string;
  className?: string;
  block?: boolean;
}

/**
 * Component to render text with proper math/chemistry formatting
 * Uses KaTeX for LaTeX rendering
 */
export function MathDisplay({ text, className = '', block = false }: MathDisplayProps) {
  const renderedContent = useMemo(() => {
    if (!text) return '';
    const normalizedText = String(text)
      .replace(/^\s*(?:<p[^>]*>\s*)+/i, '')
      .replace(/(?:\s*<\/p>\s*)+$/i, '')
      .replace(/^\s*(?:<div[^>]*>\s*)+/i, '')
      .replace(/(?:\s*<\/div>\s*)+$/i, '')
      .replace(/^\s*<br\s*\/?>\s*/i, '')
      .trim();
    
    // Always try to render LaTeX if it looks like it has any
    if (containsLatex(normalizedText)) {
      const rendered = renderLatex(normalizedText);
      
      return rendered;
    }
    
    // Otherwise just apply basic text conversions
    return renderMathText(normalizedText);
  }, [text]);
  
  if (block) {
    return (
      <div 
        className={`math-display ${className}`}
        dangerouslySetInnerHTML={{ __html: renderedContent }}
      />
    );
  }
  
  return (
    <span 
      className={`math-display ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}

/**
 * Simple wrapper for question text display
 */
export function QuestionText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`question-text whitespace-pre-wrap ${className}`}>
      <MathDisplay text={text} />
    </div>
  );
}

/**
 * Wrapper for option text display
 */
export function OptionText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`option-text ${className}`}>
      <MathDisplay text={text} />
    </span>
  );
}
