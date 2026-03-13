
"use client";

import { useState } from 'react';
import SupportForm from '@/components/support-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink } from 'lucide-react';

export default function SupportPage() {
    const [showDialog, setShowDialog] = useState(true);

    return (
        <div className="container mx-auto max-w-4xl">
            <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base font-bold">New Support Portal Available</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                            We've launched a new support portal for a better experience. Would you like to submit your ticket through the new dashboard?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="sm:justify-between">
                        <AlertDialogCancel onClick={() => setShowDialog(false)} className="text-[11px] h-8">
                            No thanks, continue here
                        </AlertDialogCancel>
                        <AlertDialogAction asChild className="text-[11px] h-8">
                            <a 
                                href="https://storesight-support-two.vercel.app/dashboard" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2"
                            >
                                Take me to the new portal
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex justify-between items-center mb-4">
                <div className="space-y-1">
                    <h1 className="text-sm font-bold tracking-tight">Submit a Support Ticket</h1>
                    <p className="text-[11px] text-muted-foreground">Submit a request to the operations team.</p>
                </div>
            </div>
            <SupportForm />
        </div>
    );
}
