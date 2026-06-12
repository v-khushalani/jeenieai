import React from 'react';
import { WifiOff, RefreshCw, AlertTriangle, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="p-4 bg-muted rounded-full mb-4">
      {icon || <FileQuestion className="h-8 w-8 text-muted-foreground" />}
    </div>
    <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
    {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
    {action && (
      <Button onClick={action.onClick} variant="outline" size="sm" className="mt-4">
        <RefreshCw className="h-4 w-4 mr-2" />
        {action.label}
      </Button>
    )}
  </div>
);

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message = 'Something went wrong', onRetry }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="p-4 bg-destructive/10 rounded-full mb-4">
      <AlertTriangle className="h-8 w-8 text-destructive" />
    </div>
    <h3 className="text-base font-semibold text-foreground mb-1">Oops!</h3>
    <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
    {onRetry && (
      <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
        <RefreshCw className="h-4 w-4 mr-2" />
        Try Again
      </Button>
    )}
  </div>
);

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = React.useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-100 bg-orange-500 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 shadow-lg">
      <WifiOff className="h-4 w-4" />
      You're offline. Some features may not work.
    </div>
  );
};
