
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Share2, UserPlus, Trash2, Eye, Download, Edit, Calendar } from 'lucide-react';
import { useFilePermissions } from '@/hooks/useFileOperations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { FileUpload } from '@/types/files';

interface FilePermissionsDialogProps {
  file: FileUpload;
  isOpen: boolean;
  onClose: () => void;
}

const FilePermissionsDialog: React.FC<FilePermissionsDialogProps> = ({
  file,
  isOpen,
  onClose
}) => {
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newPermissionType, setNewPermissionType] = useState<'view' | 'download' | 'edit' | 'delete' | 'share'>('view');
  const [expiryDate, setExpiryDate] = useState('');
  
  const { grantPermission, revokePermission } = useFilePermissions();

  const handleGrantPermission = async () => {
    if (!newUserEmail.trim()) return;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', newUserEmail.trim().toLowerCase())
      .maybeSingle();

    if (error || !profile) {
      toast({
        title: 'User not found',
        description: 'No account found with that email address.',
        variant: 'destructive',
      });
      return;
    }

    await grantPermission.mutateAsync({
      file_upload_id: file.id,
      user_id: profile.id,
      permission_type: newPermissionType,
      expires_at: expiryDate || undefined
    });

    setNewUserEmail('');
    setExpiryDate('');
  };

  const handleRevokePermission = async (permissionId: string) => {
    await revokePermission.mutateAsync(permissionId);
  };

  const getPermissionIcon = (type: string) => {
    switch (type) {
      case 'view': return <Eye className="h-4 w-4" />;
      case 'download': return <Download className="h-4 w-4" />;
      case 'edit': return <Edit className="h-4 w-4" />;
      case 'delete': return <Trash2 className="h-4 w-4" />;
      case 'share': return <Share2 className="h-4 w-4" />;
      default: return <Eye className="h-4 w-4" />;
    }
  };

  const getPermissionColor = (type: string) => {
    switch (type) {
      case 'view': return 'secondary';
      case 'download': return 'default';
      case 'edit': return 'outline';
      case 'delete': return 'destructive';
      case 'share': return 'default';
      default: return 'secondary';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share "{file.original_filename}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Grant New Permission */}
          <Card className="p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Grant Access
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">User Email</label>
                <Input
                  type="email"
                  placeholder="Enter user email..."
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Permission Type</label>
                  <Select value={newPermissionType} onValueChange={(value: any) => setNewPermissionType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View Only</SelectItem>
                      <SelectItem value="download">Download</SelectItem>
                      <SelectItem value="edit">Edit</SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                      <SelectItem value="share">Share</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Expires (Optional)</label>
                  <Input
                    type="datetime-local"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              </div>
              
              <Button
                onClick={handleGrantPermission}
                disabled={!newUserEmail.trim() || grantPermission.isPending}
                className="w-full"
              >
                Grant Access
              </Button>
            </div>
          </Card>

          {/* Current Permissions */}
          <div>
            <h3 className="font-medium mb-4">Current Permissions</h3>
            
            {file.permissions && file.permissions.length > 0 ? (
              <div className="space-y-3">
                {file.permissions.map((permission) => (
                  <Card key={permission.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={permission.user_profile?.avatar_url || ''} />
                          <AvatarFallback>
                            {permission.user_profile?.full_name?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div>
                          <p className="font-medium text-sm">
                            {permission.user_profile?.full_name || 'Unknown User'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant={getPermissionColor(permission.permission_type) as any}
                              className="text-xs"
                            >
                              {getPermissionIcon(permission.permission_type)}
                              <span className="ml-1 capitalize">{permission.permission_type}</span>
                            </Badge>
                            
                            {permission.expires_at && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  Expires {new Date(permission.expires_at).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokePermission(permission.id)}
                        disabled={revokePermission.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <p className="text-gray-500">No additional permissions granted</p>
                <p className="text-sm text-gray-400 mt-1">
                  Only you can access this file
                </p>
              </Card>
            )}
          </div>

          {/* Public Sharing */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Public Access</h4>
                <p className="text-sm text-gray-500">
                  {file.is_public 
                    ? 'Anyone with the link can view this file'
                    : 'File is private and secure'
                  }
                </p>
              </div>
              
              <Badge variant={file.is_public ? 'default' : 'secondary'}>
                {file.is_public ? 'Public' : 'Private'}
              </Badge>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FilePermissionsDialog;
