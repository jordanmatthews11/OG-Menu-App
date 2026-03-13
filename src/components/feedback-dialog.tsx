
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usePathname } from 'next/navigation';
import { Loader2, Bug, Lightbulb, MessageSquare } from 'lucide-react';
import { useFirestore, useUser, errorEmitter } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const feedbackSchema = z.object({
  name: z.string().min(2, { message: "Please enter your name." }),
  feedbackType: z.enum(["problem", "feature", "general"]),
  description: z.string().min(10, {
    message: 'Feedback must be at least 10 characters.',
  }),
  details: z.string().optional(),
  email: z.string().email({ message: "Please enter a valid email address." }).optional().or(z.literal('')),
});

type FeedbackFormValues = z.infer<typeof feedbackSchema>;

const feedbackTypes = [
  { id: 'problem', icon: Bug, label: 'Report a problem' },
  { id: 'feature', icon: Lightbulb, label: 'Suggest a feature' },
  { id: 'general', icon: MessageSquare, label: 'General feedback' },
];

export function FeedbackDialog({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const pathname = usePathname();
  const firestore = useFirestore();
  const { user } = useUser();

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      name: "",
      feedbackType: 'general',
      description: '',
      details: '',
      email: '',
    },
  });

  useEffect(() => {
    if (user && isOpen) {
      form.reset({
        name: user.displayName || '',
        email: user.email || '',
        feedbackType: 'general',
        description: '',
        details: '',
      });
    } else if (!user && isOpen) {
      form.reset({
        name: '',
        email: '',
        feedbackType: 'general',
        description: '',
        details: '',
      });
    }
  }, [user, isOpen, form]);

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FeedbackFormValues) {
    if (!firestore) {
        toast({
            variant: 'destructive',
            title: 'Uh oh! Something went wrong.',
            description: 'Could not connect to the database. Please try again.',
        });
        return;
    }
    
    const feedbackId = `feedback-${Date.now()}`;
    const feedbackRef = doc(firestore, 'feedback', feedbackId);

    const feedbackData = {
      id: feedbackId,
      timestamp: new Date().toISOString(),
      name: values.name,
      feedbackType: values.feedbackType,
      description: values.description,
      details: values.details || '',
      email: values.email || '',
      page: pathname,
      status: 'New',
    };

    setDoc(feedbackRef, feedbackData)
        .then(() => {
            toast({
                title: 'Feedback Submitted!',
                description: "Thank you! The team will be notified (Slack notifications are batched and sent every 15 minutes).",
            });
            form.reset();
            setIsOpen(false);
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: feedbackRef.path,
                operation: 'create',
                requestResourceData: feedbackData,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Give Feedback</DialogTitle>
          <DialogDescription className="text-xs">
            Have an idea or found something that could be better? Let us know!
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Name</FormLabel>
                  <FormControl>
                    <Input id="feedback-name" autoComplete="name" placeholder="Jane Doe" {...field} className="text-xs h-9" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="feedbackType"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-xs">What kind of feedback would you like to share?</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-3 gap-2"
                    >
                      {feedbackTypes.map((item) => (
                        <FormItem key={item.id}>
                          <FormControl>
                            <RadioGroupItem value={item.id} id={`feedbackType-${item.id}`} className="sr-only" />
                          </FormControl>
                          <FormLabel
                            htmlFor={`feedbackType-${item.id}`}
                            className={cn(
                              "flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                              field.value === item.id && "border-primary"
                            )}
                          >
                            <item.icon className="h-5 w-5 mb-1" />
                            <span className="text-xs">{item.label}</span>
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Please describe your feedback.</FormLabel>
                  <FormControl>
                    <Textarea
                      id="feedback-description"
                      placeholder="What's on your mind? Be as detailed as you'd like."
                      className="resize-y text-xs"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Any details that would help us understand better? <span className="text-muted-foreground">(Optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      id="feedback-details"
                      placeholder="e.g., Steps to reproduce, examples, screenshots, etc."
                      className="resize-y text-xs"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Email <span className="text-muted-foreground">(Optional, if you’d like us to follow up)</span></FormLabel>
                  <FormControl>
                    <Input 
                      id="feedback-email"
                      autoComplete="email"
                      placeholder="you@example.com" {...field} className="text-xs h-9" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" size="sm">
                        Cancel
                    </Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting} size="sm">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Feedback
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
