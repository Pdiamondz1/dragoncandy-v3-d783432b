import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePromotions } from '@/hooks/usePromotions';
import { Search, CheckCircle, XCircle, Ticket, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export const VerifyCodesTab: React.FC = () => {
  const { discountCodes, isLoading, redeemCode } = usePromotions();
  const [searchCode, setSearchCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    if (!searchCode.trim()) return;
    setVerifying(true);
    try {
      await redeemCode.mutateAsync(searchCode.trim());
      setSearchCode('');
    } finally {
      setVerifying(false);
    }
  };

  const filteredCodes = discountCodes?.filter(code => 
    code.code.toLowerCase().includes(searchCode.toLowerCase()) ||
    code.customer_email.toLowerCase().includes(searchCode.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Verify Code Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Verify & Redeem Code
          </CardTitle>
          <CardDescription>
            Enter a discount code to verify and mark it as redeemed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter discount code..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              className="font-mono text-lg tracking-wider"
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            />
            <Button onClick={handleVerify} disabled={!searchCode.trim() || verifying}>
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Verify
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Codes History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Discount Code History</CardTitle>
          <CardDescription>
            All generated discount codes and their redemption status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No discount codes generated yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Promotion</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Redeemed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCodes.map(code => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono font-medium">
                      {code.code}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{code.customer_email}</div>
                        <div className="text-muted-foreground">{code.customer_phone}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {code.promotion?.title || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {code.is_redeemed ? (
                        <Badge className="bg-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Redeemed
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <XCircle className="h-3 w-3 mr-1" />
                          Unused
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(code.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {code.redeemed_at 
                        ? format(new Date(code.redeemed_at), 'MMM d, h:mm a') 
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
