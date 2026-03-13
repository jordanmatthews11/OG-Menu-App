
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, AlertTriangle, Wand2, CalendarIcon } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { StarRating } from "@/components/ui/star-rating";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { supportFormSchema } from "@/lib/schemas";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { useFirestore, useCollection, useMemoFirebase, useUser, errorEmitter } from "@/firebase";
import { collection, doc, setDoc } from 'firebase/firestore';
import type { Category, CustomCategoryCode, SupportRequest } from "@/lib/types";
import { countries } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';


function DatePicker({
    date,
    onDateChange,
    disabled,
    placeholder
}: {
    date?: Date;
    onDateChange: (date?: Date) => void;
    disabled?: any;
    placeholder: string;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                        "w-full justify-start text-left font-normal h-8 text-[11px]",
                        !date && "text-muted-foreground"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PP") : <span>{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={onDateChange}
                    disabled={disabled}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
}

export default function SupportForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const { data: categories, isLoading: isLoadingCategories } = useCollection<Category>(useMemoFirebase(() => firestore ? collection(firestore, 'categories') : null, [firestore]));
  const { data: customCodes, isLoading: isLoadingCustomCodes } = useCollection<CustomCategoryCode>(useMemoFirebase(() => firestore ? collection(firestore, 'customCategoryCodes') : null, [firestore]));

  const form = useForm<z.infer<typeof supportFormSchema>>({
    resolver: zodResolver(supportFormSchema),
    defaultValues: {
      name: "",
      urgency: 3,
      assistanceType: "support",
      // Support Fields
      support_issueType: "",
      support_customer: "",
      support_dashboardType: "",
      support_description: "",
      support_specialInstructions: "",
      support_collectionCountry: "",
      support_collectionStartDate: undefined,
      support_collectionEndDate: undefined,
      support_collectionLocations: undefined,
      // Private Space Fields
      privateSpace_name: "",
      privateSpace_domains: "",
      privateSpace_collections: "",
      privateSpace_specialInstructions: "",
      // Custom Category Fields
      customCategory_customer: "",
      customCategory_category: "",
      customCategory_code: "",
      customCategory_jobIds: "",
      customCategory_notes: "",
    },
  });

  useEffect(() => {
    if (user) {
        form.setValue('name', user.displayName || '');
    }
  }, [user, form]);


  const assistanceType = form.watch("assistanceType");
  const supportIssueType = form.watch("support_issueType");
  const urgencyValue = form.watch("urgency");

  const hideDashboardTypeQuestion = 
    supportIssueType === "Ops - Category Question (legacy 'Project Classify')" ||
    supportIssueType === "Ops - Store List" ||
    supportIssueType === "Ops - Stop Collection" ||
    supportIssueType === "Ops - Brand tagging" ||
    supportIssueType === "Ops - Mistagged Locations" ||
    supportIssueType === "Ops - Category Management" ||
    supportIssueType === "Other" ||
    supportIssueType === "Special Collection Request/Category Discovery";

  const descriptionLabel = useMemo(() => {
    switch (supportIssueType) {
        case "Special Collection Request/Category Discovery":
            return "List each Category that needs to be collected, as well as each retailer that need to be visited.";
        case "Ops - Category Question (legacy 'Project Classify')":
        case "Ops - Category Management":
            return "List the category in question and a detailed description of this issue/question";
        case "Ops - Stop Collection":
            return "List the collecton/category that needs to stop and a detailed explanation of the reason";
        case "Ops - Brand tagging":
            return "List the brand(s). Tell us if this is a new tag or if an existing tag needs to be updated";
        case "Ops - Store List":
            return "Please provide a detailed description of this store list issue";
        case "Ops - Data Quality":
            return "Tell us where you're seeing data quality issues. Please be as descriptive as possible";
        case "Ops - Mistagged Locations":
            return "Please provide a link to the dashboard where you found the mistagged locations. Describe which locations are incorrect and what the correct tagging should be.";
        case "CS - Customer Training":
            return "Tell us who needs training. What do they need to be trained on?";
        case "CS - Customer Access":
            return "Tell us who needs access. What do they need access to?";
        default:
            return "Please provide a detailed description of this issue";
    }
  }, [supportIssueType]);

  const specialInstructionsLabel = useMemo(() => {
    if (supportIssueType === "Ops - Stop Collection") {
        return "Why do we need to stop this collection(s)?";
    }
    return "Special Instructions / Comments for Support";
  }, [supportIssueType]);

  const generateUniqueCode = () => {
      if (isLoadingCategories || isLoadingCustomCodes) {
          toast({ variant: 'destructive', title: 'Data is still loading. Please wait a moment and try again.' });
          return;
      }

      const allCategoryCodes = (categories || []).map(c => c.number);
      const allCustomCodes = (customCodes || []).map(c => c.categoryCode);
      const existingCodes = new Set([...allCategoryCodes, ...allCustomCodes]);

      let newCode: string;
      let attempts = 0;
      
      do {
          newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          attempts++;
          if (attempts > 100) { // To prevent infinite loops
              toast({ variant: 'destructive', title: 'Could not generate a unique code. Please try again.' });
              return;
          }
      } while (existingCodes.has(newCode));

      form.setValue('customCategory_code', newCode);
      toast({ title: 'Unique code generated!', description: `Code: ${newCode}` });
  };


  async function onSubmit(values: z.infer<typeof supportFormSchema>) {
    if (!firestore) {
        toast({ variant: 'destructive', title: 'Database not available', description: 'Please try again in a moment.' });
        return;
    }

    setIsSubmitting(true);
    
    let issueType = '';
    if (values.assistanceType === 'support') {
        issueType = values.support_issueType || '';
    } else if (values.assistanceType === 'newCustomCategoryCode') {
        issueType = 'New Custom Code Request';
    } else if (values.assistanceType === 'privateSpace') {
        issueType = 'Private Space Request';
    }

    const supportId = `support-${Date.now()}`;
    const supportRef = doc(firestore, 'support', supportId);

    const requestData: SupportRequest = {
        id: supportId,
        timestamp: new Date().toISOString(),
        status: 'New',
        opsNotes: '',
        name: values.name,
        urgency: values.urgency,
        requestType: values.assistanceType,
        issueType: issueType,
        customer: values.assistanceType === 'support' ? values.support_customer : (values.assistanceType === 'privateSpace' ? values.privateSpace_name : values.customCategory_customer) || '',
        dashboardType: values.support_dashboardType || '',
        description: values.support_description || values.customCategory_category || '',
        specialInstructions: values.support_specialInstructions || values.privateSpace_specialInstructions || values.customCategory_notes || '',
        privateSpace_domains: values.privateSpace_domains || '',
        privateSpace_collections: values.privateSpace_collections || '',
        categoryName: values.customCategory_category || '',
        categoryId: values.customCategory_code || '',
        jobIds: values.customCategory_jobIds || '',
        collectionCountry: values.support_collectionCountry || '',
        collectionStartDate: values.support_collectionStartDate ? format(values.support_collectionStartDate, 'yyyy-MM-dd') : '',
        collectionEndDate: values.support_collectionEndDate ? format(values.support_collectionEndDate, 'yyyy-MM-dd') : '',
        collectionLocations: values.support_collectionLocations ?? null,
    };

    setDoc(supportRef, requestData)
        .then(() => {
            toast({
                title: "Request Submitted!",
                description: "Your ticket has been created. The Ops team will be notified via Slack (notifications are batched and sent every 15 minutes).",
            });
            const keptValues = {
                name: values.name,
                urgency: 3,
                assistanceType: values.assistanceType,
            };
            form.reset(keptValues);
            setIsSubmitting(false);
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: supportRef.path,
                operation: 'create',
                requestResourceData: requestData,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            setIsSubmitting(false);
        });
  }

  const assistanceTypeItems = [
    { id: "support", label: "Support Request" },
    { id: "privateSpace", label: "Private Space Request" },
    { id: "newCustomCategoryCode", label: "New Custom Category Code" },
  ] as const;


  return (
    <Card className={cn(
        "transition-all duration-300",
        urgencyValue === 5 ? "border-destructive/50" : ""
    )}>
      <CardContent className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {urgencyValue === 5 && (
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-[11px]">High Urgency Request</AlertTitle>
                    <AlertDescription className="text-[11px]">
                        This request is marked as critical. It will be prioritized by the team.
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-[11px]">Your Name</FormLabel>
                        <FormControl><Input className="text-[11px] h-8" autoComplete="name" placeholder="Jane Doe" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="urgency" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-[11px]">Urgency</FormLabel>
                        <FormControl><StarRating value={field.value} onChange={field.onChange} starSize="sm" /></FormControl>
                         <FormDescription className="text-[11px]">5 stars = urgent, 1 star = low priority.</FormDescription>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>

            <FormField
              control={form.control}
              name="assistanceType"
              render={({ field }) => (
                <FormItem className="space-y-1 pt-2">
                  <div className="mb-2">
                    <FormLabel className="text-[11px]">What type of Assistance do you Need?</FormLabel>
                  </div>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col md:flex-row gap-2"
                    >
                      {assistanceTypeItems.map((item) => (
                        <FormItem key={item.id} className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem value={item.id} id={`assistanceType-${item.id}`} />
                          </FormControl>
                          <FormLabel className="font-normal text-[11px]" htmlFor={`assistanceType-${item.id}`}>
                            {item.label}
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {assistanceType === 'support' && (
                <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                    <h3 className="text-[11px] font-semibold">Support Request Details</h3>
                    <FormField control={form.control} name="support_issueType" render={({ field }) => (
                        <FormItem><FormLabel className="text-[11px]">Issue Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger id="support_issueType" className="text-[11px] h-8">
                                    <SelectValue placeholder="Select a support type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem className="text-[11px]" value="CS - Customer Dashboard">CS - Customer Dashboard</SelectItem>
                                    <SelectItem className="text-[11px]" value="CS - Customer Access">CS - Customer Access</SelectItem>
                                    <SelectItem className="text-[11px]" value="Special Collection Request/Category Discovery">Special Collection Request/Category Discovery</SelectItem>
                                    <SelectItem className="text-[11px]" value="CS - Customer Training">CS - Customer Training</SelectItem>
                                    <SelectItem className="text-[11px]" value="Ops - Category Question (legacy 'Project Classify')">Ops - Category Question (legacy "Project Classify")</SelectItem>
                                    <SelectItem className="text-[11px]" value="Ops - Data Quality">Ops - Data Quality</SelectItem>
                                    <SelectItem className="text-[11px]" value="Ops - Store List">Ops - Store List</SelectItem>
                                    <SelectItem className="text-[11px]" value="Ops - Stop Collection">Ops - Stop Collection</SelectItem>
                                    <SelectItem className="text-[11px]" value="Ops - Category Management">Ops - Category Management</SelectItem>
                                    <SelectItem className="text-[11px]" value="Ops - Brand tagging">Ops - Brand tagging</SelectItem>
                                    <SelectItem className="text-[11px]" value="Ops - Mistagged Locations">Ops - Mistagged Locations</SelectItem>
                                    <SelectItem className="text-[11px]" value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select><FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="support_customer" render={({ field }) => (
                        <FormItem><FormLabel className="text-[11px]">Who is the customer?</FormLabel>
                        <FormControl><Input className="text-[11px] h-8" placeholder="Customer Name" autoComplete="organization" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage /></FormItem>
                    )} />
                    {!hideDashboardTypeQuestion && (
                      <FormField
                          control={form.control}
                          name="support_dashboardType"
                          render={({ field }) => (
                              <FormItem className="space-y-1">
                              <FormLabel className="text-[11px]">Which type of dashboard is this regarding?</FormLabel>
                              <FormControl>
                                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl><RadioGroupItem value="Premium Costco dashboard" id="dash-costco"/></FormControl>
                                      <FormLabel className="font-normal text-[11px]" htmlFor="dash-costco">Premium Costco dashboard</FormLabel>
                                  </FormItem>
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl><RadioGroupItem value="Storesight Private Space Dashboard" id="dash-ps" /></FormControl>
                                      <FormLabel className="font-normal text-[11px]" htmlFor="dash-ps">Storesight Private Space Dashboard</FormLabel>
                                  </FormItem>
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl><RadioGroupItem value="Both" id="dash-both" /></FormControl>
                                      <FormLabel className="font-normal text-[11px]" htmlFor="dash-both">Both</FormLabel>
                                  </FormItem>
                                  </RadioGroup>
                              </FormControl>
                              <FormMessage />
                              </FormItem>
                          )}
                      />
                    )}
                     {supportIssueType === 'Special Collection Request/Category Discovery' && (
                        <div className="space-y-3 pt-3 mt-3 border-t">
                             <FormField control={form.control} name="support_collectionCountry" render={({ field }) => (
                                <FormItem><FormLabel className="text-[11px]">Collection Country?</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                        <SelectTrigger className="text-[11px] h-8">
                                            <SelectValue placeholder="Select a country" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {countries.map(c => <SelectItem key={c.name} className="text-[11px]" value={c.name}>{c.flag} {c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select><FormMessage />
                                </FormItem>
                            )} />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="support_collectionStartDate" render={({ field }) => (
                                    <FormItem><FormLabel className="text-[11px]">What date would you like to start collection?</FormLabel>
                                    <FormControl>
                                        <DatePicker
                                            date={field.value}
                                            onDateChange={field.onChange}
                                            placeholder="Start Date"
                                        />
                                    </FormControl>
                                    <FormMessage /></FormItem>
                                )} />
                                 <FormField control={form.control} name="support_collectionEndDate" render={({ field }) => (
                                    <FormItem><FormLabel className="text-[11px]">Collection End Date?</FormLabel>
                                    <FormControl>
                                        <DatePicker
                                            date={field.value}
                                            onDateChange={field.onChange}
                                            placeholder="End Date"
                                        />
                                    </FormControl>
                                    <FormMessage /></FormItem>
                                )} />
                            </div>
                            <FormField control={form.control} name="support_collectionLocations" render={({ field }) => (
                                <FormItem><FormLabel className="text-[11px]">How many locations?</FormLabel>
                                <FormControl><Input type="number" className="text-[11px] h-8" placeholder="e.g. 50" {...field} onChange={event => field.onChange(+event.target.value)} value={field.value ?? ''} /></FormControl>
                                <FormMessage /></FormItem>
                            )} />
                        </div>
                    )}
                    <FormField control={form.control} name="support_description" render={({ field }) => (
                        <FormItem><FormLabel className="text-[11px]">{descriptionLabel}</FormLabel>
                        <FormControl><Textarea className="text-[11px]" placeholder="Describe the issue in detail..." {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="support_specialInstructions" render={({ field }) => (
                      <FormItem><FormLabel className="text-[11px]">{specialInstructionsLabel}</FormLabel>
                        <FormControl><Textarea className="text-[11px] resize-y" placeholder="Please provide any additional support details here..." {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage /></FormItem>
                    )} />
                </div>
            )}
            
            {assistanceType === 'privateSpace' && (
                <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                    <h3 className="text-[11px] font-semibold">Private Space Request Details</h3>
                     <FormField control={form.control} name="privateSpace_name" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">Private Space Name (Customer/Prospect)</FormLabel>
                            <FormControl><Input className="text-[11px] h-8" placeholder="Enter customer or prospect name" autoComplete="organization" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="privateSpace_domains" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">List domains that need to be added</FormLabel>
                            <FormControl><Textarea className="text-[11px]" placeholder="e.g., company.com, other.com" {...field} value={field.value ?? ''} /></FormControl>
                             <FormDescription className="text-[11px]">Comma-separated list of domains.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="privateSpace_collections" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">Collections to be included</FormLabel>
                            <FormControl><Textarea className="text-[11px]" placeholder="List the names of the collections/categories to include in this space." {...field} value={field.value ?? ''} /></FormControl>
                             <FormDescription className="text-[11px]">Please list each collection name. You can find these on the Subscription Menu.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="privateSpace_specialInstructions" render={({ field }) => (
                      <FormItem><FormLabel className="text-[11px]">Special Instructions / Comments for Private Space</FormLabel>
                        <FormControl><Textarea className="text-[11px] resize-y" placeholder="Please provide any additional private space details here..." {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage /></FormItem>
                    )} />
                </div>
            )}

            {assistanceType === 'newCustomCategoryCode' && (
                 <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                    <h3 className="text-[11px] font-semibold">New Custom Category Code Details</h3>
                     <FormField control={form.control} name="customCategory_customer" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">Who is the customer?</FormLabel>
                            <FormControl><Input className="text-[11px] h-8" placeholder="Customer Name" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="customCategory_category" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">Category</FormLabel>
                            <FormControl><Input className="text-[11px] h-8" placeholder="Enter category name" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="customCategory_code" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">Category Code</FormLabel>
                            <div className="flex gap-2">
                                <FormControl>
                                    <Input className="text-[11px] h-8" placeholder="Enter or generate a category code..." {...field} value={field.value ?? ''} />
                                </FormControl>
                                <Button type="button" variant="outline" size="icon" onClick={generateUniqueCode}>
                                    <Wand2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="customCategory_jobIds" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">Job ID(s)</FormLabel>
                            <FormControl><Input className="text-[11px] h-8" placeholder="Enter relevant Job ID(s)" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="customCategory_notes" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[11px]">Notes/Comments</FormLabel>
                            <FormControl><Textarea className="text-[11px]" placeholder="Add any notes for the category code..." {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
            )}


            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSubmitting} size="sm">
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
