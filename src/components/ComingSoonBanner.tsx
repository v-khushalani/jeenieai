import React from 'react';
import {  } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ComingSoonBannerProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Shared empty-state banner. Used anywhere a list has no content yet, so the
 * user sees an intentional "Coming Soon" instead of a dead blank area.
 */
const ComingSoonBanner: React.FC<ComingSoonBannerProps> = ({
  title = 'Coming Soon',
  subtitle = 'Yeh section jaldi live ho raha hai. Thoda intezaar!',
  icon,
  className = '',
}) => {
  return (
    <Card className={`border-dashed border-2 border-primary/30 bg-primary/5 ${className}`}>
      <CardContent className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          {icon ?? }
        </div>
        <p className="text-lg font-bold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground max-w-sm">{subtitle}</p>
      </CardContent>
    </Card>
  );
};

export default ComingSoonBanner;
