import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Send, Plus, Bell, Users, Crown, UserCircle, Trash2, Loader2 } from 'lucide-react';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  target_audience: string;
  created_at: string;
  scheduled_at: string;
  status: string;
}

export const NotificationManager: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', message: '', targetAudience: 'all', scheduleDate: '',
  });

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      logger.error('Error loading notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error('Title and message are required');
      return;
    }
    setSending(true);
    try {
      // 1. Insert admin notification record
      const { data: notifData, error: insertError } = await supabase
        .from('admin_notifications')
        .insert({
          title: form.title,
          body: form.message,
          message: form.message,
          target_audience: form.targetAudience,
          sent_by: user?.id,
          scheduled_at: form.scheduleDate || new Date().toISOString(),
          status: form.scheduleDate ? 'scheduled' : 'sent',
        })
        .select().single();
      if (insertError) throw insertError;

      // 2. Get target user IDs based on audience
      let targetUserIds: string[] = [];
      if (form.targetAudience === 'all') {
        const { data } = await supabase.from('profiles').select('id');
        targetUserIds = data?.map(u => u.id) || [];
      } else if (form.targetAudience === 'free') {
        const { data } = await supabase.from('profiles').select('id')
          .or('subscription_tier.eq.free,subscription_tier.is.null');
        targetUserIds = data?.map(u => u.id) || [];
      } else if (form.targetAudience === 'premium') {
        const { data } = await supabase.from('profiles').select('id')
          .in('subscription_tier', ['pro', 'pro_plus']);
        targetUserIds = data?.map(u => u.id) || [];
      }

      // 3. Insert in-app notifications for each user
      if (targetUserIds.length > 0) {
        await supabase.from('user_notifications').insert(
          targetUserIds.map(uid => ({
            user_id: uid, notification_id: notifData.id,
            title: form.title, message: form.message,
          }))
        );
      }

      // 4. Send push notifications via edge function (non-blocking)
      if (!form.scheduleDate) {
        try {
          const { data: pushResult, error: pushError } = await supabase.functions.invoke(
            'send-push-notification',
            {
              body: {
                title: form.title,
                message: form.message,
                user_ids: targetUserIds.length > 0 ? targetUserIds : undefined,
              },
            }
          );

          if (pushError) {
            logger.error('Push notification error:', pushError);
            toast.warning('In-app notification sent, but push delivery had issues');
          } else {
            const sent = pushResult?.sent || 0;
            const failed = pushResult?.failed || 0;
            logger.info(`Push results: ${sent} sent, ${failed} failed`);
            if (sent > 0) {
              toast.success(`Notification sent to ${targetUserIds.length} users (${sent} push delivered)`);
            } else {
              toast.success(`In-app notification sent to ${targetUserIds.length} users (no push subscriptions)`);
            }
          }
        } catch (pushErr) {
          logger.error('Push function invoke failed:', pushErr);
          toast.success(`In-app notification sent to ${targetUserIds.length} users`);
        }
      } else {
        toast.success(`Notification scheduled for ${targetUserIds.length} users`);
      }

      setForm({ title: '', message: '', targetAudience: 'all', scheduleDate: '' });
      setDialogOpen(false);
      loadNotifications();
    } catch (error) {
      logger.error('Error sending notification:', error);
      toast.error('Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const deleteNotification = async (id: string) => {
    const { error } = await supabase.from('admin_notifications').delete().eq('id', id);
    if (error) { toast.error('Delete failed'); return; }
    toast.success('Notification deleted');
    loadNotifications();
  };

  const audienceIcon = (a: string) => {
    if (a === 'premium') return <Crown className="h-3.5 w-3.5 text-primary" />;
    if (a === 'free') return <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    return <Users className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send announcements and updates to users
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Create
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{notifications.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{notifications.filter(n => n.status === 'sent').length}</p>
            <p className="text-xs text-muted-foreground">Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{notifications.filter(n => n.status === 'scheduled').length}</p>
            <p className="text-xs text-muted-foreground">Scheduled</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Message</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No notifications yet. Create your first one!
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map(n => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <p className="font-medium text-sm text-foreground">{n.title}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">{n.message}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {audienceIcon(n.target_audience)}
                        <span className="text-xs capitalize text-muted-foreground">{n.target_audience}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={n.status === 'sent' ? 'default' : 'outline'}
                        className={cn(
                          'text-[10px]',
                          n.status === 'sent' && 'bg-primary/10 text-primary border-0',
                          n.status === 'scheduled' && 'border-muted-foreground/30'
                        )}
                      >
                        {n.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteNotification(n.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Notification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., JEE Mains Registration Open" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea value={form.message} rows={4}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Write your announcement..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target Audience</Label>
              <Select value={form.targetAudience} onValueChange={v => setForm(f => ({ ...f, targetAudience: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="free">Free Users</SelectItem>
                  <SelectItem value="premium">Premium Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Schedule (optional)</Label>
              <Input type="datetime-local" value={form.scheduleDate}
                onChange={e => setForm(f => ({ ...f, scheduleDate: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">Leave empty to send immediately</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={sendNotification} disabled={sending} className="gap-2">
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              <Send className="w-4 h-4" />
              {form.scheduleDate ? 'Schedule' : 'Send Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
