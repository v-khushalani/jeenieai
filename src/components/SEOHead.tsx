import { useEffect } from 'react';

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  noIndex?: boolean;
}

const DEFAULTS = {
  siteName: 'JEEnie AI',
  title: 'JEEnie AI – #1 AI-Powered JEE, NEET & Foundation Prep Platform',
  description:
    'Crack JEE Main, JEE Advanced & NEET with AI-personalized study plans, 50 000+ questions, smart analytics & gamified learning. Start free today!',
  ogImage:
    'https://storage.googleapis.com/gpt-engineer-file-uploads/pAJVu78QZ6WhuH9D77xLYDt4Fmg2/social-images/social-1775309330380-logo.webp',
  url: 'https://www.jeenie.website',
};

const normalizeUrl = (value: string) => {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : DEFAULTS.url;
    const placeholderOrigin = new URL(DEFAULTS.url).origin;
    return new URL(value, base).toString().replace(placeholderOrigin, base);
  } catch {
    return value;
  }
};

const setMeta = (attr: string, key: string, content: string) => {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const SEOHead = ({
  title,
  description,
  canonical,
  ogImage,
  ogType = 'website',
  noIndex = false,
}: SEOHeadProps) => {
  const fullTitle = title ? `${title} | ${DEFAULTS.siteName}` : DEFAULTS.title;
  const desc = description || DEFAULTS.description;
  const image = ogImage || DEFAULTS.ogImage;
  const url = normalizeUrl(canonical || DEFAULTS.url);

  useEffect(() => {
    document.title = fullTitle;

    // Basic meta
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noIndex ? 'noindex,nofollow' : 'index,follow');

    // Open Graph
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:site_name', DEFAULTS.siteName);

    // Twitter
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', image);
    setMeta('name', 'twitter:url', url);

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = url;
  }, [fullTitle, desc, image, url, ogType, noIndex]);

  return null;
};

export default SEOHead;
