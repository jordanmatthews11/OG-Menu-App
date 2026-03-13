
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { StoreList } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Download, FileSpreadsheet, Copy, Search, X, Check, ChevronsUpDown, Info, Wand2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import Link from 'next/link';
import * as XLSX from 'xlsx';


type GroupedStoreLists = Record<string, StoreList[]>;

export default function StandardListsPage() {
  const firestore = useFirestore();
  const storeListsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'storeLists') : null, [firestore]);
  const { data: storeLists, isLoading, error } = useCollection<StoreList>(storeListsQuery);

  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [searchRetailers, setSearchRetailers] = useState<string[]>([]);
  const [searchListName, setSearchListName] = useState<string>("");
  const [selectedLists, setSelectedLists] = useState<StoreList[]>([]);
  const [hideWeekly, setHideWeekly] = useState(false);

  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);

  const { toast } = useToast();

   useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to load store lists",
        description: "Could not fetch store list data. Please try again.",
      });
      console.error("Error fetching store lists:", error);
    }
  }, [error, toast]);


  const availableCountries = useMemo(() => {
    if (!storeLists) return ["all"];
    const countries = new Set(storeLists.map(list => list.country));
    return ["all", ...Array.from(countries).sort()];
  }, [storeLists]);

  const availableRetailersForSearch = useMemo(() => {
    if (!storeLists) return [];
    const listsToSearch = selectedCountry === "all"
      ? storeLists
      : storeLists.filter(list => list.country === selectedCountry);
    
    const retailerSet = new Set(listsToSearch.map(list => list.retailer));
    return Array.from(retailerSet).sort();
  }, [storeLists, selectedCountry]);

  const filteredLists = useMemo(() => {
    let lists = storeLists ? [...storeLists] : [];
    if (selectedCountry !== "all") {
      lists = lists.filter(list => list.country === selectedCountry);
    }
    
    if (searchRetailers.length > 0) {
        // Group lists by name to check retailers
        const listsByName: Record<string, StoreList[]> = {};
        lists.forEach(list => {
            if (!listsByName[list.name]) {
                listsByName[list.name] = [];
            }
            listsByName[list.name].push(list);
        });

        // Find which list names have all the searched retailers
        const listNamesWithRetailers = new Set<string>();
        for (const listName in listsByName) {
            const retailersInList = new Set(listsByName[listName].map(l => l.retailer.toLowerCase()));
            const hasAllSearchedRetailers = searchRetailers.every(sr => 
                retailersInList.has(sr.toLowerCase())
            );
            if (hasAllSearchedRetailers) {
                listNamesWithRetailers.add(listName);
            }
        }

        // Filter to include all retailers from those list names
        lists = lists.filter(list => listNamesWithRetailers.has(list.name));
    }
    
    if (searchListName) {
        const lowercasedSearch = searchListName.toLowerCase();
        lists = lists.filter(list => list.name.toLowerCase().includes(lowercasedSearch));
    }

    return lists;
  }, [storeLists, selectedCountry, searchRetailers, searchListName]);

  const groupedByListName = useMemo(() => {
    return filteredLists.reduce<Record<string, GroupedStoreLists>>((acc, list) => {
      const listName = list.name;
      const country = list.country || 'Uncategorized';

      if (!acc[listName]) {
        acc[listName] = {};
      }
      if (!acc[listName][country]) {
        acc[listName][country] = [];
      }
      acc[listName][country].push(list);
      return acc;
    }, {});
  }, [filteredLists]);

  const sortedListNames = Object.keys(groupedByListName).sort();
  
  const handleSelectListGroup = (listName: string, isSelected: boolean) => {
    const listsInGroup = Object.values(groupedByListName[listName]).flat();
    if (isSelected) {
        setSelectedLists(prev => {
            const existingIds = new Set(prev.map(l => l.id));
            const listsToAdd = listsInGroup.filter(l => !existingIds.has(l.id));
            return [...prev, ...listsToAdd];
        });
    } else {
        const listIdsToFilter = new Set(listsInGroup.map(l => l.id));
        setSelectedLists(prev => prev.filter(l => !listIdsToFilter.has(l.id)));
    }
  };

  const handleSelectCountryGroup = (retailersInCountry: StoreList[], isSelected: boolean) => {
     if (isSelected) {
        setSelectedLists(prev => {
            const existingIds = new Set(prev.map(l => l.id));
            const listsToAdd = retailersInCountry.filter(l => !existingIds.has(l.id));
            return [...prev, ...listsToAdd];
        });
    } else {
        const listIdsToFilter = new Set(retailersInCountry.map(l => l.id));
        setSelectedLists(prev => prev.filter(l => !listIdsToFilter.has(l.id)));
    }
  };


  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
        setSelectedLists(filteredLists);
    } else {
        setSelectedLists([]);
    }
  };

  const isAllSelected = useMemo(() => {
      return filteredLists.length > 0 && selectedLists.length === filteredLists.length;
  }, [filteredLists, selectedLists]);

  const selectedListGroupsForExport = useMemo(() => {
    return selectedLists.reduce<Record<string, StoreList[]>>((acc, list) => {
        const key = `${list.name} (${list.country})`;
        if(!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(list);
        return acc;
    }, {});
  }, [selectedLists]);


  // --- EXPORT FUNCTIONS ---
  const handleExportXlsx = () => {
    if (selectedLists.length === 0) {
      toast({
        variant: "destructive",
        title: "No lists selected",
        description: "Please select at least one list to export.",
      });
      return;
    }

    const wb = XLSX.utils.book_new();

    Object.entries(selectedListGroupsForExport).forEach(([groupName, retailers]) => {
      const sortedRetailers = retailers.sort((a,b) => a.retailer.localeCompare(b.retailer));
      
      const sheetData = sortedRetailers.map(r => ({
        Retailer: r.retailer,
        'Weekly Quota': r.weeklyQuota,
        'Monthly Quota': r.monthlyQuota,
      }));

      // Add total row
      const totalWeekly = retailers.reduce((sum, r) => sum + r.weeklyQuota, 0);
      const totalMonthly = retailers.reduce((sum, r) => sum + r.monthlyQuota, 0);
      sheetData.push({
        Retailer: 'Total',
        'Weekly Quota': totalWeekly,
        'Monthly Quota': totalMonthly,
      });

      const ws = XLSX.utils.json_to_sheet(sheetData);
      const safeSheetName = groupName.substring(0, 31).replace(/[^a-zA-Z0-9_ ]/g, '');
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    });

    XLSX.writeFile(wb, "standard-lists-export.xlsx");
  };
  

  if (isLoading) {
    return (
        <div className="container mx-auto max-w-7xl">
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4 text-muted-foreground">Loading lists...</p>
            </div>
        </div>
    )
  }

  return (
    <div className="container mx-auto max-w-full">
      <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Standard Store Lists</h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Search for the best list for your customer. Select a list below to generate a copy- and print-friendly view, or download a PDF version.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="text-[10px]">
              <Link href="/list-genie">
                <Wand2 className="mr-2 h-4 w-4" />
                List Genie
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="text-[10px]">
              <Link href="https://studio--store-list-builder2.us-central1.hosted.app/" target="_blank">
                <Download className="mr-2 h-4 w-4" />
                Retail List Downloader
              </Link>
            </Button>
          </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center space-x-2">
                    <Checkbox id="select-all" 
                        checked={isAllSelected}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    />
                    <label htmlFor="select-all" className="text-[10px] font-medium leading-none">
                        Select All
                    </label>
                </div>
                 <div className="w-full sm:w-auto">
                    <Select value={selectedCountry} onValueChange={(value) => { setSelectedCountry(value); setSelectedLists([]); setSearchRetailers([]); }}>
                    <SelectTrigger className="w-full sm:w-[180px] h-9 text-[10px]">
                        <SelectValue placeholder="Filter by country..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableCountries.map(country => (
                        <SelectItem key={country} value={country}>
                            {country === 'all' ? 'All Countries' : country}
                        </SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by list name..."
                            value={searchListName}
                            onChange={(e) => setSearchListName(e.target.value)}
                            className="pl-10 w-full sm:w-48 h-9 text-[10px]"
                        />
                    </div>
                    <MultiRetailerSearch 
                        allRetailers={availableRetailersForSearch}
                        selectedRetailers={searchRetailers}
                        setSelectedRetailers={setSearchRetailers}
                    />
                </div>
                 <Button variant="outline" size="sm" onClick={() => setHideWeekly(prev => !prev)} className="h-9 text-[10px]">
                    <EyeOff className="mr-2 h-4 w-4" />
                    {hideWeekly ? 'Show Weekly Quotas' : 'Hide Weekly Quotas'}
                </Button>
            </div>
            
            <div className="flex items-center gap-2">
                {selectedLists.length > 0 && (
                    <>
                         <Button variant="outline" size="sm" onClick={handleExportXlsx}>
                            <FileSpreadsheet /> XLSX
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setIsCopyDialogOpen(true)}>
                            <Copy /> Copy
                        </Button>
                    </>
                )}
            </div>
        </CardContent>
      </Card>


      <div className="flex flex-wrap gap-6">
        {sortedListNames.length > 0 ? sortedListNames.map(listName => {
           const listsInGroup = Object.values(groupedByListName[listName]).flat();
           const isGroupSelected = listsInGroup.every(l => selectedLists.some(sl => sl.id === l.id));
           const isGroupIndeterminate = !isGroupSelected && listsInGroup.some(l => selectedLists.some(sl => sl.id === l.id));

          return (
          <Card key={listName} className={cn("w-full md:w-auto md:max-w-sm flex-grow", isGroupSelected && 'ring-2 ring-primary')}>
            <CardHeader className="flex-row items-center justify-between space-y-0 p-3">
              <CardTitle className="text-sm">{listName}</CardTitle>
               <Checkbox 
                checked={isGroupSelected}
                onCheckedChange={(checked) => handleSelectListGroup(listName, !!checked)}
                aria-label={`Select all lists for ${listName}`}
                data-state={isGroupIndeterminate ? 'indeterminate' : (isGroupSelected ? 'checked' : 'unchecked')}
              />
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0">
              {Object.keys(groupedByListName[listName]).sort().map(country => {
                let retailers = groupedByListName[listName][country];
                
                if (retailers.length === 0) {
                    return null;
                }

                const totalWeekly = retailers.reduce((sum, r) => sum + r.weeklyQuota, 0);
                const totalMonthly = retailers.reduce((sum, r) => sum + r.monthlyQuota, 0);

                const isCountryGroupSelected = retailers.every(r => selectedLists.some(sl => sl.id === r.id));
                const isCountryGroupIndeterminate = !isCountryGroupSelected && retailers.some(r => selectedLists.some(sl => sl.id === r.id));

                return (
                    <div key={country}>
                    <div className="flex items-center gap-2 mb-1">
                        <Checkbox 
                            id={`${listName}-${country}`}
                            checked={isCountryGroupSelected}
                            onCheckedChange={(checked) => handleSelectCountryGroup(retailers, !!checked)}
                            data-state={isCountryGroupIndeterminate ? 'indeterminate' : (isCountryGroupSelected ? 'checked' : 'unchecked')}
                        />
                        <label htmlFor={`${listName}-${country}`} className="font-semibold text-xs cursor-pointer">{country}</label>
                        <Badge variant="secondary" className="text-[10px]">{retailers.length} Retailers</Badge>
                    </div>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="h-8 px-2 text-[10px]">Retailer</TableHead>
                                    {!hideWeekly && <TableHead className="h-8 px-2 text-right text-[10px] w-[50px]">Weekly</TableHead>}
                                    <TableHead className="h-8 px-2 text-right text-[10px] w-[50px]">Monthly</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {retailers.sort((a,b) => a.retailer.localeCompare(b.retailer)).map(retailer => (
                                <TableRow key={retailer.id}>
                                    <TableCell className="font-medium text-[10px] py-1 px-2">{retailer.retailer}</TableCell>
                                    {!hideWeekly && <TableCell className="text-right text-[10px] py-1 px-2 text-muted-foreground">{retailer.weeklyQuota}</TableCell>}
                                    <TableCell className="text-right text-[10px] py-1 px-2 text-muted-foreground">{retailer.monthlyQuota}</TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell className="font-bold text-[10px] py-1 px-2">Total</TableCell>
                                    {!hideWeekly && <TableCell className="text-right font-bold text-[10px] py-1 px-2">{totalWeekly}</TableCell>}
                                    <TableCell className="text-right font-bold text-[10px] py-1 px-2">{totalMonthly}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                    </div>
                )
              })}
            </CardContent>
          </Card>
        )}) : (
             <Card className="text-muted-foreground text-center col-span-full p-12">
                <p>No standard lists found for the selected criteria.</p>
            </Card>
        )}
      </div>

       <Dialog open={isCopyDialogOpen} onOpenChange={setIsCopyDialogOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
                <DialogTitle>Copy Store Lists for Email</DialogTitle>
                <DialogDescription>
                    Select and copy the content below (Ctrl+A or Cmd+A) and paste it into your email client.
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="border rounded-md p-6 bg-white">
                <div className="prose prose-sm max-w-none">
                    {Object.entries(selectedListGroupsForExport).map(([groupName, retailers]) => (
                        <div key={groupName} style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', marginBottom: '32px' }}>
                             <h2 style={{ fontSize: '18px', fontWeight: 'bold', borderBottom: '1px solid #ddd', paddingBottom: '8px', marginBottom: '16px' }}>
                                {groupName}
                            </h2>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>Retailer</th>
                                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', backgroundColor: '#f2f2f2' }}>Weekly Quota</th>
                                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', backgroundColor: '#f2f2f2' }}>Monthly Quota</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {retailers.sort((a,b) => a.retailer.localeCompare(b.retailer)).map((sl) => (
                                        <tr key={sl.id}>
                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>{sl.retailer}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{sl.weeklyQuota}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{sl.monthlyQuota}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td style={{ border: '1px solid #ddd', padding: '8px', fontWeight: 'bold' }}>Total</td>
                                        <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{retailers.reduce((sum, r) => sum + r.weeklyQuota, 0)}</td>
                                        <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{retailers.reduce((sum, r) => sum + r.monthlyQuota, 0)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    ))}
                </div>
            </ScrollArea>
             <DialogFooter>
                <Button onClick={() => setIsCopyDialogOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function MultiRetailerSearch({
    allRetailers,
    selectedRetailers,
    setSelectedRetailers,
}: {
    allRetailers: string[];
    selectedRetailers: string[];
    setSelectedRetailers: (retailers: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSelect = (retailer: string) => {
        setInputValue("");
        setSelectedRetailers([...selectedRetailers, retailer]);
    };

    const handleRemove = (retailer: string) => {
        setSelectedRetailers(selectedRetailers.filter((r) => r !== retailer));
    };

    const filteredRetailers = allRetailers.filter((retailer) => {
        if (selectedRetailers.includes(retailer)) return false;
        
        const lowerInput = inputValue.toLowerCase().trim();
        if (!lowerInput) return true;
        
        const normalizedInput = lowerInput.replace(/[^a-z0-9]/g, '');
        const lowerName = retailer.toLowerCase();
        const normalizedName = lowerName.replace(/[^a-z0-9]/g, '');

        return lowerName.includes(lowerInput) || 
               (normalizedInput.length > 0 && normalizedName.includes(normalizedInput));
    });

    return (
        <div className="w-full sm:w-[350px]">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <div
                        className="flex flex-wrap gap-1 items-center rounded-md border border-input bg-background px-3 py-1 text-[10px] min-h-9 cursor-text"
                        onClick={() => inputRef.current?.focus()}
                    >
                         <Search className="h-4 w-4 text-muted-foreground mr-1" />
                        {selectedRetailers.map((retailer) => (
                            <Badge key={retailer} variant="secondary" className="pl-2 pr-1">
                                {retailer}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 ml-1"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemove(retailer);
                                    }}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </Badge>
                        ))}
                        <span className="text-muted-foreground text-[10px] flex-1">
                            {selectedRetailers.length === 0 ? "Search retailers..." : ""}
                        </span>
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                    <Command>
                        <CommandInput
                            ref={inputRef}
                            value={inputValue}
                            onValueChange={setInputValue}
                            placeholder="Search for retailers..."
                        />
                        <CommandList>
                            <CommandEmpty>No results found.</CommandEmpty>
                            <CommandGroup>
                                {filteredRetailers.map((retailer) => (
                                    <CommandItem
                                        key={retailer}
                                        onSelect={() => handleSelect(retailer)}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedRetailers.includes(retailer)
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            )}
                                        />
                                        {retailer}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
