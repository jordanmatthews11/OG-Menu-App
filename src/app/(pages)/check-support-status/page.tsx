
"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, startOfWeek, startOfMonth, startOfQuarter, startOfYear, isAfter } from 'date-fns';
import { useFirestore, useCollection, useMemoFirebase, errorEmitter } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { SupportRequest } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowUpDown, Search, X, Edit, Star, Save, Trash2, RotateCcw, PlusCircle, Check, BarChart, Filter, ChevronsUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { notifyZapier } from '@/app/actions/notify';


const supportEditSchema = z.object({
  id: z.string(),
  status: z.enum(["New", "In Progress", "Complete", "On Hold", "Cancelled", "Deleted"]),
  opsNotes: z.string().optional(),
  customer: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  categoryName: z.string().optional(),
  categoryId: z.string().optional(),
  jobIds: z.string().optional(),
});


function MultiSelectFilter({
    title,
    options,
    selected,
    setSelected,
}: {
    title: string;
    options: readonly string[];
    selected: string[];
    setSelected: (selected: string[]) => void;
}) {
    const [open, setOpen] = useState(false);

    const handleSelect = (value: string) => {
        setSelected(selected.includes(value) ? selected.filter(s => s !== value) : [...selected, value]);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-dashed w-[150px] justify-start text-[10px]">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {title}
                    {selected.length > 0 && (
                        <Badge variant="secondary" className="rounded-sm px-1 font-normal ml-auto">
                            {selected.length}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={`Filter ${title}...`} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option}
                                    onSelect={() => handleSelect(option)}
                                >
                                    <div
                                        className={cn(
                                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                            selected.includes(option) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                                        )}
                                    >
                                        <Check className={cn("h-4 w-4")} />
                                    </div>
                                    <span>{option}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        {selected.length > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => setSelected([])}
                                        className="justify-center text-center"
                                    >
                                        Clear filters
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function EditSupportRequestDialog({
  isOpen,
  setIsOpen,
  request,
  onSuccess,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  request: SupportRequest | null;
  onSuccess: () => void;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<z.infer<typeof supportEditSchema>>({
    resolver: zodResolver(supportEditSchema),
  });

  useEffect(() => {
    if (request) {
      form.reset({
        id: request.id,
        status: request.status,
        opsNotes: request.opsNotes || '',
        customer: request.customer || '',
        description: request.description || '',
        categoryName: request.categoryName || '',
        categoryId: request.categoryId || '',
        jobIds: request.jobIds || '',
      });
      setIsEditing(false); // Reset to view mode whenever a new request is loaded
    }
  }, [request, form]);


  const { isSubmitting } = form.formState;

  const onSubmit = (values: z.infer<typeof supportEditSchema>) => {
    if (!request || !firestore) return;

    const wasCompleted = request.status !== 'Complete' && values.status === 'Complete';
    
    const requestRef = doc(firestore, 'support', request.id);
    const dataToSave = {
      status: values.status,
      opsNotes: values.opsNotes,
      customer: values.customer,
      description: values.description,
      categoryName: values.categoryName,
      categoryId: values.categoryId,
      jobIds: values.jobIds,
    };

    setDoc(requestRef, dataToSave, { merge: true })
      .then(() => {
        toast({
          title: 'Support Request Updated',
          description: `Request ${request.id} has been successfully updated.`,
        });
        
        if (wasCompleted) {
            const completedTicket = { ...request, ...dataToSave };
            notifyZapier(completedTicket);
        }
        
        onSuccess();
        setIsEditing(false);
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: requestRef.path,
            operation: 'update',
            requestResourceData: dataToSave,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  if (!request) return null;
  
  const renderField = (label: string, value: React.ReactNode, fieldName: keyof SupportRequest, isEditable: boolean = false) => {
    if (isEditing && isEditable) {
      return (
         <FormField
            control={form.control}
            name={fieldName as any}
            render={({ field }) => (
                <FormItem>
                    <FormLabel className="text-xs">{label}</FormLabel>
                    <FormControl>
                        {fieldName === 'description' ? (
                            <Textarea placeholder={`Enter ${label.toLowerCase()}...`} {...field} className="text-xs"/>
                        ) : (
                            <Input placeholder={`Enter ${label.toLowerCase()}...`} {...field} className="text-xs"/>
                        )}
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
      )
    }

    if (!value && typeof value !== 'number') return null;
    return (
        <div>
            <p className="font-medium text-xs text-muted-foreground">{label}</p>
            {typeof value === 'string' ? <div className="text-xs whitespace-pre-wrap p-3 border rounded-md bg-muted/50 min-h-[40px]">{value}</div> : value}
        </div>
    )
  };


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="text-lg">Ticket Details</DialogTitle>
                <DialogDescription className="text-xs">ID: {request.id}</DialogDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                 {isEditing ? (
                   <Select
                      onValueChange={(value) => form.setValue('status', value as SupportRequest['status'])}
                      defaultValue={form.getValues('status')}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          'New',
                          'In Progress',
                          'Complete',
                          'On Hold',
                          'Cancelled',
                          'Deleted',
                        ].map(s => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      className={cn(
                        'text-white text-xs',
                        getStatusColor(request.status)
                      )}
                    >
                      {request.status}
                    </Badge>
                  )}
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        'h-5 w-5',
                        i < request.urgency
                          ? 'text-orange-400 fill-orange-400'
                          : 'text-muted-foreground/30'
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-6 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 text-sm">
                    <div className="space-y-4">
                      {renderField('Issue Type', <Badge variant={request.issueType === 'New Custom Code' ? 'default' : 'secondary'} className={cn("text-xs", request.issueType === 'New Custom Code' && "bg-purple-600 text-white")}>{request.issueType || '---'}</Badge>, 'issueType')}
                      {renderField('Customer', request.customer, 'customer', true)}
                      {renderField('Submitted By', (
                        <div>
                          <p className="text-xs">{request.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(request.timestamp), 'PPp')}
                          </p>
                        </div>
                      ), 'name')}
                      {renderField('Dashboard Type', request.dashboardType, 'dashboardType')}
                    </div>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="opsNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Notes from Ops Team</FormLabel>
                            {isEditing ? (
                              <FormControl>
                                <Textarea
                                  placeholder="Add internal notes for the operations team..."
                                  {...field}
                                   className="text-xs"
                                />
                              </FormControl>
                            ) : (
                              <div className="text-xs whitespace-pre-wrap p-3 border rounded-md bg-muted/50 min-h-[100px]">
                                {field.value || (
                                  <span className="text-muted-foreground">
                                    No notes yet.
                                  </span>
                                )}
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                      {renderField("Description", request.description, 'description', true)}
                      {renderField("Special Instructions", request.specialInstructions, 'specialInstructions')}
                  </div>

                  {(request.requestType === 'privateSpace' ||
                    request.requestType === 'newCustomCategoryCode') && (
                    <div className="space-y-4 pt-4 border-t">
                      <h4 className="font-semibold text-sm">
                        Request Specific Information
                      </h4>
                      {request.requestType === 'privateSpace' && (
                        <>
                          {renderField('Domains', request.privateSpace_domains, 'privateSpace_domains')}
                          {renderField(
                            'Collections',
                            request.privateSpace_collections,
                            'privateSpace_collections'
                          )}
                        </>
                      )}
                      {request.requestType === 'newCustomCategoryCode' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {renderField('Category', request.categoryName, 'categoryName', true)}
                          {renderField('Code', request.categoryId, 'categoryId', true)}
                          {renderField('Job IDs', request.jobIds, 'jobIds', true)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
              {isEditing && (
                 <DialogFooter className="pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Changes
                    </Button>
                </DialogFooter>
              )}
            </form>
          </Form>
           {!isEditing && (
                <DialogFooter className="pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
                    <Button type="button" onClick={() => setIsEditing(true)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit Ticket
                    </Button>
                </DialogFooter>
            )}
      </DialogContent>
    </Dialog>
  );
}

const getStatusColor = (status: SupportRequest['status']) => {
    switch(status) {
        case 'New': return 'bg-blue-500 hover:bg-blue-500/80';
        case 'In Progress': return 'bg-yellow-500 hover:bg-yellow-500/80';
        case 'Complete': return 'bg-green-500 hover:bg-green-500/80';
        case 'On Hold': return 'bg-orange-500 hover:bg-orange-500/80';
        case 'Cancelled': return 'bg-red-500 hover:bg-red-500/80';
        case 'Deleted': return 'bg-gray-700 hover:bg-gray-700/80';
        default: return 'bg-gray-500 hover:bg-gray-500/80';
    }
}

type SortConfig = { key: keyof SupportRequest; direction: 'asc' | 'desc' } | null;

const availableStatuses = ["New", "In Progress", "Complete", "On Hold", "Cancelled"];

const TicketTable = ({ 
  requests, 
  isLoading,
  onRowClick,
  onStatusChange,
  onBulkUpdateSuccess,
  isDeletedTable = false 
}: { 
  requests: SupportRequest[], 
  isLoading: boolean,
  onRowClick: (request: SupportRequest) => void,
  onStatusChange: (id: string, status: SupportRequest['status']) => void,
  onBulkUpdateSuccess: () => void,
  isDeletedTable?: boolean
}) => {
  const [filter, setFilter] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkStatusToApply, setBulkStatusToApply] = useState<SupportRequest['status'] | ''>('');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [filtersInitialized, setFiltersInitialized] = useState(false);

  const availableIssueTypes = useMemo(() => {
    if (!requests) return [];
    const types = new Set(requests.map(r => r.issueType).filter(Boolean));
    return Array.from(types) as string[];
  }, [requests]);

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [issueTypeFilter, setIssueTypeFilter] = useState<string[]>([]);
  
  useEffect(() => {
    if (!isDeletedTable && requests.length > 0 && availableIssueTypes.length > 0 && !filtersInitialized) {
        setStatusFilter(availableStatuses);
        setIssueTypeFilter(availableIssueTypes);
        setFiltersInitialized(true);
    }
  }, [isDeletedTable, requests, availableIssueTypes, filtersInitialized]);


  const sortedAndFilteredData = useMemo(() => {
    if (!requests) return [];
    let result = [...requests];
    
    if (!isDeletedTable) {
        if (statusFilter.length > 0) {
            result = result.filter(request => statusFilter.includes(request.status));
        }
        
        if (issueTypeFilter.length > 0) {
            result = result.filter(request => request.issueType && issueTypeFilter.includes(request.issueType));
        }
    }


    if (filter) {
      const lowercasedFilter = filter.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(val =>
          String(val).toLowerCase().includes(lowercasedFilter)
        )
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key] as any;
        const bVal = b[sortConfig.key] as any;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [requests, filter, sortConfig, statusFilter, issueTypeFilter, isDeletedTable]);

  useEffect(() => {
    setSelectedRowIds([]);
  }, [sortedAndFilteredData]);

  const handleSort = (key: keyof SupportRequest) => {
    setSortConfig(prevSort => {
      if (prevSort && prevSort.key === key) {
        return { key, direction: prevSort.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleApplyBulkStatus = async () => {
    if (!firestore || selectedRowIds.length === 0 || !bulkStatusToApply) {
        toast({
            variant: 'destructive',
            title: 'Selection or Status Missing',
            description: 'Please select at least one ticket and a status to apply.',
        });
        return;
    }
    
    const batch = writeBatch(firestore);

    const ticketsToUpdate = selectedRowIds
        .map(id => sortedAndFilteredData.find(req => req.id === id))
        .filter((req): req is SupportRequest => !!req);

    const ticketsThatWillBeCompleted = ticketsToUpdate.filter(t => t.status !== 'Complete' && bulkStatusToApply === 'Complete');
    
    ticketsToUpdate.forEach(ticket => {
        const ticketRef = doc(firestore, 'support', ticket.id);
        batch.update(ticketRef, { status: bulkStatusToApply });
    });

    batch.commit()
        .then(() => {
            toast({
                title: 'Bulk Update Successful',
                description: `${selectedRowIds.length} tickets have been updated.`,
            });

            if (bulkStatusToApply === 'Complete') {
                for (const ticket of ticketsThatWillBeCompleted) {
                    notifyZapier({ ...ticket, status: 'Complete' });
                }
            }

            setSelectedRowIds([]);
            setBulkStatusToApply('');
            onBulkUpdateSuccess();
        })
        .catch(async (error) => {
            console.error('Bulk status update failed:', error);
            toast({
                variant: 'destructive',
                title: 'Bulk Update Failed',
                description: 'An error occurred while updating the tickets.',
            });
        });
  };

  const renderSortIcon = (key: keyof SupportRequest) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const getHeaderClass = (key: keyof SupportRequest) =>
    cn("cursor-pointer hover:bg-muted/50", sortConfig?.key === key && "text-foreground");
  
  return (
    <div className="space-y-4">
        {!isDeletedTable && selectedRowIds.length > 0 && (
             <div className="flex items-center gap-4 rounded-lg border bg-card text-card-foreground p-2 shadow-sm">
                <span className="text-sm font-medium">{selectedRowIds.length} selected</span>
                <Select value={bulkStatusToApply} onValueChange={(value) => setBulkStatusToApply(value as SupportRequest['status'])}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Change status to..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableStatuses.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button size="sm" onClick={handleApplyBulkStatus} disabled={!bulkStatusToApply}>
                    Apply
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedRowIds([])}>
                    <X className="mr-2 h-4 w-4" /> Clear
                </Button>
            </div>
        )}
        <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search tickets..." 
                    className="pl-8 text-[10px]"
                    value={filter}
                    onChange={e => setFilter(value => e.target.value)}
                />
                {filter && (
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setFilter('')}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
            {!isDeletedTable && (
              <>
                <MultiSelectFilter
                    title="Status"
                    options={availableStatuses}
                    selected={statusFilter}
                    setSelected={setStatusFilter}
                />
                <MultiSelectFilter
                    title="Issue Type"
                    options={availableIssueTypes}
                    selected={issueTypeFilter}
                    setSelected={setIssueTypeFilter}
                />
              </>
            )}
        </div>
      <TooltipProvider>
        <ScrollArea className="h-[70vh] border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                {!isDeletedTable && (
                    <TableHead className="w-[48px] px-4">
                        <Checkbox
                            checked={sortedAndFilteredData.length > 0 && selectedRowIds.length === sortedAndFilteredData.length}
                            onCheckedChange={(checked) => {
                                if (checked) {
                                    setSelectedRowIds(sortedAndFilteredData.map(r => r.id));
                                } else {
                                    setSelectedRowIds([]);
                                }
                            }}
                            aria-label="Select all rows"
                        />
                    </TableHead>
                )}
                <TableHead className={cn(getHeaderClass('timestamp'), "text-[10px]")} onClick={() => handleSort('timestamp')}>Date</TableHead>
                <TableHead className={cn(getHeaderClass('name'), "text-[10px]")} onClick={() => handleSort('name')}>Submitted By</TableHead>
                <TableHead className={cn(getHeaderClass('customer'), "text-[10px]")} onClick={() => handleSort('customer')}>Customer</TableHead>
                <TableHead className={cn(getHeaderClass('issueType'), "text-[10px]")} onClick={() => handleSort('issueType')}>Issue Type</TableHead>
                <TableHead className={cn(getHeaderClass('description'), "text-[10px]")} onClick={() => handleSort('description')}>Description</TableHead>
                <TableHead className={cn(getHeaderClass('opsNotes'), "text-[10px]")} onClick={() => handleSort('opsNotes')}>Ops Notes</TableHead>
                <TableHead className={cn(getHeaderClass('status'), "text-[10px]")} onClick={() => handleSort('status')}>Status</TableHead>
                <TableHead className={cn(getHeaderClass('urgency'), "text-[10px]")} onClick={() => handleSort('urgency')}>Urgency</TableHead>
                <TableHead className="text-right text-[10px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isDeletedTable ? 9 : 10} className="h-24 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : sortedAndFilteredData.length > 0 ? (
                sortedAndFilteredData.map(request => (
                  <TableRow key={request.id} onClick={() => onRowClick(request)} className="cursor-pointer">
                    {!isDeletedTable && (
                        <TableCell className="px-4" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                                checked={selectedRowIds.includes(request.id)}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        setSelectedRowIds(prev => [...prev, request.id]);
                                    } else {
                                        setSelectedRowIds(prev => prev.filter(id => id !== request.id));
                                    }
                                }}
                                aria-label={`Select row for ticket ${request.id}`}
                            />
                        </TableCell>
                    )}
                    <TableCell className="text-[10px]">{format(new Date(request.timestamp), "P")}</TableCell>
                    <TableCell className="text-[10px] font-medium">{request.name}</TableCell>
                    <TableCell className="text-[10px]">{request.customer}</TableCell>
                    <TableCell className="text-[10px]"><Badge variant={request.issueType === 'New Custom Code' ? 'default' : 'secondary'} className={cn("text-[10px]", request.issueType === 'New Custom Code' && "bg-purple-600 text-white")}>{request.issueType || '---'}</Badge></TableCell>
                    <TableCell className="text-[10px] max-w-[200px] truncate">
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <span>{request.description}</span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="start">
                              <p className="max-w-md whitespace-pre-wrap">{request.description}</p>
                          </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-[10px] max-w-[150px] truncate">
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <span>{request.opsNotes}</span>
                          </TooltipTrigger>
                           <TooltipContent side="bottom" align="start">
                              <p className="max-w-md whitespace-pre-wrap">{request.opsNotes}</p>
                          </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-white text-[10px]", getStatusColor(request.status))}>{request.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex">
                         {[...Array(5)].map((_, i) => (
                          <Star
                              key={i}
                              className={cn('h-4 w-4', i < request.urgency ? 'text-orange-400 fill-orange-400' : 'text-muted-foreground/30')}
                          />
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                       {isDeletedTable ? (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onStatusChange(request.id, 'New')}>
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onRowClick(request);}}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                              <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => e.stopPropagation()}>
                                      <Trash2 className="h-4 w-4" />
                                  </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                  <AlertDialogHeader>
                                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                          This will move the ticket to the "Deleted" tab. You can restore it from there.
                                      </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                      <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={(e) => { e.stopPropagation(); onStatusChange(request.id, 'Deleted'); }}>
                                          Delete Ticket
                                      </AlertDialogAction>
                                  </AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={isDeletedTable ? 9 : 10} className="h-24 text-center">
                    No support requests found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
};

type TimeFilter = 'week' | 'month' | 'quarter' | 'year' | 'all';

function IssueTypePieChart({ data, timeFilter, onTimeFilterChange }: { data: SupportRequest[], timeFilter: TimeFilter, onTimeFilterChange: (filter: TimeFilter) => void }) {
    const [isOpen, setIsOpen] = useState(true);
    
    const filteredData = useMemo(() => {
        if (timeFilter === 'all') {
            return data;
        }
        const now = new Date();
        let startDate: Date;
        switch (timeFilter) {
            case 'week':
                startDate = startOfWeek(now);
                break;
            case 'month':
                startDate = startOfMonth(now);
                break;
            case 'quarter':
                startDate = startOfQuarter(now);
                break;
            case 'year':
                startDate = startOfYear(now);
                break;
        }
        return data.filter(req => isAfter(new Date(req.timestamp), startDate));
    }, [data, timeFilter]);

    const chartData = useMemo(() => {
        const issueTypeCounts = filteredData.reduce<Record<string, number>>((acc, req) => {
            if (req.issueType) {
                acc[req.issueType] = (acc[req.issueType] || 0) + 1;
            }
            return acc;
        }, {});

        return Object.entries(issueTypeCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [filteredData]);

    const COLORS = [
        '#673AB7', '#3F51B5', '#2196F3', '#009688', 
        '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', 
        '#FFC107', '#FF9800', '#FF5722', '#795548'
    ];

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card>
                <CardHeader className="p-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs">Tickets by Issue Type</CardTitle>
                    <div className="flex items-center gap-2">
                        <Select value={timeFilter} onValueChange={(value) => onTimeFilterChange(value as TimeFilter)}>
                           <SelectTrigger className="h-7 w-7 p-0 justify-center bg-transparent border-none text-muted-foreground hover:text-foreground focus:ring-0 focus:ring-offset-0">
                                <Filter className="h-4 w-4" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="week">This Week</SelectItem>
                                <SelectItem value="month">This Month</SelectItem>
                                <SelectItem value="quarter">This Quarter</SelectItem>
                                <SelectItem value="year">This Year</SelectItem>
                                <SelectItem value="all">All Time</SelectItem>
                            </SelectContent>
                        </Select>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ChevronsUpDown className="h-4 w-4" />
                                <span className="sr-only">Toggle</span>
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="p-0 h-[200px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={60}
                                        fill="#8884d8"
                                        labelLine={false}
                                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                            const RADIAN = Math.PI / 180;
                                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                            return (percent > 0.05) ? (
                                                <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={9}>
                                                    {`${(percent * 100).toFixed(0)}%`}
                                                </text>
                                            ) : null;
                                        }}
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', fontSize: '11px' }} />
                                    <Legend iconSize={8} layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}}/>
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                                No tickets found for this period.
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

function StatusStats({ tickets }: { tickets: SupportRequest[] }) {
    const [isOpen, setIsOpen] = useState(true);
    const counts = useMemo(() => {
        return tickets.reduce((acc, ticket) => {
            const status = ticket.status as keyof typeof acc;
            if (acc.hasOwnProperty(status)) {
                acc[status]++;
            }
            return acc;
        }, {
            "New": 0,
            "In Progress": 0,
            "On Hold": 0,
            "Cancelled": 0,
            "Complete": 0,
        });
    }, [tickets]);

    const stats = [
        { label: "New", value: counts["New"], color: "bg-blue-500" },
        { label: "In Progress", value: counts["In Progress"], color: "bg-yellow-500" },
        { label: "On Hold", value: counts["On Hold"], color: "bg-orange-500" },
    ];

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card>
                <CardHeader className="p-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs">Active Ticket Status</CardTitle>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ChevronsUpDown className="h-4 w-4" />
                            <span className="sr-only">Toggle</span>
                        </Button>
                    </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="p-3 pt-0 grid grid-cols-1 gap-y-2">
                        {stats.map(stat => (
                            <div key={stat.label} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <span className={cn("h-2 w-2 rounded-full", stat.color)} />
                                    <span className="text-muted-foreground">{stat.label}</span>
                                </div>
                                <span className="font-semibold">{stat.value}</span>
                            </div>
                        ))}
                        <div className="border-t pt-2 mt-2 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Completed</span>
                            <span className="font-semibold">{counts["Complete"]}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Cancelled</span>
                            <span className="font-semibold">{counts["Cancelled"]}</span>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}


export default function CheckSupportStatusPage() {
  const firestore = useFirestore();
  const [version, setVersion] = useState(0); // Forcing refetch
  const supportQuery = useMemoFirebase(() => firestore ? collection(firestore, 'support') : null, [firestore, version]);
  const { data: supportRequests, isLoading } = useCollection<SupportRequest>(supportQuery);
  const { toast } = useToast();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');


  const handleDataChange = useCallback(() => {
    setVersion(v => v + 1);
  }, []);

  const handleRowClick = (request: SupportRequest) => {
    setSelectedRequest(request);
    setIsEditOpen(true);
  };
  
  const handleStatusChange = async (requestId: string, status: SupportRequest['status']) => {
    if (!firestore) return;
    const requestRef = doc(firestore, 'support', requestId);
    
    const originalTicket = supportRequests?.find(req => req.id === requestId);
    const willBeCompleted = originalTicket?.status !== 'Complete' && status === 'Complete';

    setDoc(requestRef, { status }, { merge: true })
        .then(() => {
            toast({
                title: `Ticket ${status === 'Deleted' ? 'Deleted' : 'Restored'}`,
                description: `The support ticket has been ${status === 'Deleted' ? 'moved to the deleted tab' : 'restored to active'}.`
            });

            if (willBeCompleted && originalTicket) {
                notifyZapier({ ...originalTicket, status: 'Complete' });
            }

            handleDataChange();
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: requestRef.path,
                operation: 'update',
                requestResourceData: { status },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };
  

  const { activeTickets, deletedTickets } = useMemo(() => {
    const active: SupportRequest[] = [];
    const deleted: SupportRequest[] = [];
    if (supportRequests) {
      for (const req of supportRequests) {
        if (req.status === 'Deleted') {
          deleted.push(req);
        } else {
          active.push(req);
        }
      }
    }
    return { activeTickets: active, deletedTickets: deleted };
  }, [supportRequests]);

  const pageIsLoading = isLoading;

  return (
    <div className="container mx-auto max-w-full">
       <div className="grid grid-cols-1 lg:grid-cols-3 items-start mb-6 gap-6">
        <div className="lg:col-span-2">
          <h1 className="text-lg font-bold tracking-tight">All Support Requests</h1>
          <p className="text-xs text-muted-foreground">
            View and manage all submitted support tickets.
          </p>
        </div>
        <div className="lg:col-span-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {activeTickets.length > 0 && <IssueTypePieChart data={activeTickets} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} />}
            <StatusStats tickets={activeTickets} />
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active" className="text-[10px]">Active Tickets ({activeTickets.length})</TabsTrigger>
              <TabsTrigger value="deleted" className="text-[10px]">Deleted Tickets ({deletedTickets.length})</TabsTrigger>
            </TabsList>
            <div className="mt-4">
                <TabsContent value="active" className="mt-0">
                   <TicketTable 
                      requests={activeTickets}
                      isLoading={pageIsLoading}
                      onRowClick={handleRowClick}
                      onStatusChange={handleStatusChange}
                      onBulkUpdateSuccess={handleDataChange}
                   />
                </TabsContent>
                 <TabsContent value="deleted" className="mt-0">
                    <TicketTable 
                      requests={deletedTickets}
                      isLoading={pageIsLoading}
                      onRowClick={handleRowClick}
                      onStatusChange={handleStatusChange}
                      isDeletedTable={true}
                      onBulkUpdateSuccess={handleDataChange}
                   />
                </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {selectedRequest && (
        <EditSupportRequestDialog
          isOpen={isEditOpen}
          setIsOpen={setIsEditOpen}
          request={selectedRequest}
          onSuccess={handleDataChange}
        />
      )}
    </div>
  );
}
