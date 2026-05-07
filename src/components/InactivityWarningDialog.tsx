import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import logo from '@/assets/Transparent_DragonCandy_logo.webp';

interface InactivityWarningDialogProps {
  open: boolean;
  onConfirm: () => void;
}

export const InactivityWarningDialog: React.FC<InactivityWarningDialogProps> = ({
  open,
  onConfirm,
}) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-sm rounded-2xl">
        <AlertDialogHeader className="items-center text-center">
          <img src={logo} alt="DragonCandy" className="w-14 h-14 mx-auto mb-1 opacity-80" />
          <AlertDialogTitle className="text-lg">Are you still there?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-500">
            You've been inactive for a while. For your security, you'll be signed out in 15 minutes unless you confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction
            onClick={onConfirm}
            className="w-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full font-bold"
          >
            I'm still here
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
