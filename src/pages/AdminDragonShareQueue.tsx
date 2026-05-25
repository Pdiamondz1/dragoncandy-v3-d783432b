import { useState } from 'react';
import { safeUrl } from '@/lib/safeUrl';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAdminDragonShareQueue, useVerifyDragonSharePost } from '@/hooks/useDragonShare';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, ExternalLink, Loader2 } from 'lucide-react';
import { ResolvedAvatar } from '@/components/ui/resolved-avatar';
import type { UserRole } from '@/types/user';

const AdminDragonShareQueue: React.FC = () => {
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) ?? 'content_creator';
  const { data: posts, isLoading } = useAdminDragonShareQueue();
  const verifyMutation = useVerifyDragonSharePost();
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  async function handleApprove(postId: string) {
    try {
      await verifyMutation.mutateAsync({ postId, action: 'approve' });
      toast({ title: 'Post approved', description: 'It\'s now visible to the target brand.' });
    } catch (err) {
      toast({ title: 'Approval failed', description: String(err), variant: 'destructive' });
    }
  }

  async function handleReject(postId: string) {
    try {
      await verifyMutation.mutateAsync({ postId, action: 'reject', rejectionReason });
      toast({ title: 'Post rejected', description: 'Creator has been notified.' });
      setRejectingId(null);
      setRejectionReason('');
    } catch (err) {
      toast({ title: 'Rejection failed', description: String(err), variant: 'destructive' });
    }
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader>
          <div>
            <h1 className="text-2xl font-bold">DragonShare Verification Queue</h1>
            <p className="text-sm text-muted-foreground">
              {posts?.length ?? 0} posts awaiting verification
            </p>
          </div>
        </PageHeader>
        <div className="px-4 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : (posts ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-green-400 mb-3" />
            <p className="font-medium">Queue is empty</p>
            <p className="text-sm text-muted-foreground">All posts have been reviewed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(posts ?? []).map((post) => (
              <div key={post.id} className="rounded-2xl border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ResolvedAvatar
                      path={post.creator?.avatar_url}
                      alt="Creator avatar"
                      fallback={<span className="text-sm font-bold text-teal-600">{post.creator?.full_name?.charAt(0) ?? '?'}</span>}
                      className="h-10 w-10 ring-2 ring-teal-400"
                      fallbackClassName="bg-teal-100"
                    />
                    <div>
                      <p className="font-medium">{post.creator?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{post.platform} · {post.content_type}</p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">{post.target_org?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(post.submitted_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {post.caption && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
                )}

                <a
                  href={safeUrl(post.post_url) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-teal-600 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View original post
                </a>

                {rejectingId === post.id ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Rejection reason…"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleReject(post.id)}
                        disabled={!rejectionReason.trim() || verifyMutation.isPending}
                      >
                        {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Reject'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setRejectingId(null); setRejectionReason(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => handleApprove(post.id)}
                      disabled={verifyMutation.isPending}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setRejectingId(post.id)}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminDragonShareQueue;
