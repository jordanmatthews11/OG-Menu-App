
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { Category, StoreList, Booster } from '@/lib/types';
import { Search, X, Loader2, ArrowUpDown, Download, FileSpreadsheet, Star, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import * as XLSX from "xlsx";


// Kept for `@/components/order-pdf-content`, which imports this type.
export type CartItem = {
  id: string; // Unique ID for the cart item, e.g., `${category.id}`
  category: Category;
  storeLists: StoreList[];
  boosters: { booster: Booster; storeCount: number }[];
  startDate?: Date;
  endDate?: Date;
  notes?: string;
};


type GroupedCategory = {
    name: string;
    department: string;
    subDepartment: string;
    description: string;
    exampleBrands: string;
    notes: string;
    countries: string[];
    sourceCategories: Category[];
};

type SortConfig<T> = {
    key: keyof T;
    direction: 'asc' | 'desc';
} | null;


export default function CategoriesPage() {
  const firestore = useFirestore();

  const { data: categories, isLoading, error: errorCategories } = useCollection<Category>(useMemoFirebase(() => firestore ? collection(firestore, 'categories') : null, [firestore]));

  const [categorySearch, setCategorySearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [categorySort, setCategorySort] = useState<SortConfig<GroupedCategory>>({ key: 'name', direction: 'asc' });
  const [premiumCountryFilter, setPremiumCountryFilter] = useState('all');

  const { toast } = useToast();

  useEffect(() => {
    if (errorCategories) {
        toast({
            variant: "destructive",
            title: "Error Loading Data",
            description: "Could not fetch necessary data from the database. Please check permissions and try again."
        });
        console.error("Data loading error:", errorCategories);
    }
  }, [errorCategories, toast]);


  const premiumCategories = useMemo(() => {
    return (categories || []).filter(cat => cat.premium).sort((a,b) => a.name.localeCompare(b.name));
  }, [categories]);

  const allCountriesList = useMemo(() => {
    if (!categories) return ['all'];
    const countries = new Set(categories.map(c => c.country).filter(Boolean));
    return ['all', ...Array.from(countries).sort()];
  }, [categories]);

  const premiumCountries = useMemo(() => {
    return ["all", ...new Set(premiumCategories.map(c => c.country).sort())]
  }, [premiumCategories]);

  const filteredPremiumCategories = useMemo(() => {
    if (premiumCountryFilter === 'all') return premiumCategories;
    return premiumCategories.filter(c => c.country === premiumCountryFilter);
  }, [premiumCategories, premiumCountryFilter]);

  const groupedCategories = useMemo((): GroupedCategory[] => {
    if (!categories) return [];
    const groups: Record<string, GroupedCategory> = {};
    categories.forEach(cat => {
        const key = cat.name.toLowerCase();
        if (!groups[key]) {
            groups[key] = {
                name: cat.name,
                department: cat.department,
                subDepartment: cat.subDepartment,
                description: cat.description,
                exampleBrands: cat.exampleBrands,
                notes: cat.notes || '',
                countries: [],
                sourceCategories: []
            };
        }
        if (!groups[key].countries.includes(cat.country)) {
            groups[key].countries.push(cat.country);
        }
        groups[key].sourceCategories.push(cat);
    });
    return Object.values(groups);
  }, [categories]);

  const sortedAndFilteredCategories = useMemo(() => {
    let result = [...groupedCategories];

    if (countryFilter !== 'all') {
        result = result.filter(c => c.countries.includes(countryFilter));
    }

    if (categorySearch) {
        const lowercasedSearch = categorySearch.toLowerCase();
        result = result.filter(c =>
            c.name.toLowerCase().includes(lowercasedSearch) ||
            (c.department || '').toLowerCase().includes(lowercasedSearch) ||
            (c.subDepartment || '').toLowerCase().includes(lowercasedSearch) ||
            (c.description || '').toLowerCase().includes(lowercasedSearch) ||
            (c.exampleBrands || '').toLowerCase().includes(lowercasedSearch) ||
            (c.notes || '').toLowerCase().includes(lowercasedSearch) ||
            c.countries.some(country => country.toLowerCase().includes(lowercasedSearch)) ||
            c.sourceCategories.some(sc => sc.number.toLowerCase().includes(lowercasedSearch))
        );
    }
     if (categorySort) {
      result.sort((a, b) => {
        const aVal = a[categorySort.key] as any;
        const bVal = b[categorySort.key] as any;
        const valA = Array.isArray(aVal) ? aVal.join(',') : aVal;
        const valB = Array.isArray(bVal) ? bVal.join(',') : bVal;

        if (valA < valB) return categorySort.direction === 'asc' ? -1 : 1;
        if (valA > bVal) return categorySort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [categorySearch, countryFilter, groupedCategories, categorySort]);

  const handleExportPremiumCategories = () => {
    if (filteredPremiumCategories.length === 0) {
        toast({
            variant: "destructive",
            title: "No Data",
            description: "There are no premium categories to export for the current filter."
        });
        return;
    }

    const dataToExport = filteredPremiumCategories.map(cat => ({
        "Category Name": cat.name,
        "Country": cat.country,
        "Category Code": cat.number,
        "Department": cat.department,
        "Sub-Department": cat.subDepartment,
        "Description": cat.description,
        "Example Brands": cat.exampleBrands,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Premium Categories");
    XLSX.writeFile(workbook, `premium-categories-${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
        title: "Export Successful",
        description: "The list of premium categories has been downloaded.",
    });
  };

  const handleExportCategoryCatalog = () => {
    if (sortedAndFilteredCategories.length === 0) {
      toast({
        variant: "destructive",
        title: "No data",
        description: "No categories match the current search or country filter.",
      });
      return;
    }

    const dataToExport = sortedAndFilteredCategories.map((g) => ({
      Category: g.name,
      Department: [g.department, g.subDepartment].filter(Boolean).join(" — "),
      "Example Brands": g.exampleBrands,
      Description: g.description,
      Countries: [...g.countries].sort().join(", "),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Category catalog");
    XLSX.writeFile(
      workbook,
      `category-catalog-${new Date().toISOString().split("T")[0]}.xlsx`
    );

    toast({
      title: "Export successful",
      description: `Downloaded ${dataToExport.length} categor${dataToExport.length === 1 ? "y" : "ies"} (current filters).`,
    });
  };


   const handleSort = (key: keyof GroupedCategory) => {
    setCategorySort(prevSort => {
        if (prevSort && prevSort.key === key) {
            return { key, direction: prevSort.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { key, direction: 'asc' };
    });
  };

  const renderSortIcon = (key: keyof GroupedCategory) => {
    if (!categorySort || categorySort.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const getHeaderClass = (key: keyof GroupedCategory) => cn(
    "cursor-pointer hover:bg-muted/50",
    categorySort?.key === key && "text-foreground"
  );


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Loading categories...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
            <div className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-2 flex-1 max-w-2xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search categories by name, department, brands, or countries..."
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            className="pl-10 text-xs"
                        />
                        {categorySearch && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setCategorySearch('')}><X className="h-4 w-4"/></Button>}
                    </div>
                    <Select value={countryFilter} onValueChange={setCountryFilter}>
                        <SelectTrigger className="w-[180px] h-9 text-xs">
                            <SelectValue placeholder="Filter by country..." />
                        </SelectTrigger>
                        <SelectContent>
                            {allCountriesList.map(country => (
                                <SelectItem key={country} value={country} className="text-xs">
                                    {country === 'all' ? 'All Countries' : country}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs shrink-0 whitespace-nowrap"
                        onClick={handleExportCategoryCatalog}
                        disabled={isLoading || sortedAndFilteredCategories.length === 0}
                    >
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                        Export catalog
                    </Button>
                </div>
                 <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-sm text-muted-foreground whitespace-nowrap">
                            <Star className="h-4 w-4 mr-2 text-amber-500 fill-amber-500" />
                            = Premium Category
                            <Info className="h-4 w-4 ml-2" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader className="flex-row items-center justify-between">
                            <DialogTitle>Premium Categories</DialogTitle>
                             <Button variant="ghost" size="icon" onClick={handleExportPremiumCategories}>
                                <Download className="h-4 w-4" />
                                <span className="sr-only">Download List</span>
                            </Button>
                        </DialogHeader>
                            <DialogDescription>
                                These are categories designated as "Premium," which are typically more complex or larger with multiple placements in a store.
                            </DialogDescription>
                         <div className="my-4">
                            <Select value={premiumCountryFilter} onValueChange={setPremiumCountryFilter}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by country..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {premiumCountries.map(country => (
                                    <SelectItem key={country} value={country}>
                                        {country === 'all' ? 'All Countries' : country}
                                    </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <ScrollArea className="h-64">
                            <ul className="space-y-1">
                                {filteredPremiumCategories.map(cat => (
                                    <li key={cat.id} className="text-xs p-1.5 rounded-md bg-muted/50 flex justify-between items-center">
                                        <span>
                                          <span className="font-semibold">{cat.name}</span> ({cat.country})
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
            </div>
            <Card>
                <ScrollArea className="h-[75vh]">
                    <Table>
                        <TableHeader className={cn("sticky top-0 bg-muted z-10")}>
                            <TableRow>
                                <TableHead className={cn(getHeaderClass('name'), "w-[15%] p-1.5 text-[10px]")} onClick={() => handleSort('name')}>
                                    <div className="flex items-center">Name {renderSortIcon('name')}</div>
                                </TableHead>
                                <TableHead className={cn(getHeaderClass('department'), "w-[10%] p-1.5 text-[10px]")} onClick={() => handleSort('department')}>
                                    <div className="flex items-center">Department {renderSortIcon('department')}</div>
                                </TableHead>
                                <TableHead className={cn(getHeaderClass('exampleBrands'), "w-[18%] p-1.5 text-[10px]")} onClick={() => handleSort('exampleBrands')}>
                                    <div className="flex items-center">Example Brands {renderSortIcon('exampleBrands')}</div>
                                </TableHead>
                                <TableHead className={cn(getHeaderClass('description'), "w-[30%] p-1.5 text-[10px]")} onClick={() => handleSort('description')}>
                                    <div className="flex items-center">Description {renderSortIcon('description')}</div>
                                </TableHead>
                                    <TableHead className={cn(getHeaderClass('notes'), "w-[25%] p-1.5 text-[10px]")} onClick={() => handleSort('notes')}>
                                    <div className="flex items-center">Collection Notes {renderSortIcon('notes')}</div>
                                </TableHead>
                                <TableHead className={cn(getHeaderClass('countries'), "text-center w-[5%] p-1.5 text-[10px]")} onClick={() => handleSort('countries')}>
                                    <div className="flex items-center justify-center">Countries {renderSortIcon('countries')}</div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedAndFilteredCategories.map((group) => {
                                const isPremium = group.sourceCategories.some(c => c.premium);

                                const descriptionsByCountry = group.sourceCategories.reduce((acc, cat) => {
                                    const desc = cat.description || 'No description available.';
                                    if (!acc.has(desc)) {
                                        acc.set(desc, []);
                                    }
                                    acc.get(desc)!.push(cat.country);
                                    return acc;
                                }, new Map<string, string[]>());

                                const notesByCountry = group.sourceCategories.reduce((acc, cat) => {
                                    const note = cat.notes || 'No notes available.';
                                    if (!acc.has(note)) {
                                        acc.set(note, []);
                                    }
                                    acc.get(note)!.push(cat.country);
                                    return acc;
                                }, new Map<string, string[]>());


                                return (
                                <TableRow key={group.name}>
                                    <TableCell className="font-medium p-1.5 text-[10px]">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px]">{group.name}</span>
                                            {isPremium && (
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <Star className="h-4 w-4 text-amber-500 fill-amber-500"/>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Premium Category</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground p-1.5 text-[10px]">{group.department}</TableCell>
                                    <TableCell className="text-muted-foreground p-1.5 text-[10px]">{group.exampleBrands}</TableCell>
                                    <TableCell className="p-1.5">
                                        {group.sourceCategories.length > 1 && descriptionsByCountry.size > 1 ? (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <p className="whitespace-normal text-[10px] text-muted-foreground cursor-help">{group.description}</p>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                    <div className="space-y-2">
                                                        {Array.from(descriptionsByCountry.entries()).map(([desc, countries]) => (
                                                            <div key={desc}>
                                                                <p className="font-bold">{countries.join(', ')}</p>
                                                                <p>{desc}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <p className="whitespace-normal text-[10px] text-muted-foreground">{group.description}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="p-1.5">
                                        {group.sourceCategories.length > 1 && notesByCountry.size > 1 ? (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <p className="whitespace-normal text-[10px] text-muted-foreground cursor-help">{group.notes}</p>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                    <div className="space-y-2">
                                                        {Array.from(notesByCountry.entries()).map(([note, countries]) => (
                                                            <div key={note}>
                                                                <p className="font-bold">{countries.join(', ')}</p>
                                                                <p>{note}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <p className="whitespace-normal text-[10px] text-muted-foreground">{group.notes}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center p-1.5">
                                        <div className="flex items-center justify-center gap-1 flex-wrap">
                                            {group.sourceCategories.map(cat => (
                                                <Tooltip key={cat.id}>
                                                    <TooltipTrigger asChild>
                                                        <Badge variant='secondary' className="px-1 py-0 text-[10px]">{cat.country}</Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Category Code: {cat.number}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </Card>
    </div>
    </TooltipProvider>
  );
}
