import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, CheckCircle2, ShieldAlert, Activity, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/utils/logger';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  recent_errors_24h: number;
  timestamp: string;
}

export const SystemHealthBanner = () => {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  const checkHealth = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_system_health_status');
      if (error) throw error;
      setStatus(data as unknown as HealthStatus);
      setLastCheck(new Date());
    } catch (err) {
      logger.error('Health check failed:', err);
      setStatus({ status: 'down', recent_errors_24h: 0, timestamp: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000 * 5); // Check every 5 minutes
    return () => clearInterval(interval);
  }, []);

  if (!status && loading) return null;

  const getStatusConfig = () => {
    switch (status?.status) {
      case 'healthy':
        return {
          icon: CheckCircle2,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/20',
          label: 'System Healthy'
        };
      case 'degraded':
        return {
          icon: ShieldAlert,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20',
          label: 'Service Degraded'
        };
      case 'down':
      default:
        return {
          icon: AlertCircle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          label: 'System Issues Detected'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Card className={`mb-6 border ${config.borderColor} ${config.bgColor}`}>
      <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${config.bgColor}`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
              {status?.recent_errors_24h && status.recent_errors_24h > 0 ? (
                <Badge variant="outline" className={`${config.borderColor} ${config.color} text-[10px]`}>
                  {status.recent_errors_24h} errors (24h)
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Last verified: {lastCheck.toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-6 pr-4 border-r border-border">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Database</p>
              <div className="flex items-center gap-1 text-xs font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected
              </div>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Auth</p>
              <div className="flex items-center gap-1 text-xs font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Operational
              </div>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={checkHealth} 
            disabled={loading}
            className="h-8 w-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
