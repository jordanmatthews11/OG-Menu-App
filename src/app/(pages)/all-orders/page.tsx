
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { useFirestore, useCollection, useMemoFirebase, errorEmitter } from '@/firebase';
import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import type { Order, OrderItem, OrderItemRetailer } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowUpDown, Search, X, Edit, ArrowLeft, Trash2, RotateCcw, Download, FileSpreadsheet, Check, ChevronsUpDown, PlusCircle, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import * as XLSX from "xlsx";
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';


type SortConfig = { key: keyof Order | 'categories' | 'storeLists'; direction: 'asc' | 'desc' } | null;

const collectionTypes = ["Syndicated - For Paying Customer", "Syndicated - For Marketing", "Syndicated - For Prospective Client Demo", "Private Collection"] as const;

const orderEditSchema = z.object({
  id: z.string(),
  customer: z.string().min(1, "Customer name is required."),
  hubspotDealId: z.string().min(1, "Hubspot Deal ID is required."),
  typeOfCollection: z.enum(collectionTypes),
  status: z.enum(["New", "In Progress", "Complete", "On Hold", "Cancelled", "Deleted"]),
  opsTeamNotes: z.string().optional(),
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
                <Button variant="outline" size="sm" className="h-9 border-dashed w-[150px] justify-start text-[11px]">
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


function EditOrderDialog({
  isOpen,
  setIsOpen,
  order,
  onSuccess,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  order: Order | null;
  onSuccess: () => void;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [deleteInput, setDeleteInput] = useState("");

  const form = useForm<z.infer<typeof orderEditSchema>>({
    resolver: zodResolver(orderEditSchema)
  });

  useEffect(() => {
    if(order) {
        form.reset({
            id: order.id,
            customer: order.customer,
            hubspotDealId: order.hubspotDealId || '',
            typeOfCollection: order.typeOfCollection,
            status: order.status,
            opsTeamNotes: order.opsTeamNotes || '',
        });
    }
  }, [order, form]);

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: z.infer<typeof orderEditSchema>) => {
    if (!order || !firestore) return;
    
    const orderRef = doc(firestore, 'orders', order.id);
    const dataToSave = {
      customer: values.customer,
      hubspotDealId: values.hubspotDealId,
      typeOfCollection: values.typeOfCollection,
      status: values.status,
      opsTeamNotes: values.opsTeamNotes,
    };

    setDoc(orderRef, dataToSave, { merge: true })
        .then(() => {
            toast({
                title: 'Order Updated',
                description: `Order ${order.id} has been successfully updated.`,
            });
            onSuccess();
            setIsOpen(false);
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: dataToSave,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };
  
  const handleSoftDelete = async () => {
    if (!order || !firestore) return;
    const orderRef = doc(firestore, 'orders', order.id);
    setDoc(orderRef, { status: "Deleted" }, { merge: true })
        .then(() => {
            toast({ title: 'Order Deleted', description: 'The order has been moved to the deleted tab.' });
            onSuccess();
            setIsOpen(false);
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: { status: "Deleted" },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };

  const handleExportXlsx = () => {
    if (!order) return;

    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      { Key: "Order ID", Value: order.id },
      { Key: "Customer", Value: order.customer },
      { Key: "Hubspot Deal ID", Value: order.hubspotDealId },
      { Key: "Status", Value: order.status },
      { Key: "Submitted By", Value: order.submittedBy },
      { Key: "Date Submitted", Value: format(new Date(order.timestamp), "PPp") },
      { Key: "Collection Type", Value: order.typeOfCollection },
      { Key: "Ops Team Notes", Value: order.opsTeamNotes || "" },
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summaryData, { skipHeader: true });
    XLSX.utils.book_append_sheet(wb, summaryWs, "Order Summary");

    // Items Sheets
    order.items.forEach((item, index) => {
      const itemData = [
        { Key: "Category Name", Value: item.categoryName },
        { Key: "Category Code", Value: item.categoryCode },
        { Key: "Country", Value: item.country },
        { Key: "Start Date", Value: item.startDate },
        { Key: "End Date", Value: item.endDate },
        { Key: "Notes", Value: item.notes || "" },
      ];
      const ws = XLSX.utils.json_to_sheet(itemData, { skipHeader: true });

      XLSX.utils.sheet_add_aoa(ws, [[]], { origin: -1 }); // Spacer
      XLSX.utils.sheet_add_aoa(ws, [["Retailer", "List Type", "Weekly Quota", "Monthly Quota"]], { origin: -1 });

      const allRetailers = item.retailers.map(r => ({
        Retailer: r.name,
        "List Type": r.listName || (r.type.includes('Booster') ? 'Booster' : 'Standard'),
        "Weekly Quota": r.weeklyQuota,
        "Monthly Quota": r.monthlyQuota,
      }));

      XLSX.utils.sheet_add_json(ws, allRetailers, { origin: -1, skipHeader: true });
      
      const safeSheetName = `${item.categoryName.substring(0, 20)}_${index + 1}`.replace(/[^a-zA-Z0-9_]/g, '');
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    });

    XLSX.writeFile(wb, `Order_${order.id.substring(order.id.length-6)}.xlsx`);
  };
  
  if (!order) return null;

  const renderRetailerTable = (retailers: OrderItemRetailer[]) => {
    if (retailers.length === 0) return <span className="text-muted-foreground">--</span>;

    const allRetailers = retailers.map(r => ({
        name: r.name,
        type: r.type,
        listName: r.listName || (r.type.includes('Booster') ? 'Booster' : 'Standard'),
        weekly: r.weeklyQuota,
        monthly: r.monthlyQuota
    })).sort((a,b) => a.name.localeCompare(b.name));

    return (
        <Table className="text-[11px] mt-1">
            <TableHeader>
                <TableRow>
                    <TableHead className="h-6 p-1">Retailer</TableHead>
                    <TableHead className="h-6 p-1">List Type</TableHead>
                    <TableHead className="h-6 p-1 text-right">Wkly</TableHead>
                    <TableHead className="h-6 p-1 text-right">Mthly</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {allRetailers.map((retailer, i) => (
                    <TableRow key={i} className="h-6">
                        <TableCell className="p-1 font-medium">{retailer.name}</TableCell>
                        <TableCell className="p-1">{retailer.listName}</TableCell>
                        <TableCell className="p-1 text-right font-mono">{retailer.weekly}</TableCell>
                        <TableCell className="p-1 text-right font-mono">{retailer.monthly}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <div>
                <DialogTitle className="text-lg">Order Details</DialogTitle>
                <DialogDescription className="text-[11px]">ID: {order.id}</DialogDescription>
            </div>
             <div>
                <p className="text-[11px]"><strong>Submitted by:</strong> {order.submittedBy}</p>
                <p className="text-[11px] text-muted-foreground">{format(new Date(order.timestamp), "PPp")}</p>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col min-h-0">
        <div className="grid grid-cols-5 gap-6 flex-grow min-h-0">
            {/* Left side - Order items */}
            <ScrollArea className="col-span-3 pr-4">
                <div className="space-y-4">
                    {order.items.map((item, index) => (
                         <Card key={index} className="overflow-hidden">
                            <CardHeader className="p-3 bg-muted/50">
                                <CardTitle className="text-sm">{item.categoryName} ({item.country})</CardTitle>
                                <CardDescription className="text-[11px]">Code: {item.categoryCode}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 text-[11px] space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <p><strong>Start Date:</strong> {item.startDate}</p>
                                    <p><strong>End Date:</strong> {item.endDate}</p>
                                </div>
                                {renderRetailerTable(item.retailers)}
                                {item.notes && (
                                    <div>
                                        <p className="font-semibold mb-1">Notes:</p>
                                        <p className="text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </ScrollArea>

            {/* Right side - Editable fields */}
            <div className="col-span-2 flex flex-col space-y-4">
                 <FormField
                    control={form.control}
                    name="customer"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-[11px]">Customer</FormLabel>
                        <FormControl>
                            <Input placeholder="Customer Name" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                 />
                 <FormField
                    control={form.control}
                    name="hubspotDealId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-[11px]">Hubspot Deal ID</FormLabel>
                        <FormControl>
                            <Input placeholder="Hubspot Deal ID" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                 />
                 <FormField
                    control={form.control}
                    name="typeOfCollection"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-[11px]">Type of Collection</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a collection type" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {collectionTypes.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-[11px]">Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        {["New", "In Progress", "Complete", "On Hold", "Cancelled", "Deleted"].map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="opsTeamNotes"
                render={({ field }) => (
                    <FormItem className="flex flex-col flex-grow">
                    <FormLabel className="text-[11px]">Ops Team Notes</FormLabel>
                    <FormControl className="flex-grow">
                        <Textarea placeholder="Add internal notes for the operations team..." {...field} className="h-full resize-none text-[11px]"/>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
        </div>
        <DialogFooter className="border-t pt-4 mt-4">
            <div className="flex justify-between items-center w-full">
                <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 w-9">
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete Order</span>
                        </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will move the order to the "Deleted" tab. You can restore it later. To confirm, please type <strong>delete</strong> into the box below.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <Input 
                                value={deleteInput}
                                onChange={(e) => setDeleteInput(value => e.target.value)}
                                placeholder='delete'
                            />
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeleteInput("")}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleSoftDelete} disabled={deleteInput.toLowerCase() !== 'delete'}>
                                    Confirm Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button type="button" variant="outline" size="sm" onClick={handleExportXlsx}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Download XLSX
                    </Button>
                </div>
                <div className="flex gap-2 items-center">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </div>
            </div>
        </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


function OrdersTable({
    orders,
    isLoading,
    isDeletedTable = false,
    onEdit,
    onStatusChange,
    onPermanentDelete,
} : {
    orders: Order[] | null;
    isLoading: boolean;
    isDeletedTable?: boolean;
    onEdit: (order: Order) => void;
    onStatusChange: (id: string, status: Order['status']) => void;
    onPermanentDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' });
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  
  const getStatusColor = (status: Order['status']) => {
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

  const sortedAndFilteredData = useMemo((): Order[] => {
    if (!orders) return [];
    let result = [...orders];

    if (statusFilter.length > 0) {
        result = result.filter(order => statusFilter.includes(order.status));
    }

    if (filter) {
      const lowercasedFilter = filter.toLowerCase();
      result = result.filter(order =>
        Object.values(order).some(val => {
          if (typeof val === 'string') return val.toLowerCase().includes(lowercasedFilter);
          if (Array.isArray(val)) { // For items array
            return val.some(item => 
              Object.values(item).some(subVal => 
                String(subVal).toLowerCase().includes(lowercasedFilter)
              )
            );
          }
          return false;
        })
      );
    }

    if (sortConfig) {
        result.sort((a, b) => {
            let aVal, bVal;

            if (sortConfig.key === 'categories') {
                aVal = a.items.length;
                bVal = b.items.length;
            } else if (sortConfig.key === 'storeLists') {
                 aVal = a.items.reduce((acc, item) => acc + new Set(item.retailers.filter(r => r.type === 'Standard').map(r => r.listName)).size, 0);
                 bVal = b.items.reduce((acc, item) => acc + new Set(item.retailers.filter(r => r.type === 'Standard').map(r => r.listName)).size, 0);
            } 
            else {
                aVal = a[sortConfig.key as keyof Order];
                bVal = b[sortConfig.key as keyof Order];
            }

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
            if (String(aVal) < String(bVal)) return sortConfig.direction === 'asc' ? -1 : 1;
            if (String(aVal) > String(bVal)) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return result;
  }, [orders, filter, sortConfig, statusFilter]);
  

  const handleSort = (key: keyof Order | 'categories' | 'storeLists') => {
    setSortConfig(prevSort => {
      if (prevSort && prevSort.key === key) {
        return { key, direction: prevSort.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const renderSortIcon = (key: keyof Order | 'categories' | 'storeLists') => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const getHeaderClass = (key: keyof Order | 'categories' | 'storeLists') =>
    cn("cursor-pointer hover:bg-muted/50", sortConfig?.key === key && "text-foreground");
    
  return (
    <div className="space-y-4">
        <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search orders..." 
                    className="pl-8 text-[11px]"
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
                <MultiSelectFilter
                    title="Status"
                    options={["New", "In Progress", "Complete", "On Hold", "Cancelled"]}
                    selected={statusFilter}
                    setSelected={setStatusFilter}
                />
            )}
        </div>
        <TooltipProvider>
          <ScrollArea className="h-[70vh] border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className={cn(getHeaderClass('id'), "text-[11px]")} onClick={() => handleSort('id')}>Order ID</TableHead>
                  <TableHead className={cn(getHeaderClass('status'), "text-[11px]")} onClick={() => handleSort('status')}>Status</TableHead>
                  <TableHead className={cn(getHeaderClass('customer'), "text-[11px]")} onClick={() => handleSort('customer')}>Customer</TableHead>
                  <TableHead className={cn(getHeaderClass('hubspotDealId'), "text-[11px]")} onClick={() => handleSort('hubspotDealId')}>Hubspot Deal ID</TableHead>
                  <TableHead className={cn(getHeaderClass('typeOfCollection'), "text-[11px]")} onClick={() => handleSort('typeOfCollection')}>Collection Type</TableHead>
                  <TableHead className={cn(getHeaderClass('categories'), "text-[11px]")} onClick={() => handleSort('categories')}>Categories</TableHead>
                  <TableHead className={cn(getHeaderClass('storeLists'), "text-[11px]")} onClick={() => handleSort('storeLists')}>Standard Lists</TableHead>
                  <TableHead className={cn(getHeaderClass('submittedBy'), "text-[11px]")} onClick={() => handleSort('submittedBy')}>Submitted By</TableHead>
                  <TableHead className={cn(getHeaderClass('timestamp'), "text-[11px]")} onClick={() => handleSort('timestamp')}>Date Submitted</TableHead>
                  <TableHead className={cn(getHeaderClass('opsTeamNotes'), "text-[11px]")} onClick={() => handleSort('opsTeamNotes')}>Ops Notes</TableHead>
                  <TableHead className="text-[11px]">Order Notes</TableHead>
                  <TableHead className="text-[11px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : sortedAndFilteredData.length > 0 ? (
                  sortedAndFilteredData.map(order => {
                    const allItemNotes = order.items.map(item => item.notes).filter(Boolean);
                    return (
                    <TableRow key={order.id} className="cursor-pointer" onClick={() => onEdit(order)}>
                      <TableCell className="text-[11px] font-mono">{order.id.split('-')[1]}</TableCell>
                       <TableCell>
                        <Badge className={cn("text-white", getStatusColor(order.status))}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-[11px] font-medium">{order.customer}</TableCell>
                      <TableCell className="text-[11px]">{order.hubspotDealId || '--'}</TableCell>
                      <TableCell className="text-[11px]">{order.typeOfCollection || '--'}</TableCell>
                      <TableCell className="text-[11px]">
                         <Tooltip>
                           <TooltipTrigger>
                             <span className="underline decoration-dotted">{order.items.length} item(s)</span>
                           </TooltipTrigger>
                           <TooltipContent>
                             <ul className="list-disc list-inside text-[11px]">
                               {order.items.map((item, index) => (
                                 <li key={index}>{item.categoryName} ({item.country})</li>
                               ))}
                             </ul>
                           </TooltipContent>
                         </Tooltip>
                      </TableCell>
                      <TableCell className="text-[11px]">
                          <Tooltip>
                           <TooltipTrigger>
                             <span className="underline decoration-dotted">
                                {
                                  // Get unique list names across all items in the order
                                  [...new Set(order.items.flatMap(item => 
                                    item.retailers.filter(r => r.type === 'Standard').map(r => r.listName)
                                  ))].join(', ') || '--'
                                }
                             </span>
                           </TooltipTrigger>
                           <TooltipContent>
                             <ul className="list-disc list-inside text-[11px]">
                                {[...new Set(order.items.flatMap(item => 
                                  item.retailers.filter(r => r.type === 'Standard').map(r => r.listName)
                                ))].map((listName, index) => (
                                  <li key={index}>{listName}</li>
                                ))}
                             </ul>
                           </TooltipContent>
                         </Tooltip>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {order.submittedBy}
                      </TableCell>
                      <TableCell className="text-[11px]">{format(new Date(order.timestamp), "P")}</TableCell>
                      <TableCell className="text-[11px] max-w-[150px] truncate">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>{order.opsTeamNotes}</span>
                            </TooltipTrigger>
                             <TooltipContent side="bottom" align="start">
                                <p className="max-w-md whitespace-pre-wrap text-[11px]">{order.opsTeamNotes}</p>
                            </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-center">
                        {allItemNotes.length > 0 ? (
                           <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" align="start">
                                <div className="space-y-2 p-2 max-w-md">
                                  {order.items.map((item, index) => item.notes ? (
                                    <div key={index} className="text-[11px]">
                                      <p className="font-bold">{item.categoryName} ({item.country}):</p>
                                      <p className="whitespace-pre-wrap pl-2">{item.notes}</p>
                                    </div>
                                  ) : null)}
                                </div>
                              </TooltipContent>
                           </Tooltip>
                        ): (
                            <span className="text-muted-foreground text-xs">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isDeletedTable ? (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onStatusChange(order.id, 'New')}>
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                             <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => {e.stopPropagation(); onEdit(order)}}>
                                <Edit className="h-4 w-4" />
                             </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
                ) : (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center">
                      No orders found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </TooltipProvider>
    </div>
  );
}


export default function AllOrdersPage() {
  const firestore = useFirestore();
  const [version, setVersion] = useState(0); // Forcing refetch
  const ordersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'orders') : null, [firestore, version]);
  const { data: orders, isLoading } = useCollection<Order>(ordersQuery);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { toast } = useToast();

  const handleDataChange = useCallback(() => {
    setVersion(v => v + 1);
  }, []);

  const handleEdit = (order: Order) => {
    setSelectedOrder(order);
    setIsEditOpen(true);
  };
  
  const handleStatusChange = async (orderId: string, status: Order['status']) => {
    if (!firestore) return;
    const orderRef = doc(firestore, 'orders', orderId);
    setDoc(orderRef, { status }, { merge: true })
        .then(() => {
            toast({
                title: `Order ${status === 'Deleted' ? 'Deleted' : 'Restored'}`,
                description: `The order has been successfully ${status === 'Deleted' ? 'deleted' : 'restored'}.`
            });
            handleDataChange();
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: { status },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };

  const handlePermanentDelete = async (orderId: string) => {
    if (!firestore) return;
    const orderRef = doc(firestore, 'orders', orderId);
    deleteDoc(orderRef)
        .then(() => {
            toast({
                title: 'Order Permanently Deleted',
                description: `Order ${orderId} has been permanently removed.`
            });
            handleDataChange();
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'delete',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };


  const { activeOrders, deletedOrders } = useMemo(() => {
    const active: Order[] = [];
    const deleted: Order[] = [];
    if (orders) {
        orders.forEach(order => {
            if (order.status === 'Deleted') {
                deleted.push(order);
            } else {
                active.push(order);
            }
        });
    }
    return { activeOrders: active, deletedOrders: deleted };
  }, [orders]);


  return (
    <div className="container mx-auto max-w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Review Submitted Orders</h1>
          <p className="text-xs text-muted-foreground">
            Review, edit, and manage all submitted orders.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/categories">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Categories
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="active">
            <CardHeader>
                <TabsList>
                  <TabsTrigger value="active" className="text-[11px]">All Orders ({activeOrders.length})</TabsTrigger>
                  <TabsTrigger value="deleted" className="text-[11px]">Deleted Orders ({deletedOrders.length})</TabsTrigger>
                </TabsList>
            </CardHeader>
            <TabsContent value="active" className="p-4">
               <OrdersTable 
                  orders={activeOrders}
                  isLoading={isLoading}
                  onEdit={handleEdit}
                  onStatusChange={handleStatusChange}
                  onPermanentDelete={handlePermanentDelete}
               />
            </TabsContent>
            <TabsContent value="deleted" className="p-4">
                <OrdersTable 
                  orders={deletedOrders}
                  isLoading={isLoading}
                  isDeletedTable={true}
                  onEdit={handleEdit}
                  onStatusChange={handleStatusChange}
                  onPermanentDelete={handlePermanentDelete}
               />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedOrder && (
        <EditOrderDialog
          isOpen={isEditOpen}
          setIsOpen={setIsEditOpen}
          order={selectedOrder}
          onSuccess={handleDataChange}
        />
      )}
    </div>
  );
}
