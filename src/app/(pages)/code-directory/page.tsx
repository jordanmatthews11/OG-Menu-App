"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription
} from "@/components/ui/card";
import { Loader2, ArrowUpDown, Search, ArrowLeft, Info, FileCode, FileSpreadsheet, AlertTriangle, History, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Category, CustomCategoryCode, LegacyCode } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type UnifiedCode = {
  id: string;
  name: string;
  number: string;
  codeType: 'Standard' | 'Custom' | 'Legacy';
  country?: string;
  department?: string;
  customer?: string;
  jobIds?: string;
};

type SortConfig = {
  key: keyof UnifiedCode;
  direction: "asc" | "desc";
} | null;

export default function CodeDirectoryPage() {
  const firestore = useFirestore();
  
  const categoriesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'categories') : null, [firestore]);
  const customCodesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'customCategoryCodes') : null, [firestore]);
  const legacyCodesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'legacyCodes') : null, [firestore]);
  
  const { data: categories, isLoading: isLoadingCategories, error: errorCategories } = useCollection<Category>(categoriesQuery);
  const { data: customCodes, isLoading: isLoadingCustomCodes, error: errorCustomCodes } = useCollection<CustomCategoryCode>(customCodesQuery);
  const { data: legacyCodes, isLoading: isLoadingLegacyCodes, error: errorLegacyCodes } = useCollection<LegacyCode>(legacyCodesQuery);

  const { toast } = useToast();

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "name",
    direction: "asc",
  });
  const [filter, setFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
  const [isLegacyReportOpen, setIsLegacyReportOpen] = useState(false);
  const [ignoreCountryMismatch, setIgnoreCountryMismatch] = useState(false);
  
  const isLoading = isLoadingCategories || isLoadingCustomCodes || isLoadingLegacyCodes;
  const error = errorCategories || errorCustomCodes || errorLegacyCodes;

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to load code directory",
        description: "Could not fetch code data. Please try again.",
      });
      console.error("Error fetching codes:", error);
    }
  }, [error, toast]);

  const unifiedCodes = useMemo((): UnifiedCode[] => {
    const standardCodes: UnifiedCode[] = (categories || []).map(c => ({
      id: c.id,
      name: c.name,
      number: c.number,
      codeType: 'Standard',
      country: c.country,
      department: c.department,
      customer: undefined,
      jobIds: undefined,
    }));

    const otherCodes: UnifiedCode[] = (customCodes || []).map(c => ({
      id: c.id,
      name: c.category,
      number: c.categoryCode,
      codeType: c.codeType as 'Custom' | 'Legacy',
      country: undefined,
      department: undefined,
      customer: c.customer,
      jobIds: c.jobIds,
    }));

    return [...standardCodes, ...otherCodes];
  }, [categories, customCodes]);

  const unidentifiedCodes = useMemo(() => {
    if (!legacyCodes || !unifiedCodes) return [];
    
    const existingCodeNumbers = new Set(unifiedCodes.map(uc => uc.number.trim().toLowerCase()));
    
    // Filter legacy codes that aren't in the unified list
    // Use a Set to ensure we only show unique unidentified codes
    const uniqueMissing = new Map<string, LegacyCode>();
    
    legacyCodes.forEach(lc => {
        const cleanCode = lc.code.trim().toLowerCase();
        if (!existingCodeNumbers.has(cleanCode) && !uniqueMissing.has(cleanCode)) {
            uniqueMissing.set(cleanCode, lc);
        }
    });
    
    return Array.from(uniqueMissing.values());
  }, [legacyCodes, unifiedCodes]);

  const duplicateCodes = useMemo(() => {
    const codesByNumber = unifiedCodes.reduce<Record<string, UnifiedCode[]>>((acc, code) => {
        if (!acc[code.number]) {
            acc[code.number] = [];
        }
        acc[code.number].push(code);
        return acc;
    }, {});
    
    return Object.entries(codesByNumber)
        .filter(([_, codes]) => {
            if (codes.length <= 1) return false;
            if (codes[0].number.trim() === '') return false;
            
            if (ignoreCountryMismatch) {
                const firstCategoryName = codes[0].name;
                const allHaveSameName = codes.every(c => c.name === firstCategoryName);

                if (allHaveSameName) {
                    const uniqueCountries = new Set(codes.map(c => c.country).filter(Boolean));
                    // This is only a "safe" duplicate if each entry has a unique country.
                    // If countries are not unique (e.g., two entries for 'US'), it's a real duplicate.
                    return uniqueCountries.size !== codes.length;
                }
                
                // If category names are different, it's always a duplicate to be reviewed.
                return true;
            }
            
            // Default behavior: if checkbox is off, any code with > 1 entry is a duplicate.
            return true;
        })
        .reduce<Record<string, UnifiedCode[]>>((acc, [number, codes]) => {
            acc[number] = codes;
            return acc;
        }, {});
  }, [unifiedCodes, ignoreCountryMismatch]);


  const availableCountries = useMemo(() => {
    if (!categories) return ["all"];
    const countries = new Set(categories.map(c => c.country).filter(Boolean));
    return ["all", ...Array.from(countries).sort()];
  }, [categories]);

  const handleSort = (key: keyof UnifiedCode) => {
    setSortConfig((currentSort) => {
      if (currentSort && currentSort.key === key) {
        return {
          key,
          direction: currentSort.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
  };

  const sortedAndFilteredCodes = useMemo(() => {
    let result = [...unifiedCodes];

    if (countryFilter !== 'all') {
        result = result.filter(c => c.country === countryFilter);
    }

    if (filter) {
      const lowercasedFilter = filter.toLowerCase();
      result = result.filter((code) =>
        Object.values(code).some(value => 
            String(value).toLowerCase().includes(lowercasedFilter)
        )
      );
    }
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [unifiedCodes, filter, sortConfig, countryFilter]);

  const exportToCsv = () => {
    if (!sortedAndFilteredCodes) return;
    const csv = Papa.unparse(sortedAndFilteredCodes);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "master-code-directory.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToXlsx = () => {
    toast({ title: "Feature coming soon!", description: "Excel exports will be available in a future update."})
  };

  const renderSortIcon = (key: keyof UnifiedCode) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const getHeaderClass = (key: keyof UnifiedCode) =>
    cn(
      "cursor-pointer hover:bg-muted/50",
      sortConfig?.key === key && "text-foreground"
    );

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4 text-muted-foreground">Loading master code directory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-sm font-bold tracking-tight">
            Master Code Directory
          </h1>
          <p className="text-[11px] text-muted-foreground">
            A master reference for all standard, custom, and legacy category codes.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/categories">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Categories
          </Link>
        </Button>
      </div>
      
       <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-[11px]">Note</AlertTitle>
        <AlertDescription className="text-[11px]">
          All data is managed via the <span className="font-semibold">Admin Console</span>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-4">
            <CardTitle className="text-xs">Directory ({sortedAndFilteredCodes.length} results)</CardTitle>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search all fields..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-10 h-8 text-[11px]"
                />
              </div>
                <Select value={countryFilter} onValueChange={setCountryFilter}>
                    <SelectTrigger className="w-[160px] h-8 text-[11px]">
                        <SelectValue placeholder="Filter by country..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableCountries.map(country => (
                        <SelectItem key={country} value={country} className="text-[11px]">
                            {country === 'all' ? 'All Countries' : country}
                        </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <Button onClick={() => setIsLegacyReportOpen(true)} variant="outline" size="sm" className="text-[11px] h-8">
                    <History className="mr-2 h-4 w-4" />
                    Codes without Category Listed
                </Button>
                 <Button onClick={() => setIsDuplicatesOpen(true)} variant="destructive" size="sm" className="text-[11px] h-8">
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Identify Duplicates
                </Button>
                <Button onClick={exportToCsv} variant="outline" size="sm" disabled={!sortedAndFilteredCodes || sortedAndFilteredCodes.length === 0} className="text-[11px] h-8">
                    <FileCode className="mr-2 h-4 w-4" />
                    Export CSV
                </Button>
                <Button onClick={exportToXlsx} variant="outline" size="sm" disabled={!sortedAndFilteredCodes || sortedAndFilteredCodes.length === 0} className="text-[11px] h-8">
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export XLSX
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[65vh]">
            <Table className="text-[11px]">
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className={cn(getHeaderClass("name"), "py-1.5")}>
                    <div className="flex items-center">Category {renderSortIcon("name")}</div>
                  </TableHead>
                  <TableHead className={cn(getHeaderClass("number"), "py-1.5")}>
                    <div className="flex items-center">Code {renderSortIcon("number")}</div>
                  </TableHead>
                  <TableHead className={cn(getHeaderClass("codeType"), "py-1.5")}>
                    <div className="flex items-center">Code Type {renderSortIcon("codeType")}</div>
                  </TableHead>
                  <TableHead className={cn(getHeaderClass("country"), "py-1.5")}>
                    <div className="flex items-center">Country {renderSortIcon("country")}</div>
                  </TableHead>
                  <TableHead className={cn(getHeaderClass("department"), "py-1.5")}>
                    <div className="flex items-center">Department {renderSortIcon("department")}</div>
                  </TableHead>
                   <TableHead className={cn(getHeaderClass("customer"), "py-1.5")}>
                    <div className="flex items-center">Customer {renderSortIcon("customer")}</div>
                  </TableHead>
                  <TableHead className={cn(getHeaderClass("jobIds"), "py-1.5")}>
                    <div className="flex items-center">Job ID(s) {renderSortIcon("jobIds")}</div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAndFilteredCodes.map((code) => (
                  <TableRow key={code.id} className="h-8">
                    <TableCell className="font-medium p-1.5">{code.name}</TableCell>
                    <TableCell className="p-1.5"><Badge variant="secondary">{code.number}</Badge></TableCell>
                    <TableCell className="p-1.5">
                        <Badge 
                            variant={
                                code.codeType === 'Standard' ? 'outline' : 
                                code.codeType === 'Custom' ? 'default' : 
                                'destructive'
                            }
                        >
                            {code.codeType}
                        </Badge>
                    </TableCell>
                    <TableCell className="p-1.5">{code.country || '--'}</TableCell>
                    <TableCell className="p-1.5 text-muted-foreground">{code.department || '--'}</TableCell>
                    <TableCell className="p-1.5 text-muted-foreground">{code.customer || '--'}</TableCell>
                    <TableCell className="p-1.5 text-muted-foreground">{code.jobIds || '--'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
      
      <Dialog open={isDuplicatesOpen} onOpenChange={setIsDuplicatesOpen}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle className="text-[11px]">Duplicate Code Report</DialogTitle>
                <DialogDescription className="text-[11px]">
                    The following codes appear more than once in the directory. These should be reviewed for accuracy.
                </DialogDescription>
            </DialogHeader>
            <div className="flex items-center space-x-2 my-4">
                <Checkbox 
                    id="ignore-country-mismatch"
                    checked={ignoreCountryMismatch}
                    onCheckedChange={(checked) => setIgnoreCountryMismatch(!!checked)}
                />
                <Label htmlFor="ignore-country-mismatch" className="text-[11px] font-medium leading-none cursor-pointer">
                    Ignore entries that are unique per country
                </Label>
            </div>
            <ScrollArea className="h-96 pr-4">
                <div className="space-y-4">
                    {Object.keys(duplicateCodes).length > 0 ? (
                        Object.entries(duplicateCodes).map(([codeNumber, codes]) => (
                            <Card key={codeNumber}>
                                <CardHeader className="p-3 bg-muted/50">
                                    <CardTitle className="text-sm">
                                        Duplicate Code: <Badge variant="destructive">{codeNumber}</Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-[11px]">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Category</TableHead>
                                                <TableHead>Code Type</TableHead>
                                                <TableHead>Country/Customer</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {codes.map(c => (
                                                <TableRow key={c.id}>
                                                    <TableCell className="font-medium">{c.name}</TableCell>
                                                    <TableCell><Badge variant={ c.codeType === 'Standard' ? 'outline' : c.codeType === 'Custom' ? 'default' : 'destructive' }>{c.codeType}</Badge></TableCell>
                                                    <TableCell>{c.country || c.customer || '--'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground p-8">
                            <p className="text-[11px]">No true duplicate codes found with the current filter.</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
            <DialogFooter>
                <Button onClick={() => setIsDuplicatesOpen(false)} size="sm">Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLegacyReportOpen} onOpenChange={setIsLegacyReportOpen}>
        <DialogContent className="max-w-xl">
            <DialogHeader>
                <DialogTitle className="text-[11px]">Codes without Category Listed</DialogTitle>
                <DialogDescription className="text-[11px]">
                    These codes were found in your legacy uploads but are currently **missing** from the Standard and Custom directory.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <ScrollArea className="h-96 border rounded-md p-2">
                    {unidentifiedCodes.length > 0 ? (
                        <Table className="text-[11px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Unidentified Code</TableHead>
                                    <TableHead className="text-right">Action Needed</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {unidentifiedCodes.map(lc => (
                                    <TableRow key={lc.id}>
                                        <TableCell className="font-mono font-bold text-blue-600">
                                            {lc.code}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="outline" className="text-[10px] uppercase">Assign to Category</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
                            <Check className="h-8 w-8 text-green-500 mb-2" />
                            <p className="text-[11px]">All uploaded codes are correctly mapped to a category in the directory!</p>
                        </div>
                    )}
                </ScrollArea>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
                <p className="text-[10px] text-muted-foreground flex-1">
                    To resolve these, add them as Custom Category Codes or standard Categories in the Admin Console.
                </p>
                <Button onClick={() => setIsLegacyReportOpen(false)} size="sm">Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
