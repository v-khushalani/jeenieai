import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';

interface FeatureGateProps {
  flagKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wraps a component/route with a feature flag check.
 * If the flag is disabled, redirects to dashboard (or renders fallback).
 */
const FeatureGate: React.FC<FeatureGateProps> = ({ flagKey, children, fallback }) => {
  const isEnabled = useFeatureFlag(flagKey);

  if (!isEnabled) {
    return fallback ? <>{fallback}</> : <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default FeatureGate;
