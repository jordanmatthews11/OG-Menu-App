
"use client";

import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, FileCode, Search, X, FileSpreadsheet, PlusCircle, Edit, Trash2, ArrowUpDown, Download, ChevronsUpDown, AlertTriangle, Wand2, Check, MinusCircle, History } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Category, StoreList, Booster, CustomCategoryCode, AuthorizedUser, Feedback, LegacyCode } from '@/lib/types';
import { useFirestore, useCollection, useMemoFirebase, useUser, errorEmitter } from '@/firebase';
import { collection, doc, writeBatch, setDoc, deleteDoc, getDocs, query, limit } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import Link from 'next/link';
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { notifyCategoryUpdate } from '@/app/actions/notify';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';


type DataType = 'categories' | 'storeLists' | 'boosters' | 'customCategoryCodes' | 'authorizedUsers' | 'feedback' | 'legacyCodes';
type Entity = Category | StoreList | Booster | CustomCategoryCode | AuthorizedUser | Feedback | LegacyCode;
type SortConfig<T> = { key: keyof T, direction: 'asc' | 'desc' } | null;


const categorySchema = z.object({
    name: z.string().min(1, "Category name is required"),
    department: z.string().optional(),
    subDepartment: z.string().optional(),
    number: z.string().min(1, "Category code is required"),
    country: z.string().min(1, "Country is required"),
    premium: z.boolean().default(false),
    description: z.string().optional(),
    notes: z.string().optional(),
});

const storeListSchema = z.object({
    name: z.string().min(1, "List name is required"),
    retailer: z.string().min(1, "Retailer is required"),
    country: z.string().min(1, "Country is required"),
    weeklyQuota: z.coerce.number().min(0).default(0),
    monthlyQuota: z.coerce.number().min(0).default(0),
});

const storeListGroupSchema = z.object({
  name: z.string().min(1, "List name is required"),
  country: z.string().min(1, "Country is required"),
  items: z.array(z.object({
    id: z.string().optional(),
    retailer: z.string().min(1, "Retailer name is required"),
    weeklyQuota: z.coerce.number().min(0).default(0),
    monthlyQuota: z.coerce.number().min(0).default(0),
  })).min(1, "At least one retailer is required"),
});

const boosterSchema = z.object({
    name: z.string().min(1, "Booster name is required"),
    country: z.string().min(1, "Country is required"),
});

const customCategoryCodeSchema = z.object({
    timestamp: z.string().default(() => new Date().toISOString()),
    submittedBy: z.string().min(1, "Submitter is required"),
    customer: z.string().min(1, "Customer is required"),
    category: z.string().min(1, "Category is required"),
    categoryCode: z.string().min(1, "Category code is required"),
    codeType: z.enum(["Standard", "Custom", "Legacy"], { required_error: "You must select a code type." }).default("Custom"),
    jobIds: z.string().optional(),
    notes: z.string().optional(),
});

const authorizedUserSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
});

const feedbackSchema = z.object({
    timestamp: z.string().default(() => new Date().toISOString()),
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address").optional().or(z.literal('')),
    feedbackType: z.enum(["problem", "feature", "general"], { required_error: "Feedback type is required." }).default("general"),
    description: z.string().min(1, "Description is required"),
    details: z.string().optional(),
    page: z.string().optional(),
    feedbackStatus: z.enum(["New", "In Process", "Roadmap", "Declined", "In Consideration", "Complete"]).default("New"),
    adminNotes: z.string().optional(),
});

const legacyCodeSchema = z.object({
    code: z.string().min(1, "Code is required"),
    timestamp: z.string().default(() => new Date().toISOString()),
});


const schemas: Record<DataType, z.ZodObject<any, any>> = {
    categories: categorySchema,
    storeLists: storeListSchema,
    boosters: boosterSchema,
    customCategoryCodes: customCategoryCodeSchema,
    authorizedUsers: authorizedUserSchema,
    feedback: feedbackSchema,
    legacyCodes: legacyCodeSchema,
};

const defaultValues: Record<DataType, any> = {
    categories: { name: '', department: '', subDepartment: '', number: '', country: '', premium: false, description: '', notes: '' },
    storeLists: { name: '', retailer: '', country: '', weeklyQuota: 0, monthlyQuota: 0 },
    boosters: { name: '', country: '' },
    customCategoryCodes: { timestamp: new Date().toISOString(), submittedBy: '', customer: '', category: '', categoryCode: '', codeType: 'Custom', jobIds: '', notes: '' },
    authorizedUsers: { name: '', email: '' },
    feedback: { timestamp: new Date().toISOString(), name: '', email: '', feedbackType: 'general', description: '', details: '', page: '', feedbackStatus: 'New', adminNotes: '' },
    legacyCodes: { code: '', timestamp: new Date().toISOString() },
};


function DataUploader({ onUploadSuccess }: { onUploadSuccess: () => void }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [dataType, setDataType] = useState<DataType | ''>('');
    const [uploadMode, setUploadMode] = useState<'append' | 'replace'>('append');
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isConfirmReplaceOpen, setIsConfirmReplaceOpen] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setFile(event.target.files[0]);
        }
    };
    
    const handleDownloadTemplate = () => {
        if (!dataType) {
            toast({
                variant: 'destructive',
                title: 'No Data Type Selected',
                description: 'Please select a data type to download its template.',
            });
            return;
        }

        const headers: Partial<Record<DataType, string[]>> = {
            categories: ['name', 'department', 'subDepartment', 'number', 'country', 'premium', 'description', 'notes'],
            storeLists: ['name', 'retailer', 'country', 'weeklyQuota', 'monthlyQuota'],
            boosters: ['name', 'country'],
            customCategoryCodes: ['submittedBy', 'customer', 'category', 'categoryCode', 'codeType', 'jobIds', 'notes'],
            authorizedUsers: ['name', 'email'],
            legacyCodes: ['Collection Codes'],
        };
        
        const templateHeaders = headers[dataType];
        if (!templateHeaders || templateHeaders.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Template Not Available',
                description: `A template is not available for the selected data type.`,
            });
            return;
        }

        const csv = Papa.unparse([templateHeaders]);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${dataType}-template.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
            title: 'Template Downloaded',
            description: `The template for ${dataType} has started downloading.`,
        });
    };

    const handleUploadClick = () => {
        if (!firestore || !dataType || !file) {
            toast({
                variant: 'destructive',
                title: 'Missing Information',
                description: 'Please select a data type and a file to upload.',
            });
            return;
        }

        if (uploadMode === 'replace') {
            setIsConfirmReplaceOpen(true);
        } else {
            handleUpload();
        }
    };

    const handleUpload = async () => {
        if (!firestore || !dataType || !file) return;

        setIsUploading(true);
        setIsConfirmReplaceOpen(false);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result;
                let records: any[] = [];

                if (file.name.endsWith('.csv')) {
                    const parsed = Papa.parse(content as string, { header: true, skipEmptyLines: true });
                    records = parsed.data;
                } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const workbook = XLSX.read(content, { type: 'binary' });
                    
                    if (dataType === 'legacyCodes') {
                        // User mentioned 2 tabs with "Collection Codes" header. Read all sheets.
                        workbook.SheetNames.forEach(sheetName => {
                            const sheetRecords = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                            records.push(...sheetRecords);
                        });
                    } else {
                        const sheetName = workbook.SheetNames[0];
                        records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    }
                } else {
                    throw new Error('Unsupported file type. Please upload a CSV or XLSX file.');
                }

                if (records.length === 0) {
                    throw new Error('The uploaded file is empty.');
                }

                const batchSize = 400; // Firestore batch limit is 500 operations

                // Mode: Replace - Delete all existing records first
                if (uploadMode === 'replace') {
                    const existingDocs = await getDocs(collection(firestore, dataType));
                    const deleteBatches = [];
                    let currentDeleteBatch = writeBatch(firestore);
                    let deleteCount = 0;

                    for (const docSnap of existingDocs.docs) {
                        currentDeleteBatch.delete(docSnap.ref);
                        deleteCount++;
                        if (deleteCount === batchSize) {
                            deleteBatches.push(currentDeleteBatch.commit());
                            currentDeleteBatch = writeBatch(firestore);
                            deleteCount = 0;
                        }
                    }
                    if (deleteCount > 0) {
                        deleteBatches.push(currentDeleteBatch.commit());
                    }
                    await Promise.all(deleteBatches);
                }

                const schemaFields = Object.keys(schemas[dataType].shape);

                for (let i = 0; i < records.length; i += batchSize) {
                    const batch = writeBatch(firestore);
                    const batchRecords = records.slice(i, i + batchSize);

                    batchRecords.forEach(record => {
                        const docRef = doc(collection(firestore, dataType));
                        
                        const dataToSave: { [key: string]: any } = { id: docRef.id };
                        
                        schemaFields.forEach(field => {
                            // Find a matching key in the record, ignoring case
                            // Also handle the specific "Collection Codes" header for legacy codes
                            const recordKey = Object.keys(record).find(k => 
                                k.toLowerCase() === field.toLowerCase() || 
                                (field === 'code' && k.toLowerCase() === 'collection codes')
                            );
                            
                            if (recordKey) {
                                const val = record[recordKey];
                                if (val !== undefined) {
                                    dataToSave[field] = String(val).trim();
                                }
                            }
                        });

                        // Coerce types
                        if (dataType === 'storeLists') {
                           dataToSave.weeklyQuota = Number(dataToSave.weeklyQuota) || 0;
                           dataToSave.monthlyQuota = Number(dataToSave.monthlyQuota) || 0;
                        }
                        if (dataType === 'categories') {
                            dataToSave.premium = ['true', 'yes', '1'].includes(String(dataToSave.premium).toLowerCase());
                        }
                        if ((dataType === 'customCategoryCodes' || dataType === 'legacyCodes') && !dataToSave.timestamp) {
                            dataToSave.timestamp = new Date().toISOString();
                        }

                        // Filter out empty rows if crucial fields are missing
                        if (dataType === 'legacyCodes' && !dataToSave.code) return;

                        batch.set(docRef, dataToSave);
                    });

                    await batch.commit();
                }

                toast({
                    title: 'Upload Successful',
                    description: `${records.length} records have been ${uploadMode === 'replace' ? 'replaced' : 'added'} in ${dataType}.`,
                });
                onUploadSuccess();
            } catch (error: any) {
                console.error('Upload Error:', error);
                toast({
                    variant: 'destructive',
                    title: 'Upload Failed',
                    description: error.message || 'An unexpected error occurred during upload.',
                });
            } finally {
                setIsUploading(false);
                setFile(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };

        if (file.name.endsWith('.csv')) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">Database Management</CardTitle>
                <CardDescription className="text-xs">
                    Upload a CSV or XLSX file. Column headers should match the database fields (case-insensitive). Use the template for correct formatting.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="data-type-select" className="text-[11px]">Data Type</Label>
                    <Select value={dataType} onValueChange={(value) => setDataType(value as DataType)}>
                        <SelectTrigger id="data-type-select" className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="categories">Categories</SelectItem>
                            <SelectItem value="storeLists">Store Lists</SelectItem>
                            <SelectItem value="boosters">Boosters</SelectItem>
                            <SelectItem value="customCategoryCodes">Custom Codes</SelectItem>
                            <SelectItem value="authorizedUsers">Authorized Users</SelectItem>
                            <SelectItem value="legacyCodes">Legacy/Unidentified Codes</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="upload-mode-select" className="text-[11px]">Upload Mode</Label>
                    <Select value={uploadMode} onValueChange={(value) => setUploadMode(value as any)}>
                        <SelectTrigger id="upload-mode-select" className="w-[120px] h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="append">Append</SelectItem>
                            <SelectItem value="replace">Replace All</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-1.5 flex-1 min-w-[200px]">
                    <Label htmlFor="file-upload" className="text-[11px]">File</Label>
                    <Input
                        id="file-upload"
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".csv, .xlsx, .xls"
                        className="h-8 text-xs file:text-xs file:font-medium"
                        disabled={!dataType}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleDownloadTemplate} disabled={!dataType} size="sm" variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Template
                    </Button>
                    <Button onClick={handleUploadClick} disabled={!dataType || !file || isUploading} size="sm">
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {isUploading ? 'Uploading...' : 'Upload Data'}
                    </Button>
                </div>
            </CardContent>
             {file && (
                <CardFooter className="p-4 pt-0">
                    <p className="text-xs text-muted-foreground">Selected file: {file.name}</p>
                </CardFooter>
            )}

            <AlertDialog open={isConfirmReplaceOpen} onOpenChange={setIsConfirmReplaceOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will **permanently delete all existing records** in the <span className="font-bold text-foreground">"{dataType}"</span> collection and replace them with the data from your file. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUpload} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete & Replace All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

function AddStoreListGroupDialog({
    isOpen,
    setIsOpen,
    onSuccess,
}: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const form = useForm<z.infer<typeof storeListGroupSchema>>({
        resolver: zodResolver(storeListGroupSchema),
        defaultValues: {
            name: '',
            country: '',
            items: [{ retailer: '', weeklyQuota: 0, monthlyQuota: 0 }],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                name: '',
                country: '',
                items: [{ retailer: '', weeklyQuota: 0, monthlyQuota: 0 }],
            });
        }
    }, [isOpen, form]);


    const onSubmit = async (values: z.infer<typeof storeListGroupSchema>) => {
        if (!firestore) return;
        const batch = writeBatch(firestore);

        values.items.forEach(item => {
            const newDocRef = doc(collection(firestore, 'storeLists'));
            batch.set(newDocRef, {
                id: newDocRef.id,
                name: values.name,
                country: values.country,
                retailer: item.retailer,
                weeklyQuota: item.weeklyQuota || 0,
                monthlyQuota: item.monthlyQuota || 0,
            });
        });

        batch.commit()
            .then(() => {
                toast({
                    title: "Store List Group Created",
                    description: `The "${values.name}" list has been successfully created.`,
                });
                onSuccess();
            })
            .catch(async (serverError) => {
                console.error("Batch create error:", serverError);
                toast({
                    variant: 'destructive',
                    title: "Creation Failed",
                    description: serverError.message || "An unexpected error occurred during batch creation.",
                });
            });
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="text-[11px]">Add New Store List Group</DialogTitle>
                    <DialogDescription className="text-[11px]">Create a new list with one or more retailers.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[11px]">List Name</FormLabel>
                                    <FormControl><Input {...field} className="text-[11px] h-8" /></FormControl>
                                    <FormMessage/>
                                </FormItem>
                            )}/>
                             <FormField control={form.control} name="country" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[11px]">Country</FormLabel>
                                    <FormControl><Input {...field} className="text-[11px] h-8" /></FormControl>
                                    <FormMessage/>
                                </FormItem>
                            )}/>
                        </div>

                        <Separator />
                        
                        <ScrollArea className="h-80 pr-6">
                            <div className="space-y-4">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end">
                                        <FormField control={form.control} name={`items.${index}.retailer`} render={({ field }) => (
                                            <FormItem>
                                                {index === 0 && <FormLabel className="text-[11px]">Retailer</FormLabel>}
                                                <FormControl><Input {...field} className="text-[11px] h-8" /></FormControl>
                                                <FormMessage/>
                                            </FormItem>
                                        )}/>
                                        <FormField control={form.control} name={`items.${index}.weeklyQuota`} render={({ field }) => (
                                            <FormItem>
                                                 {index === 0 && <FormLabel className="text-[11px]">Weekly Quota</FormLabel>}
                                                <FormControl><Input type="number" {...field} className="text-[11px] h-8" /></FormControl>
                                                <FormMessage/>
                                            </FormItem>
                                        )}/>
                                        <FormField control={form.control} name={`items.${index}.monthlyQuota`} render={({ field }) => (
                                            <FormItem>
                                                 {index === 0 && <FormLabel className="text-[11px]">Monthly Quota</FormLabel>}
                                                <FormControl><Input type="number" {...field} className="text-[11px] h-8" /></FormControl>
                                                <FormMessage/>
                                            </FormItem>
                                        )}/>
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}>
                                            <MinusCircle className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                        
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ retailer: '', weeklyQuota: 0, monthlyQuota: 0 })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Retailer
                        </Button>
                        
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} size="sm">Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting} size="sm">
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'Create Group'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

function EditStoreListGroupDialog({
    isOpen,
    setIsOpen,
    groupItems,
    onSuccess,
}: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    groupItems: StoreList[] | null;
    onSuccess: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const form = useForm<z.infer<typeof storeListGroupSchema>>({
        resolver: zodResolver(storeListGroupSchema),
        defaultValues: {
            name: '',
            country: '',
            items: []
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    useEffect(() => {
        if (groupItems && groupItems.length > 0) {
            form.reset({
                name: groupItems[0].name,
                country: groupItems[0].country,
                items: [...groupItems],
            });
        }
    }, [groupItems, form]);

    const onSubmit = async (values: z.infer<typeof storeListGroupSchema>) => {
        if (!firestore || !groupItems) return;
        const batch = writeBatch(firestore);

        const originalIds = new Set(groupItems.map(item => item.id));
        const currentIds = new Set(values.items.map(item => item.id).filter(Boolean));

        // Handle deletions
        originalIds.forEach(id => {
            if (!currentIds.has(id)) {
                batch.delete(doc(firestore, 'storeLists', id));
            }
        });

        // Handle additions and updates
        for (const item of values.items) {
            if (item.id && originalIds.has(item.id)) {
                // Update existing item
                const docRef = doc(firestore, 'storeLists', item.id);
                batch.set(docRef, {
                    name: values.name,
                    country: values.country,
                    retailer: item.retailer,
                    weeklyQuota: item.weeklyQuota || 0,
                    monthlyQuota: item.monthlyQuota || 0,
                    id: item.id,
                });
            } else {
                // Add new item
                const newDocRef = doc(collection(firestore, 'storeLists'));
                batch.set(newDocRef, {
                    id: newDocRef.id,
                    name: values.name,
                    country: values.country,
                    retailer: item.retailer,
                    weeklyQuota: item.weeklyQuota || 0,
                    monthlyQuota: item.monthlyQuota || 0
                });
            }
        }

        batch.commit()
            .then(() => {
                toast({
                    title: "Store List Updated",
                    description: `The "${values.name}" list has been successfully updated.`,
                });
                onSuccess();
            })
            .catch(async (serverError) => {
                console.error("Batch update error:", serverError);
                toast({
                    variant: 'destructive',
                    title: "Update Failed",
                    description: serverError.message || "An unexpected error occurred during batch update.",
                });
            });
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="text-[11px]">Edit Store List Group</DialogTitle>
                    <DialogDescription className="text-[11px]">Edit all retailers for &quot;{groupItems?.[0]?.name}&quot; at once.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[11px]">List Name</FormLabel>
                                    <FormControl><Input {...field} className="text-[11px] h-8" /></FormControl>
                                    <FormMessage/>
                                </FormItem>
                            )}/>
                             <FormField control={form.control} name="country" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[11px]">Country</FormLabel>
                                    <FormControl><Input {...field} className="text-[11px] h-8" /></FormControl>
                                    <FormMessage/>
                                </FormItem>
                            )}/>
                        </div>

                        <Separator />
                        
                        <ScrollArea className="h-80 pr-6">
                            <div className="space-y-4">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end">
                                        <FormField control={form.control} name={`items.${index}.retailer`} render={({ field }) => (
                                            <FormItem>
                                                {index === 0 && <FormLabel className="text-[11px]">Retailer</FormLabel>}
                                                <FormControl><Input {...field} className="text-[11px] h-8" /></FormControl>
                                                <FormMessage/>
                                            </FormItem>
                                        )}/>
                                        <FormField control={form.control} name={`items.${index}.weeklyQuota`} render={({ field }) => (
                                            <FormItem>
                                                 {index === 0 && <FormLabel className="text-[11px]">Weekly Quota</FormLabel>}
                                                <FormControl><Input type="number" {...field} className="text-[11px] h-8" /></FormControl>
                                                <FormMessage/>
                                            </FormItem>
                                        )}/>
                                        <FormField control={form.control} name={`items.${index}.monthlyQuota`} render={({ field }) => (
                                            <FormItem>
                                                 {index === 0 && <FormLabel className="text-[11px]">Monthly Quota</FormLabel>}
                                                <FormControl><Input type="number" {...field} className="text-[11px] h-8" /></FormControl>
                                                <FormMessage/>
                                            </FormItem>
                                        )}/>
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}>
                                            <MinusCircle className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                        
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ retailer: '', weeklyQuota: 0, monthlyQuota: 0 })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Retailer
                        </Button>
                        
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} size="sm">Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting} size="sm">
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

function EditDialog({
    isOpen,
    setIsOpen,
    dataType,
    entity,
    onSuccess,
}: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    dataType: DataType;
    entity: Entity | null;
    onSuccess: (isNew: boolean) => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const schema = schemas[dataType];
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
    });

    const isNew = !entity?.id;

    useEffect(() => {
        if (isOpen) {
            form.reset(isNew ? defaultValues[dataType] : entity);
        }
    }, [isOpen, entity, isNew, dataType, form]);


    const getFieldType = (fieldName: string) => {
        let fieldSchema: any = schema.shape[fieldName];
        
        // Unwrap ZodDefault to get the inner type if it exists
        if (fieldSchema._def.typeName === 'ZodDefault') {
            fieldSchema = fieldSchema._def.innerType;
        }

        const typeName = fieldSchema?._def?.typeName;

        if (typeName === 'ZodEnum') return 'select';
        if (typeName === 'ZodBoolean') return 'checkbox';
        if (typeName === 'ZodNumber') return 'number';
        if (['description', 'details', 'notes', 'adminNotes'].includes(fieldName)) return 'textarea';
        return 'text';
    };

    const getEnumOptions = (fieldName: string) => {
        let fieldSchema: any = schema.shape[fieldName];

        if (fieldSchema._def.typeName === 'ZodDefault') {
            fieldSchema = fieldSchema._def.innerType;
        }
        
        const typeName = fieldSchema?._def?.typeName;
        if (typeName === 'ZodEnum') {
            return fieldSchema._def.values;
        }
        return [];
    };

    const onSubmit = async (values: z.infer<typeof schema>) => {
        if (!firestore) return;
        try {
            let docRef;
            // Clean undefined values to prevent Firestore errors
            const cleanedValues = Object.fromEntries(
                Object.entries(values).filter(([_, v]) => v !== undefined)
            );
            let dataToSave: any = { ...cleanedValues };

            if (isNew) {
                const newDocRef = doc(collection(firestore, dataType));
                docRef = newDocRef;
                dataToSave.id = newDocRef.id;
                if ('timestamp' in schema.shape) {
                    dataToSave.timestamp = new Date().toISOString();
                }
            } else {
                docRef = doc(firestore, dataType, entity.id);
            }

            setDoc(docRef, dataToSave, { merge: true })
                .then(async () => {
                    if (dataType === 'categories') {
                        await notifyCategoryUpdate(dataToSave as Category);
                    }
                    
                    toast({
                        title: isNew ? "Record Created" : "Record Updated",
                        description: `The record has been successfully ${isNew ? 'created' : 'updated'}.`,
                    });
                    onSuccess(isNew);
                    setIsOpen(false);
                })
                .catch(async (serverError) => {
                    const permissionError = new FirestorePermissionError({
                        path: docRef.path,
                        operation: isNew ? 'create' : 'update',
                        requestResourceData: dataToSave,
                    } satisfies SecurityRuleContext);
                    errorEmitter.emit('permission-error', permissionError);
                });

        } catch (error: any) {
            console.error("Save Error:", error);
            toast({
                variant: 'destructive',
                title: "Save Failed",
                description: error.message || "An unexpected error occurred.",
            });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-[11px]">
                        {isNew ? 'Add New' : 'Edit'} {dataType.charAt(0).toUpperCase() + dataType.slice(1, -1)}
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <ScrollArea className="h-96 pr-6">
                            <div className="space-y-4">
                                {Object.keys(schema.shape).map(fieldName => {
                                    if (fieldName === 'id' || fieldName === 'timestamp') return null;
                                    const fieldType = getFieldType(fieldName);
                                    
                                    return (
                                        <FormField
                                            key={fieldName}
                                            control={form.control}
                                            name={fieldName}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[11px]">
                                                        {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                                    </FormLabel>
                                                    <FormControl>
                                                        {fieldType === 'select' ? (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger className="text-[11px] h-8"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    {getEnumOptions(fieldName).map((o: string) => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        ) : fieldType === 'textarea' ? (
                                                            <Textarea {...field} className="text-[11px]" />
                                                        ) : fieldType === 'checkbox' ? (
                                                            <div className="flex items-center h-8">
                                                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                                            </div>
                                                        ) : (
                                                            <Input {...field} type={fieldType} className="text-[11px] h-8" value={field.value || ''}/>
                                                        )}
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    );
                                })}
                            </div>
                        </ScrollArea>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} size="sm">Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting} size="sm">
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'Save Record'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function DataTable<T extends Entity>({ columns, data, isLoading, tableName, dataType, onDataChange, children }: { columns: (keyof T)[], data: T[] | null, isLoading: boolean, tableName: string, dataType: DataType, onDataChange: () => void, children?: React.ReactNode }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig<T>>({ key: columns[0], direction: 'asc' });
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<StoreList[] | null>(null);
    const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);
    
    const handleSuccess = () => {
        onDataChange();
        setIsDialogOpen(false);
    };

    const handleGroupSuccess = () => {
        onDataChange();
        setIsGroupDialogOpen(false);
    };

    const handleAddGroupSuccess = () => {
        onDataChange();
        setIsAddGroupDialogOpen(false);
    };

    const sortedAndFilteredData = useMemo(() => {
        if (!data) {
            return [];
        }
        let result: T[] = data ? [...data] : [];
        
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
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [data, filter, sortConfig]);

    const handleSort = (key: keyof T) => {
        setSortConfig(prevSort => {
            if (prevSort && prevSort.key === key) {
                return { key, direction: prevSort.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const renderSortIcon = (key: keyof T) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground/50" />;
        }
        return <ArrowUpDown className="ml-2 h-3 w-3" />;
    };

    const getHeaderClass = (key: keyof T) => cn(
        "cursor-pointer hover:bg-muted/50 text-[11px]",
        sortConfig?.key === key && "text-foreground"
    );

    const handleEdit = (entity: Entity) => {
        setSelectedEntity(entity);
        setIsDialogOpen(true);
    };

    const handleEditGroup = (row: T) => {
        if (dataType !== 'storeLists' || !data) return;
        const groupName = (row as unknown as StoreList).name;
        const groupItems = (data as unknown as StoreList[]).filter(item => item.name === groupName);
        setSelectedGroup(groupItems);
        setIsGroupDialogOpen(true);
    };

    const handleAdd = () => {
        setSelectedEntity(null);
        setIsDialogOpen(true);
    };

    const handleDelete = async (entity: Entity) => {
        if (!entity.id || !firestore) return;
        
        const docRef = doc(firestore, dataType, entity.id);
        deleteDoc(docRef)
            .then(() => {
                toast({
                    title: "Record Deleted",
                    description: "The record has been successfully deleted.",
                });
                onDataChange();
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'delete',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };


    const exportToCsv = () => {
        if (!sortedAndFilteredData) return;
        const csv = Papa.unparse(sortedAndFilteredData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${tableName.toLowerCase()}-export.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportToXlsx = () => {
        if (!sortedAndFilteredData) return;
        const worksheet = XLSX.utils.json_to_sheet(sortedAndFilteredData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, tableName);
        XLSX.writeFile(workbook, `${tableName.toLowerCase()}-export.xlsx`);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2 text-[11px]">Loading data...</span>
            </div>
        );
    }
    
    const tableColumns = [...columns];
    if (dataType !== 'categories' && dataType !== 'storeLists' && dataType !== 'boosters') {
        const idIndex = tableColumns.indexOf('id' as any);
        if (idIndex > -1) {
            tableColumns.splice(idIndex, 1);
        }
    }

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search table..." 
                            className="pl-8 h-8 text-[11px]"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                        {filter && (
                            <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setFilter('')}>
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                     {children}
                </div>
                <div className="flex items-center gap-2">
                     {dataType === 'storeLists' ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Add New
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onSelect={handleAdd}>
                                    Add Single Retailer
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setIsAddGroupDialogOpen(true)}>
                                    Add New List Group
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                     ) : (
                        <Button onClick={handleAdd} variant="outline" size="sm">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add New
                        </Button>
                     )}
                    <Button onClick={exportToCsv} variant="outline" size="sm" disabled={!sortedAndFilteredData || sortedAndFilteredData.length === 0}>
                        <FileCode className="mr-2 h-4 w-4" />
                        Export CSV
                    </Button>
                    <Button onClick={exportToXlsx} variant="outline" size="sm" disabled={!sortedAndFilteredData || sortedAndFilteredData.length === 0}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Export XLSX
                    </Button>
                </div>
            </div>
            <ScrollArea className="h-[50vh] border rounded-md">
                <Table>
                    <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                            {tableColumns.map(col => {
                                let header = String(col).replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                if (dataType === 'categories' && col === 'number') {
                                    header = 'Category Code';
                                }
                                if (dataType === 'categories' && col === 'notes') {
                                    header = 'Collection Notes';
                                }
                                if (dataType === 'feedback' && col === 'page') {
                                    header = 'Source Page';
                                }
                                if (dataType === 'feedback' && col === 'adminNotes') {
                                    header = 'Admin Notes/Resolution';
                                }
                                 if (dataType === 'feedback' && col === 'feedbackStatus') {
                                    header = 'Feedback Status';
                                }
                                return (
                                <TableHead key={String(col)} className={getHeaderClass(col as keyof T)} onClick={() => handleSort(col as keyof T)}>
                                    <div className="flex items-center">
                                        {header}
                                        {renderSortIcon(col as keyof T)}
                                    </div>
                                </TableHead>
                            )})}
                            <TableHead className="text-[11px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedAndFilteredData.length > 0 ? sortedAndFilteredData.map((row, index) => (
                            <TableRow key={row.id || index}>
                                {tableColumns.map(col => (
                                    <TableCell key={String(col)} className="text-[11px] max-w-[200px] whitespace-pre-wrap">
                                        {(() => {
                                            const val = (row as any)[col];
                                            if ((dataType === 'feedback' || dataType === 'customCategoryCodes' || dataType === 'legacyCodes') && col === 'timestamp' && val) {
                                                try {
                                                    return format(new Date(val), "PPp");
                                                } catch {
                                                    return val; // Fallback to raw value if parsing fails
                                                }
                                            }
                                            if (typeof val === 'boolean') {
                                                return <Badge variant={val ? 'default' : 'secondary'}>{val ? 'Yes' : 'No'}</Badge>;
                                            }
                                            return val;
                                        })()}
                                    </TableCell>
                                ))}
                                <TableCell className="flex gap-1 items-center">
                                    {dataType === 'storeLists' && (index === 0 || (row as any).name !== (sortedAndFilteredData[index-1] as any).name) && (
                                        <Button variant="outline" size="sm" onClick={() => handleEditGroup(row)}>
                                            Edit Group
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(row)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This action cannot be undone. This will permanently delete the record.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(row)}>Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={tableColumns.length + 1} className="h-24 text-center text-[11px]">
                                    No results found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </ScrollArea>
             <EditDialog 
                isOpen={isDialogOpen} 
                setIsOpen={setIsDialogOpen} 
                dataType={dataType}
                entity={selectedEntity} 
                onSuccess={handleSuccess}
             />
             {dataType === 'storeLists' && (
                <>
                    <AddStoreListGroupDialog
                        isOpen={isAddGroupDialogOpen}
                        setIsOpen={setIsAddGroupDialogOpen}
                        onSuccess={handleAddGroupSuccess}
                    />
                    <EditStoreListGroupDialog
                        isOpen={isGroupDialogOpen}
                        setIsOpen={setIsGroupDialogOpen}
                        groupItems={selectedGroup}
                        onSuccess={handleGroupSuccess}
                    />
                </>
             )}
        </div>
    );
}

function CategoriesTable({ data, isLoading, onDataChange }: { data: Category[] | null; isLoading: boolean; onDataChange: () => void; }) {
    const columns: (keyof Category)[] = ['name', 'department', 'subDepartment', 'number', 'country', 'premium', 'description', 'notes'];
    return <DataTable columns={columns} data={data} isLoading={isLoading} tableName="Categories" dataType="categories" onDataChange={onDataChange} />;
}

function StoreListsTable({ data, isLoading, onDataChange }: { data: StoreList[] | null; isLoading: boolean; onDataChange: () => void; }) {
    const columns: (keyof StoreList)[] = ['name', 'retailer', 'country', 'weeklyQuota', 'monthlyQuota'];
    return <DataTable columns={columns} data={data} isLoading={isLoading} tableName="StoreLists" dataType="storeLists" onDataChange={onDataChange} />;
}

function BoostersTable({ data, isLoading, onDataChange }: { data: Booster[] | null; isLoading: boolean; onDataChange: () => void; }) {
    const columns: (keyof Booster)[] = ['name', 'country'];
    return <DataTable columns={columns} data={data} isLoading={isLoading} tableName="Boosters" dataType="boosters" onDataChange={onDataChange} />;
}

function CustomCategoryCodesTable({ data, isLoading, onDataChange }: { data: CustomCategoryCode[] | null; isLoading: boolean; onDataChange: () => void; }) {
    const columns: (keyof CustomCategoryCode)[] = ['timestamp', 'submittedBy', 'customer', 'category', 'categoryCode', 'codeType', 'jobIds', 'notes'];
    return <DataTable columns={columns} data={data} isLoading={isLoading} tableName="CustomCategoryCodes" dataType="customCategoryCodes" onDataChange={onDataChange} />;
}

function AuthorizedUsersTable({ data, isLoading, onDataChange }: { data: AuthorizedUser[] | null; isLoading: boolean; onDataChange: () => void; }) {
    const columns: (keyof AuthorizedUser)[] = ['name', 'email'];
    return <DataTable columns={columns} data={data} isLoading={isLoading} tableName="AuthorizedUsers" dataType="authorizedUsers" onDataChange={onDataChange} />;
}

function FeedbackTable({ data, isLoading, onDataChange }: { data: Feedback[] | null; isLoading: boolean; onDataChange: () => void; }) {
    const columns: (keyof Feedback)[] = ['timestamp', 'name', 'feedbackType', 'description', 'details', 'page', 'feedbackStatus', 'adminNotes'];
    
    return (
        <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            tableName="Feedback"
            dataType="feedback"
            onDataChange={onDataChange}
        />
    );
}

function LegacyCodesTable({ data, isLoading, onDataChange }: { data: LegacyCode[] | null; isLoading: boolean; onDataChange: () => void; }) {
    const columns: (keyof LegacyCode)[] = ['timestamp', 'code'];
    return <DataTable columns={columns} data={data} isLoading={isLoading} tableName="LegacyCodes" dataType="legacyCodes" onDataChange={onDataChange} />;
}

export default function AdminConsolePage() {
  const [version, setVersion] = useState(0);
  const firestore = useFirestore();
  const { user } = useUser();

  const handleDataChange = useCallback(() => {
    setVersion(v => v + 1);
  }, []);
  
  const { data: categories, isLoading: isLoadingCategories, refetch: refetchCategories } = useCollection<Category>(useMemoFirebase(() => firestore ? collection(firestore, 'categories') : null, [firestore, version]));
  const { data: storeLists, isLoading: isLoadingStoreLists, refetch: refetchStoreLists } = useCollection<StoreList>(useMemoFirebase(() => firestore ? collection(firestore, 'storeLists') : null, [firestore, version]));
  const { data: boosters, isLoading: isLoadingBoosters, refetch: refetchBoosters } = useCollection<Booster>(useMemoFirebase(() => firestore ? collection(firestore, 'boosters') : null, [firestore, version]));
  const { data: customCategoryCodes, isLoading: isLoadingCustomCategoryCodes, refetch: refetchCustomCategoryCodes } = useCollection<CustomCategoryCode>(useMemoFirebase(() => firestore ? collection(firestore, 'customCategoryCodes') : null, [firestore, version]));
  const { data: authorizedUsers, isLoading: isLoadingAuthorizedUsers, refetch: refetchAuthorizedUsers } = useCollection<AuthorizedUser>(useMemoFirebase(() => firestore ? collection(firestore, 'authorizedUsers') : null, [firestore, version]));
  const { data: feedback, isLoading: isLoadingFeedback, refetch: refetchFeedback } = useCollection<Feedback>(useMemoFirebase(() => firestore ? collection(firestore, 'feedback') : null, [firestore, version]));
  const { data: legacyCodes, isLoading: isLoadingLegacyCodes, refetch: refetchLegacyCodes } = useCollection<LegacyCode>(useMemoFirebase(() => firestore ? collection(firestore, 'legacyCodes') : null, [firestore, version]));

  const isUserAuthorized = useMemo(() => {
    if (!user || !authorizedUsers) return false;
    return authorizedUsers.some((authUser) => authUser.email === user.email);
  }, [user, authorizedUsers]);

  const handleCompositeDataChange = useCallback(() => {
    refetchCategories();
    refetchStoreLists();
    refetchBoosters();
    refetchCustomCategoryCodes();
    refetchAuthorizedUsers();
    refetchFeedback();
    refetchLegacyCodes();
  }, [refetchCategories, refetchStoreLists, refetchBoosters, refetchCustomCategoryCodes, refetchAuthorizedUsers, refetchFeedback, refetchLegacyCodes]);

  const isLoading = isLoadingCategories || isLoadingStoreLists || isLoadingBoosters || isLoadingCustomCategoryCodes || isLoadingAuthorizedUsers || isLoadingFeedback || isLoadingLegacyCodes;

  const getCount = (data: any[] | null) => (data ? `(${data.length})` : '(...)');

  if (!isLoadingAuthorizedUsers && !isUserAuthorized) {
    return (
      <div className="container mx-auto max-w-full">
        <Alert variant="destructive" className="mt-6">
          <AlertTitle className="text-[11px]">No access to Admin Console</AlertTitle>
          <AlertDescription className="text-[11px]">
            You don't have permission to view this page. If you believe this is an error, please contact an administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-sm font-bold tracking-tight">Admin Console</h1>
            <p className="text-[11px] text-muted-foreground">
                Manage application data via CSV uploads or direct table editing.
            </p>
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="bg-white text-[#4A2D8A] border-[#4A2D8A]/40 hover:bg-white/90 hover:text-[#4A2D8A]"
        >
          <Link href="/all-orders">
            Review Submitted Orders
          </Link>
        </Button>
      </div>
        <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-[11px]">You are in the Admin Console</AlertTitle>
            <AlertDescription className="text-[11px]">
                Changes made here directly affect the database. For creating orders, please use the <Link href="/categories" className="font-semibold underline">Categories Page</Link>.
            </AlertDescription>
        </Alert>
      <div className="grid gap-8">
        <DataUploader onUploadSuccess={handleCompositeDataChange} />
        
        <Tabs defaultValue="categories" className="w-full">
          <TabsList>
            <TabsTrigger value="categories" className="text-[11px]">Categories {getCount(categories)}</TabsTrigger>
            <TabsTrigger value="storeLists" className="text-[11px]">Store Lists {getCount(storeLists)}</TabsTrigger>
            <TabsTrigger value="boosters" className="text-[11px]">Boosters {getCount(boosters)}</TabsTrigger>
            <TabsTrigger value="customCategoryCodes" className="text-[11px]">Custom Codes {getCount(customCategoryCodes)}</TabsTrigger>
            <TabsTrigger value="authorizedUsers" className="text-[11px]">Authorized Users {getCount(authorizedUsers)}</TabsTrigger>
            <TabsTrigger value="feedback" className="text-[11px]">Feedback {getCount(feedback)}</TabsTrigger>
            <TabsTrigger value="legacyCodes" className="text-[11px]">Legacy Codes {getCount(legacyCodes)}</TabsTrigger>
          </TabsList>
          <TabsContent value="categories">
            <Card>
                <CardHeader><CardTitle className="text-[11px]">Categories</CardTitle></CardHeader>
                <CardContent><CategoriesTable data={categories} isLoading={isLoading} onDataChange={handleCompositeDataChange} /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="storeLists">
             <Card>
                <CardHeader><CardTitle className="text-[11px]">Store Lists</CardTitle></CardHeader>
                <CardContent><StoreListsTable data={storeLists} isLoading={isLoading} onDataChange={handleCompositeDataChange} /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="boosters">
             <Card>
                <CardHeader><CardTitle className="text-[11px]">Boosters</CardTitle></CardHeader>
                <CardContent><BoostersTable data={boosters} isLoading={isLoading} onDataChange={handleCompositeDataChange} /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="customCategoryCodes">
             <Card>
                <CardHeader><CardTitle className="text-[11px]">Custom Category Codes</CardTitle></CardHeader>
                <CardContent><CustomCategoryCodesTable data={customCategoryCodes} isLoading={isLoading} onDataChange={handleCompositeDataChange} /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="authorizedUsers">
             <Card>
                <CardHeader><CardTitle className="text-[11px]">Authorized Users</CardTitle></CardHeader>
                <CardContent><AuthorizedUsersTable data={authorizedUsers} isLoading={isLoading} onDataChange={handleCompositeDataChange} /></CardContent>
            </Card>
          </TabsContent>
           <TabsContent value="feedback">
             <Card>
                <CardHeader><CardTitle className="text-[11px]">Feedback</CardTitle></CardHeader>
                <CardContent><FeedbackTable data={feedback} isLoading={isLoading} onDataChange={handleCompositeDataChange} /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="legacyCodes">
             <Card>
                <CardHeader><CardTitle className="text-[11px]">Legacy / Unidentified Codes</CardTitle></CardHeader>
                <CardContent><LegacyCodesTable data={legacyCodes} isLoading={isLoading} onDataChange={handleCompositeDataChange} /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
