import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search, Shield, User, Gift, Crown, XCircle, Trash2,
  GraduationCap, RefreshCw, AlertTriangle, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

type Tier = 'free' | 'pro' | 'pro_plus';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  joined_at: string;
  grade?: number;
  target_exam?: string;
  role?: 'user' | 'admin' | 'educator' | 'super_admin';
  is_premium?: boolean;
  subscription_tier?: Tier;
  subscription_plan?: string | null;
  subscription_end_date?: string | null;
  educator_approved?: boolean;
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantTarget, setGrantTarget] = useState<UserProfile | null>(null);
  const [grantTier, setGrantTier] = useState<'pro' | 'pro_plus'>('pro');
  const [grantDays, setGrantDays] = useState<number>(30);
  const [granting, setGranting] = useState(false);
  const [missingRolesCount, setMissingRolesCount] = useState(0);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.rpc('admin_list_profiles' as any),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const approvalMap = new Map(((profilesRes.data as any[]) || []).map((p: any) => [p.id, p.educator_approved]));

      const rolesMap = new Map(rolesRes.data?.map(r => [r.user_id, r.role]) || []);
      const missing = ((profilesRes.data as any[]) || []).filter((p: any) => !rolesMap.has(p.id)).length;
      setMissingRolesCount(missing);

      setUsers((((profilesRes.data as any[]) || []) as any[]).map((p: any) => {
        const dbRole = rolesMap.get(p.id);
        const nameFlagged = (p.full_name || '').toLowerCase().includes('(educator)');
        
        // Infer educator role if flagged in name but missing/student in roles table
        let displayRole = dbRole === 'student' ? 'user' : (dbRole as any) || 'user';
        if (displayRole === 'user' && nameFlagged) {
          displayRole = 'educator';
        }

        return {
          id: p.id, user_id: p.id,
          email: p.email || 'No email',
          full_name: p.full_name || 'No name',
          joined_at: p.created_at,
          grade: p.grade, target_exam: p.target_exam,
          role: displayRole,
          is_premium: p.is_premium || false,
          subscription_end_date: p.subscription_end_date,
          educator_approved: approvalMap.get(p.id) || false,
        };
      }));
    } catch (error) {
      logger.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = useCallback(() => {
    let filtered = users;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(u =>
        u.email?.toLowerCase().includes(term) || u.full_name?.toLowerCase().includes(term)
      );
    }
    if (roleFilter !== 'all') {
      if (roleFilter === 'pending_educator') {
        filtered = filtered.filter(u => u.role === 'educator' && !u.educator_approved);
      } else {
        filtered = filtered.filter(u => u.role === roleFilter);
      }
    }
    setFilteredUsers(filtered);
  }, [users, searchTerm, roleFilter]);

  useEffect(() => { filterUsers(); }, [filterUsers]);

  const syncMissingRoles = async () => {
    setSyncing(true);
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('id'),
        supabase.from('user_roles').select('user_id'),
      ]);
      const roleSet = new Set(rolesRes.data?.map(r => r.user_id) || []);
      const missing = (profilesRes.data || []).filter(p => !roleSet.has(p.id));
      if (missing.length === 0) { toast.success('All users have roles'); setSyncing(false); return; }
      const { error } = await supabase.from('user_roles').insert(
        missing.map(p => ({ user_id: p.id, role: 'student' as const }))
      );
      if (error) throw error;
      toast.success(`Assigned student role to ${missing.length} user(s)`);
      fetchUsers();
    } catch (error) {
      logger.error('Sync error:', error);
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: 'user' | 'admin' | 'educator' | 'super_admin') => {
    try {
      const dbRole = newRole === 'user' ? 'student' : newRole;
      // user_roles unique is (user_id, role) — replace by delete-then-insert
      const delRes = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (delRes.error) throw delRes.error;
      const insRes = await supabase.from('user_roles').insert([{ user_id: userId, role: dbRole as any }]);
      if (insRes.error) throw insRes.error;
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
      toast.success(`Role updated to ${newRole}`);
    } catch (error) {
      logger.error('Role update error:', error);
      toast.error('Failed to update role');
    }
  };

  const openGrantDialog = (user: UserProfile) => {
    setGrantTarget(user);
    setGrantTier((user.subscription_tier === 'pro_plus' ? 'pro_plus' : 'pro'));
    setGrantDays(30);
    setGrantDialogOpen(true);
  };

  const confirmGrant = async () => {
    if (!grantTarget) return;
    setGranting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-grant-subscription', {
        body: { action: 'grant', userId: grantTarget.user_id, tier: grantTier, days: grantDays },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');
      setUsers(prev => prev.map(u =>
        u.user_id === grantTarget.user_id
          ? { ...u, is_premium: true, subscription_tier: grantTier, subscription_end_date: data.subscription_end_date }
          : u
      ));
      toast.success(`${grantTier === 'pro_plus' ? 'Pro+' : 'Pro'} granted for ${grantDays} day(s)`);
      setGrantDialogOpen(false);
    } catch (err: any) {
      logger.error('Grant error:', err);
      toast.error(err.message || 'Failed to grant');
    } finally {
      setGranting(false);
    }
  };

  const revokeProMembership = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-grant-subscription', {
        body: { action: 'revoke', userId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');
      setUsers(prev => prev.map(u =>
        u.user_id === userId
          ? { ...u, is_premium: false, subscription_tier: 'free', subscription_end_date: null }
          : u
      ));
      toast.success('Pro membership revoked');
    } catch (error: any) {
      logger.error('Revoke error:', error);
      toast.error(error.message || 'Failed to revoke');
    }
  };

  const toggleEducatorApproval = async (userId: string, currentStatus: boolean, userRole?: string) => {
    try {
      // If we're approving and they aren't marked as educator in user_roles, fix that first
      if (!currentStatus && userRole !== 'educator') {
        await supabase
          .from('user_roles')
          .upsert([{ user_id: userId, role: 'educator' }], { onConflict: 'user_id' });
      }

      const { error } = await supabase.from('profiles')
        .update({ educator_approved: !currentStatus } as any)
        .eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u =>
        u.user_id === userId ? { ...u, educator_approved: !currentStatus, role: 'educator' } : u
      ));
      toast.success(currentStatus ? 'Educator access revoked' : 'Educator approved');
    } catch (error) {
      logger.error('Toggle approval error:', error);
      toast.error('Failed to update educator approval');
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      setDeleting(true);
      const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Deletion failed');
      setUsers(prev => prev.filter(u => u.user_id !== userId));
      toast.success('User deleted');
    } catch (error) {
      logger.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const toggleSelectUser = (userId: string) => {
    const next = new Set(selectedUsers);
    next.has(userId) ? next.delete(userId) : next.add(userId);
    setSelectedUsers(next);
  };

  const toggleSelectAll = () => {
    setSelectedUsers(
      selectedUsers.size === filteredUsers.length
        ? new Set()
        : new Set(filteredUsers.map(u => u.user_id))
    );
  };

  const getRoleIcon = (role?: string) => {
    if (role === 'super_admin') return <Shield className="h-4 w-4 text-destructive" />;
    if (role === 'admin') return <Shield className="h-4 w-4 text-primary" />;
    if (role === 'educator') return <GraduationCap className="h-4 w-4 text-primary" />;
    return <User className="h-4 w-4 text-muted-foreground" />;
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
      {/* Section title is shown in Admin shell header; keep supporting summary only. */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {users.length} total users · {users.filter(u => u.is_premium).length} premium
          </p>
        </div>
        <div className="flex items-center gap-2">
          {users.filter(u => u.role === 'educator' && !u.educator_approved).length > 0 && (
            <Badge variant="outline" className="text-xs gap-1 border-amber-500/40 text-amber-600 bg-amber-50">
              <AlertTriangle className="h-3 w-3" />
              {users.filter(u => u.role === 'educator' && !u.educator_approved).length} pending educator(s)
            </Badge>
          )}
          {missingRolesCount > 0 && (
            <Badge variant="outline" className="text-xs gap-1 border-destructive/40 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {missingRolesCount} missing roles
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={syncMissingRoles} disabled={syncing} className="gap-1.5 text-xs">
            <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            Sync Roles
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="user">Students</SelectItem>
            <SelectItem value="educator">Educators</SelectItem>
            <SelectItem value="pending_educator">Pending Educators</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {selectedUsers.size} user(s) selected
          </span>
          <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete Selected
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell">Exam</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(user => (
                    <TableRow key={user.user_id} className={cn(selectedUsers.has(user.user_id) && 'bg-destructive/5')}>
                      <TableCell>
                        <Checkbox
                          checked={selectedUsers.has(user.user_id)}
                          onCheckedChange={() => toggleSelectUser(user.user_id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          {getRoleIcon(user.role)}
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{user.full_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {user.target_exam || 'N/A'}{user.grade ? ` · ${user.grade}` : ''}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(user.joined_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {user.is_premium ? (
                            <Badge className="bg-primary/10 text-primary text-[10px] border-0">
                              <Crown className="h-3 w-3 mr-0.5" /> Pro
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Free</Badge>
                          )}
                          {user.role === 'educator' && !user.educator_approved && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 text-[10px]">Pending Approval</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role || 'user'}
                          onValueChange={v => updateUserRole(user.user_id, v as any)}
                        >
                          <SelectTrigger className="w-[100px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Student</SelectItem>
                            <SelectItem value="educator">Educator</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {(user.role === 'educator' || user.full_name.toLowerCase().includes('(educator)')) && (
                            <Button 
                              size="sm" 
                              variant={user.educator_approved ? "outline" : "default"}
                              className={cn("h-7 text-xs px-2", user.educator_approved ? "text-muted-foreground" : "bg-green-600 hover:bg-green-700")}
                              onClick={() => toggleEducatorApproval(user.user_id, !!user.educator_approved, user.role)}>
                              {user.educator_approved ? "Revoke Access" : "Approve Educator"}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                            onClick={() => openGrantDialog(user)}>
                            <Gift className="h-3 w-3" /> {user.is_premium ? 'Edit' : 'Grant'}
                          </Button>
                          {user.is_premium && (
                            <Button size="sm" variant="ghost"
                              className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                              onClick={() => revokeProMembership(user.user_id)}>
                              <XCircle className="h-3 w-3" /> Revoke
                            </Button>
                          )}
                          <Button size="sm" variant="ghost"
                            className="h-7 text-destructive hover:text-destructive"
                            onClick={() => { setUserToDelete(user); setDeleteDialogOpen(true); }}
                            disabled={deleting}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete User(s)?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {userToDelete ? (
                <p>Delete <strong>{userToDelete.full_name}</strong> ({userToDelete.email})?</p>
              ) : (
                <p>Delete {selectedUsers.size} selected user(s)?</p>
              )}
              <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg mt-3">
                <p className="text-sm font-medium text-foreground">⚠️ This cannot be undone.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Removes from auth, profiles, and all activity data.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete ? deleteUser(userToDelete.user_id) : null}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grant Pro Dialog */}
      <AlertDialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              {grantTarget && (
                <span className="text-xs">For <strong>{grantTarget.full_name}</strong> ({grantTarget.email})</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-foreground">Plan</label>
              <Select value={grantTier} onValueChange={v => setGrantTier(v as 'pro' | 'pro_plus')}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="pro_plus">Pro+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Duration (days)</label>
              <Input
                type="number" min={1} max={3650} value={grantDays}
                onChange={e => setGrantDays(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1"
              />
              <div className="flex gap-1 mt-2">
                {[7, 30, 90, 180, 365].map(d => (
                  <Button key={d} type="button" size="sm" variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setGrantDays(d)}>
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={granting}>Cancel</AlertDialogCancel>
            <Button onClick={confirmGrant} disabled={granting}>
              {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Grant'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
