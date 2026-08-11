import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, UserPlus, Check } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useLocalization } from '@/contexts/LocalizationContext';
import { apiGet } from '@/lib/apiClient';

// Real workspace directory — the previous version showed seven hard-coded
// fictional employees and discarded the invite.
interface DirectoryUser {
  id: string;
  name: string;
  job_title: string;
  avatar: string;
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (userId: string) => void;
}

export function InviteModal({ isOpen, onClose, onInvite }: InviteModalProps) {
  const { t } = useLocalization();
  const [searchTerm, setSearchTerm] = useState('');
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      apiGet<{ users: DirectoryUser[] }>('/meetings/users')
        .then(res => { if (!cancelled) setUsers(res.users || []); })
        .catch(() => { if (!cancelled) setUsers([]); })
        .finally(() => { if (!cancelled) setIsLoading(false); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  const q = searchTerm.trim().toLowerCase();
  const filteredEmployees = users.filter(u =>
    !q || u.name.toLowerCase().includes(q) || u.job_title.toLowerCase().includes(q)
  );

  const handleInvite = (id: string) => {
    onInvite(id);
    setInvitedIds(prev => [...prev, id]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('meetings.inviteModalTitle')}</DialogTitle>
          <DialogDescription>
            {t('meetings.inviteModalDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="relative my-4">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('meetings.searchEmployees')}
            className="ps-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('meetings.loadingUsers')}
            </div>
          ) : filteredEmployees.length > 0 ? filteredEmployees.map(emp => (
            <div key={emp.id} className="flex items-center justify-between rounded-[var(--radius-control)] border border-border bg-muted/50 p-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={emp.avatar} />
                  <AvatarFallback className="bg-brand/10 text-brand font-semibold text-sm">
                    {emp.name.substring(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-semibold text-foreground">{emp.name}</div>
                  <div className="text-xs text-muted-foreground">{emp.job_title}</div>
                </div>
              </div>
              <Button
                variant={invitedIds.includes(emp.id) ? "secondary" : "default"}
                size="sm"
                className="gap-1 rounded-full px-4"
                disabled={invitedIds.includes(emp.id)}
                onClick={() => handleInvite(emp.id)}
              >
                {invitedIds.includes(emp.id) ? (
                  <>
                    <Check className="h-4 w-4" />
                    {t('meetings.invited')}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    {t('meetings.sendInvite')}
                  </>
                )}
              </Button>
            </div>
          )) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('meetings.noEmployeesFound')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
