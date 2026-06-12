import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Plus, Trash2, Sparkles, Crown, ChevronDown, Eye, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface RzpPlan {
  id: string;
  name: string;
  amount: number; // paise
  currency: string;
  period: string;
  interval: number;
}

const RzpContext = React.createContext<{
  plans: RzpPlan[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}>({ plans: [], loading: false, error: null, refresh: () => {} });

interface Plan {
  id: string;
  name: string;
  tagline: string | null;
  tier: 'pro' | 'pro_plus';
  mrp_price: number | null;
  price: number;
  duration_days: number;
  display_duration: string;
  features: string[];
  is_popular: boolean;
  is_best_value: boolean;
  is_active: boolean;
  display_order: number;
  razorpay_plan_id: string | null;
}

const isYearly = (p: Plan) => p.duration_days >= 365;

export const PlansTab: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) toast.error(error.message);
    else setPlans((data || []) as unknown as Plan[]);
    setLoading(false);
  };

  // Razorpay plans (admin-only fetch via edge function)
  const [rzpPlans, setRzpPlans] = useState<RzpPlan[]>([]);
  const [rzpLoading, setRzpLoading] = useState(false);
  const [rzpError, setRzpError] = useState<string | null>(null);

  const loadRzp = async () => {
    setRzpLoading(true);
    setRzpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('list-razorpay-plans', { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');
      setRzpPlans(data.plans || []);
    } catch (e) {
      setRzpError((e as Error).message);
    } finally {
      setRzpLoading(false);
    }
  };

  useEffect(() => { load(); loadRzp(); }, []);

  const update = (id: string, patch: Partial<Plan>) =>
    setPlans(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const save = async (plan: Plan) => {
    setSaving(plan.id);
    const { error } = await supabase
      .from('subscription_plans')
      .update({
        name: plan.name, tagline: plan.tagline,
        mrp_price: plan.mrp_price, price: plan.price,
        duration_days: plan.duration_days, display_duration: plan.display_duration,
        features: plan.features, is_popular: plan.is_popular, is_best_value: plan.is_best_value,
        is_active: plan.is_active, display_order: plan.display_order,
        razorpay_plan_id: plan.razorpay_plan_id,
      })
      .eq('id', plan.id);
    setSaving(null);
    if (error) toast.error(error.message); else toast.success(`Saved ${plan.id}`);
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete plan "${id}"?`)) return;
    const { error } = await supabase.from('subscription_plans').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); load(); }
  };

  const grouped = useMemo(() => {
    const tiers: Record<'pro' | 'pro_plus', Plan[]> = { pro: [], pro_plus: [] };
    plans.forEach(p => { tiers[p.tier]?.push(p); });
    return tiers;
  }, [plans]);

  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;

  return (
    <RzpContext.Provider value={{ plans: rzpPlans, loading: rzpLoading, error: rzpError, refresh: loadRzp }}>
      <div className="space-y-3">
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {plans.length} plans · price changes hit Razorpay instantly for new checkouts
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadRzp} disabled={rzpLoading} className="h-8 text-xs">
              {rzpLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              {rzpPlans.length ? `${rzpPlans.length} Razorpay plans` : 'Sync Razorpay'}
            </Button>
            <CreatePlanDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
          </div>
        </div>
        {rzpError && (
          <p className="text-[11px] text-destructive">Razorpay sync failed: {rzpError}</p>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {(['pro', 'pro_plus'] as const).map(tier => (
            <TierCard
              key={tier}
              tier={tier}
              plans={grouped[tier]}
              saving={saving}
              onChange={update}
              onSave={save}
              onDelete={remove}
            />
          ))}
        </div>
      </div>
    </RzpContext.Provider>
  );
};


const TierCard: React.FC<{
  tier: 'pro' | 'pro_plus';
  plans: Plan[];
  saving: string | null;
  onChange: (id: string, patch: Partial<Plan>) => void;
  onSave: (p: Plan) => void;
  onDelete: (id: string) => void;
}> = ({ tier, plans, saving, onChange, onSave, onDelete }) => {
  const monthly = plans.find(p => !isYearly(p));
  const yearly = plans.find(p => isYearly(p));
  const Icon = tier === 'pro_plus' ? Crown : Sparkles;

  return (
    <Card className={tier === 'pro_plus' ? 'border-primary/40' : ''}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${tier === 'pro_plus' ? 'text-primary' : 'text-muted-foreground'}`} />
            <h3 className="font-semibold text-sm uppercase tracking-wide">
              {tier === 'pro_plus' ? 'JEEnie Pro+' : 'JEEnie Pro'}
            </h3>
          </div>
          <Badge variant="outline" className="text-[10px]">{plans.length} variants</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <PlanColumn label="Monthly" plan={monthly} saving={saving} onChange={onChange} onSave={onSave} onDelete={onDelete} />
          <PlanColumn label="Yearly" plan={yearly} saving={saving} onChange={onChange} onSave={onSave} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
};

const PlanColumn: React.FC<{
  label: string;
  plan: Plan | undefined;
  saving: string | null;
  onChange: (id: string, patch: Partial<Plan>) => void;
  onSave: (p: Plan) => void;
  onDelete: (id: string) => void;
}> = ({ label, plan, saving, onChange, onSave, onDelete }) => {
  if (!plan) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
        No {label.toLowerCase()} plan
      </div>
    );
  }
  const set = (patch: Partial<Plan>) => onChange(plan.id, patch);
  const isSaving = saving === plan.id;

  return (
    <div className="rounded-md border border-border p-2.5 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
          <code className="text-[10px] px-1 rounded bg-background text-muted-foreground truncate max-w-[80px]">{plan.id}</code>
        </div>
        <Switch checked={plan.is_active} onCheckedChange={v => set({ is_active: v })} />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <Label className="text-[10px] text-muted-foreground">Price ₹ (charged)</Label>
          <Input className="h-8 text-sm" type="number" value={plan.price}
            onChange={e => set({ price: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">MRP ₹ (struck)</Label>
          <Input className="h-8 text-sm" type="number" placeholder="—"
            value={plan.mrp_price ?? ''}
            onChange={e => set({ mrp_price: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>

      {plan.mrp_price && plan.mrp_price > plan.price ? (
        <p className="text-[10px] text-green-600 font-medium -mt-1">
          Students see ₹{plan.mrp_price} struck → save ₹{plan.mrp_price - plan.price} ({Math.round((1 - plan.price / plan.mrp_price) * 100)}% off)
        </p>
      ) : null}

      <div>
        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
          ✨ Creative tagline
        </Label>
        <Input
          className="h-8 text-sm italic"
          placeholder="e.g. Less than a pizza per month 🍕"
          value={plan.tagline ?? ''}
          onChange={e => set({ tagline: e.target.value })}
          maxLength={80}
        />
      </div>

      <RazorpayPlanPicker
        value={plan.razorpay_plan_id}
        onChange={(v) => set({ razorpay_plan_id: v })}
        priceRupees={plan.price}
        isYearly={isYearly(plan)}
      />


      <div className="flex items-center justify-between gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              More <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-2" align="start">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Name</Label>
                <Input className="h-8 text-sm" value={plan.name} onChange={e => set({ name: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Duration (days)</Label>
                <Input className="h-8 text-sm" type="number" value={plan.duration_days}
                  onChange={e => set({ duration_days: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-[10px]">Display duration</Label>
                <Input className="h-8 text-sm" value={plan.display_duration}
                  onChange={e => set({ display_duration: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Order</Label>
                <Input className="h-8 text-sm" type="number" value={plan.display_order}
                  onChange={e => set({ display_order: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Features (one per line)</Label>
              <Textarea rows={5} className="text-xs" value={plan.features.join('\n')}
                onChange={e => set({ features: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
            </div>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <Switch checked={plan.is_popular} onCheckedChange={v => set({ is_popular: v })} />
                Popular
              </label>
              <label className="flex items-center gap-1.5">
                <Switch checked={plan.is_best_value} onCheckedChange={v => set({ is_best_value: v })} />
                Best
              </label>
            </div>
            <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={() => onDelete(plan.id)}>
              <Trash2 className="w-3 h-3 mr-1" /> Delete plan
            </Button>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1">
          <PreviewPlanButton plan={plan} />
          <Button size="sm" className="h-7 px-3 text-xs" onClick={() => onSave(plan)} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3 mr-1" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
};


const CreatePlanDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }> = ({ open, onOpenChange, onCreated }) => {
  const [form, setForm] = useState({
    id: '', name: '', tier: 'pro' as 'pro' | 'pro_plus',
    price: 0, mrp_price: '', duration_days: 30, display_duration: 'per month',
    tagline: '', display_order: 100,
  });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!form.id.trim() || !form.name.trim()) { toast.error('ID and Name required'); return; }
    setSaving(true);
    const { error } = await supabase.from('subscription_plans').insert({
      id: form.id.trim(), name: form.name.trim(), tier: form.tier,
      price: form.price, mrp_price: form.mrp_price ? Number(form.mrp_price) : null,
      duration_days: form.duration_days, display_duration: form.display_duration,
      tagline: form.tagline, display_order: form.display_order, features: [],
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Plan created'); onCreated(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> New plan</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create subscription plan</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Plan ID (slug)</Label>
            <Input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Tier</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.tier}
                onChange={e => setForm(f => ({ ...f, tier: e.target.value as 'pro' | 'pro_plus' }))}>
                <option value="pro">pro</option>
                <option value="pro_plus">pro_plus</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Price ₹</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} /></div>
            <div><Label className="text-xs">MRP ₹</Label><Input type="number" value={form.mrp_price} onChange={e => setForm(f => ({ ...f, mrp_price: e.target.value }))} /></div>
            <div><Label className="text-xs">Days</Label><Input type="number" value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: Number(e.target.value) }))} /></div>
          </div>
          <div><Label className="text-xs">Display duration</Label><Input value={form.display_duration} onChange={e => setForm(f => ({ ...f, display_duration: e.target.value }))} /></div>
          <div><Label className="text-xs">Tagline</Label><Input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Razorpay plan ID picker (autofill from API) ----------
const RazorpayPlanPicker: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
  priceRupees: number;
  isYearly: boolean;
}> = ({ value, onChange, priceRupees, isYearly }) => {
  const { plans, loading, error, refresh } = React.useContext(RzpContext);
  const [manual, setManual] = useState(false);

  // Detect mismatch between selected razorpay plan amount and DB price
  const selected = plans.find(p => p.id === value);
  const mismatch = selected && Math.round(priceRupees * 100) !== selected.amount;

  // Filter suggestions by period matching yearly/monthly when possible
  const suggested = plans.filter(p => {
    if (isYearly) return p.period === 'yearly';
    return p.period === 'monthly' || p.period === 'daily' || p.period === 'weekly';
  });

  if (manual || (!loading && plans.length === 0 && !error)) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground">Razorpay plan ID</Label>
          <button type="button" className="text-[10px] text-primary hover:underline"
            onClick={() => { setManual(false); refresh(); }}>
            Pick from Razorpay
          </button>
        </div>
        <Input className="h-8 text-xs font-mono" placeholder="plan_XXXX"
          value={value ?? ''} onChange={e => onChange(e.target.value || null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground">Razorpay plan</Label>
        <button type="button" className="text-[10px] text-muted-foreground hover:underline"
          onClick={() => setManual(true)}>
          Enter manually
        </button>
      </div>
      <Select value={value ?? '__none__'} onValueChange={(v) => onChange(v === '__none__' ? null : v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={loading ? 'Loading Razorpay plans…' : 'Select Razorpay plan'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None (no recurring) —</SelectItem>
          {suggested.length > 0 && (
            <>
              {suggested.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · ₹{(p.amount / 100).toFixed(0)} / {p.period}
                </SelectItem>
              ))}
            </>
          )}
          {plans.filter(p => !suggested.includes(p)).map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} · ₹{(p.amount / 100).toFixed(0)} / {p.period}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
      {mismatch && selected && (
        <p className="text-[10px] text-amber-600 mt-0.5">
          ⚠ Razorpay amount ₹{(selected.amount / 100).toFixed(0)} ≠ DB price ₹{priceRupees}
        </p>
      )}
    </div>
  );
};

// ---------- Live preview matching SubscriptionPlans page ----------
const PreviewPlanButton: React.FC<{ plan: Plan }> = ({ plan }) => {
  const [open, setOpen] = useState(false);
  const mrp = plan.mrp_price ?? null;
  const monthly = plan.duration_days >= 365 ? Math.round(plan.price / 12) : null;
  const highlight = plan.is_popular || plan.is_best_value;
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
        onClick={() => setOpen(true)}>
        <Eye className="w-3 h-3 mr-1" /> Preview
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm text-muted-foreground">User-facing preview</DialogTitle>
          </DialogHeader>
          <div className={`rounded-2xl ${highlight ? 'border-2 border-primary shadow-lg' : 'border border-border'} bg-card p-6 relative`}>
            {highlight && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                {plan.is_best_value ? 'Best Value' : 'Most Popular'}
              </Badge>
            )}
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
              {plan.tier === 'pro_plus' && <Crown className="w-4 h-4 text-amber-500" />}
            </div>
            {plan.tagline && (
              <p className="text-xs italic text-primary/80 font-medium mt-1 mb-4 min-h-[16px]">
                ✨ {plan.tagline}
              </p>
            )}
            {mrp && mrp > plan.price && (
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-muted-foreground line-through">₹{mrp}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-700 border-0">
                  {Math.round((1 - plan.price / mrp) * 100)}% OFF
                </Badge>
              </div>
            )}
            <div className="flex items-baseline gap-1 mb-1">
              <span className={`text-4xl font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>₹{plan.price}</span>
              <span className="text-sm text-muted-foreground">/{plan.duration_days >= 365 ? 'yr' : 'mo'}</span>
            </div>
            {monthly && <p className="text-xs text-muted-foreground mb-4">≈ ₹{monthly}/month</p>}
            {!monthly && <div className="mb-4" />}
            <ul className="space-y-1.5 mb-5 min-h-[120px]">
              {plan.features.slice(0, 6).map((f, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> <span>{f}</span>
                </li>
              ))}
              {plan.features.length === 0 && (
                <li className="text-xs text-muted-foreground italic">No features added — open "More" to add them.</li>
              )}
            </ul>
            <Button className="w-full h-10 text-sm font-semibold" disabled>
              Choose {plan.name}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Live preview from current edits — matches what users see on /subscription-plans.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};
