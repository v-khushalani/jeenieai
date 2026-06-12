import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Copy, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  applicable_plan_ids: string[];
  max_redemptions: number | null;
  current_redemptions: number;
  max_per_user: number;
  min_amount: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface PlanOption { id: string; name: string; tier: string; }

export const PromoCodesTab: React.FC = () => {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'exhausted'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('subscription_plans').select('id, name, tier').order('display_order'),
    ]);
    if (c.error) toast.error(c.error.message);
    else setCodes((c.data || []) as unknown as PromoCode[]);
    if (p.data) setPlans(p.data as unknown as PlanOption[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (code: PromoCode, active: boolean) => {
    const { error } = await supabase.from('promo_codes').update({ is_active: active }).eq('id', code.id);
    if (error) toast.error(error.message); else { toast.success(active ? 'Activated' : 'Disabled'); load(); }
  };

  const remove = async (code: PromoCode) => {
    if (!confirm(`Delete code "${code.code}"?`)) return;
    const { error } = await supabase.from('promo_codes').delete().eq('id', code.id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); load(); }
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied ${code}`);
  };

  const filtered = codes.filter(c => {
    if (filter === 'active') return c.is_active && (!c.expires_at || new Date(c.expires_at) > new Date()) && (!c.max_redemptions || c.current_redemptions < c.max_redemptions);
    if (filter === 'expired') return c.expires_at && new Date(c.expires_at) < new Date();
    if (filter === 'exhausted') return c.max_redemptions && c.current_redemptions >= c.max_redemptions;
    return true;
  });

  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex gap-1">
          {(['all', 'active', 'expired', 'exhausted'] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} className="text-xs capitalize">
              {f}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <BulkGenerateDialog open={bulkOpen} onOpenChange={setBulkOpen} plans={plans} onDone={load} />
          <CreateCodeDialog open={createOpen} onOpenChange={setCreateOpen} plans={plans} onDone={load} />
        </div>
      </div>

      <div className="grid gap-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No codes match this filter.</p>}
        {filtered.map(c => {
          const expired = c.expires_at && new Date(c.expires_at) < new Date();
          const exhausted = c.max_redemptions && c.current_redemptions >= c.max_redemptions;
          return (
            <Card key={c.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="font-mono font-bold text-sm">{c.code}</code>
                    <Badge variant="outline" className="text-[10px]">
                      {c.discount_type === 'percent' ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                    </Badge>
                    {!c.is_active && <Badge variant="destructive" className="text-[10px]">Disabled</Badge>}
                    {expired && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                    {exhausted && <Badge variant="destructive" className="text-[10px]">Exhausted</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{c.description || '—'}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Used {c.current_redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''} ·
                    Max {c.max_per_user}/user ·
                    {c.applicable_plan_ids.length === 0 ? ' All plans' : ` ${c.applicable_plan_ids.length} plan(s)`} ·
                    {c.expires_at ? ` Expires ${new Date(c.expires_at).toLocaleDateString()}` : ' No expiry'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => copy(c.code)}><Copy className="w-4 h-4" /></Button>
                  <Switch checked={c.is_active} onCheckedChange={(v) => toggle(c, v)} />
                  <Button size="icon" variant="ghost" onClick={() => remove(c)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const CreateCodeDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; plans: PlanOption[]; onDone: () => void }> = ({ open, onOpenChange, plans, onDone }) => {
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percent' as 'percent' | 'flat',
    discount_value: 10, applicable_plan_ids: [] as string[],
    max_redemptions: '', max_per_user: 1, min_amount: 0, expires_at: '',
  });
  const [saving, setSaving] = useState(false);

  const togglePlan = (id: string) => {
    setForm(f => ({ ...f, applicable_plan_ids: f.applicable_plan_ids.includes(id) ? f.applicable_plan_ids.filter(x => x !== id) : [...f.applicable_plan_ids, id] }));
  };

  const create = async () => {
    if (!form.code.trim() || form.discount_value <= 0) { toast.error('Code and value required'); return; }
    setSaving(true);
    const { error } = await supabase.from('promo_codes').insert({
      code: form.code.trim(),
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      applicable_plan_ids: form.applicable_plan_ids,
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      max_per_user: form.max_per_user,
      min_amount: form.min_amount,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: true,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Code created'); onDone(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> New code</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create promo code</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Code</Label>
            <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="WELCOME25" />
          </div>
          <div><Label className="text-xs">Description (admin-only)</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as 'percent' | 'flat' }))}>
                <option value="percent">Percent (%)</option>
                <option value="flat">Flat (₹)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Value</Label>
              <Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Max total uses</Label><Input type="number" placeholder="∞" value={form.max_redemptions} onChange={e => setForm(f => ({ ...f, max_redemptions: e.target.value }))} /></div>
            <div><Label className="text-xs">Max per user</Label><Input type="number" value={form.max_per_user} onChange={e => setForm(f => ({ ...f, max_per_user: Number(e.target.value) }))} /></div>
            <div><Label className="text-xs">Min ₹</Label><Input type="number" value={form.min_amount} onChange={e => setForm(f => ({ ...f, min_amount: Number(e.target.value) }))} /></div>
          </div>
          <div><Label className="text-xs">Expires at</Label><Input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} /></div>
          <div>
            <Label className="text-xs">Applicable plans (empty = all)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {plans.map(p => (
                <button key={p.id} type="button" onClick={() => togglePlan(p.id)}
                  className={`text-[11px] px-2 py-1 rounded border ${form.applicable_plan_ids.includes(p.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  {p.id}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const BulkGenerateDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; plans: PlanOption[]; onDone: () => void }> = ({ open, onOpenChange, onDone }) => {
  const [form, setForm] = useState({
    prefix: 'FOUNDER', count: 10, discount_value: 50, discount_type: 'percent' as 'percent' | 'flat',
    max_per_user: 1, expires_days: 30,
  });
  const [saving, setSaving] = useState(false);

  const rand = (n: number) => Array.from({ length: n }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

  const create = async () => {
    if (form.count < 1 || form.count > 200) { toast.error('1–200 codes per batch'); return; }
    setSaving(true);
    const expires = new Date(); expires.setDate(expires.getDate() + form.expires_days);
    const rows = Array.from({ length: form.count }, () => ({
      code: `${form.prefix}-${rand(5)}`,
      description: `Bulk batch ${new Date().toISOString().slice(0, 10)}`,
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      applicable_plan_ids: [],
      max_redemptions: 1,
      max_per_user: form.max_per_user,
      expires_at: expires.toISOString(),
      is_active: true,
    }));
    const { error } = await supabase.from('promo_codes').insert(rows);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(`Generated ${form.count} codes`); onDone(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Shuffle className="w-4 h-4 mr-1" /> Bulk generate</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Bulk generate codes</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Each code is single-use ({form.prefix}-XXXXX). Useful for first-N-users campaigns or VIP outreach.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Prefix</Label><Input value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase().slice(0, 12) }))} /></div>
            <div><Label className="text-xs">How many codes</Label><Input type="number" value={form.count} onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Discount type</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as 'percent' | 'flat' }))}>
                <option value="percent">%</option>
                <option value="flat">₹</option>
              </select>
            </div>
            <div><Label className="text-xs">Value</Label><Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} /></div>
            <div><Label className="text-xs">Valid days</Label><Input type="number" value={form.expires_days} onChange={e => setForm(f => ({ ...f, expires_days: Number(e.target.value) }))} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={create} disabled={saving}>{saving ? 'Generating…' : `Generate ${form.count}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
