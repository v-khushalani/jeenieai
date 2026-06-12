import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PlansTab } from './subscriptions/PlansTab';
import { PromoCodesTab } from './subscriptions/PromoCodesTab';

const SubscriptionManager: React.FC = () => {
  const [tab, setTab] = useState('plans');
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Subscriptions & Promo Codes</h2>
        <p className="text-sm text-muted-foreground">Manage subscription plans and promotional discount codes that flow into Razorpay checkout.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="promos">Promo Codes</TabsTrigger>
        </TabsList>
        <TabsContent value="plans" className="mt-4"><PlansTab /></TabsContent>
        <TabsContent value="promos" className="mt-4"><PromoCodesTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default SubscriptionManager;
