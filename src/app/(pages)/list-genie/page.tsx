
"use client";

import { useState, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from "@/components/ui/input";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, GripVertical, Loader2, Search, Wand2, X, Check, Info, Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import type { Booster, StoreList, HoldingCompany } from '@/lib/types';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RetailerTabs } from "@/components/retailer/retailer-tabs";


interface RankedRetailer extends Booster {
    rank: number;
}

interface Recommendation {
    listName: string;
    country: string;
    matchPercentage: number;
    matchedRetailers: Booster[];
    unmatchedRetailers: Booster[];
    fullStandardList: StoreList[];
    suggestedBoosters: Booster[];
}

const retailerSynonyms: Record<string, string> = {
    "cvs": "cvs pharmacy",
    "costco wholesale": "costco",
    "heb": "h-e-b",
    "bj's": "bj's wholesale club",
    "ahold (all banners)": "ahold",
};

const normalizeRetailerName = (name: string): string => {
    const lowerName = name.toLowerCase().trim();
    // This allows for reverse matching, e.g. "cvs pharmacy" becomes "cvs pharmacy" but so does "cvs"
    for (const key in retailerSynonyms) {
        if (lowerName === key || lowerName === retailerSynonyms[key]) {
            return retailerSynonyms[key];
        }
    }
    return lowerName;
};

/** Normalize name for holding-company match: strip "(All Banners)", trim, lowercase. */
const normalizeForHoldingMatch = (name: string): string =>
    name.replace(/\s*\(all banners\)\s*$/i, '').trim().toLowerCase();


export default function ListGeniePage() {
    const firestore = useFirestore();
    const { data: boosters, isLoading: isLoadingBoosters } = useCollection<Booster>(useMemoFirebase(() => firestore ? collection(firestore, 'boosters') : null, [firestore]));
    const { data: storeLists, isLoading: isLoadingStoreLists } = useCollection<StoreList>(useMemoFirebase(() => firestore ? collection(firestore, 'storeLists') : null, [firestore]));
    const { data: holdingCompanies } = useCollection<HoldingCompany>(useMemoFirebase(() => firestore ? collection(firestore, 'holdingCompanies') : null, [firestore]));
    const { toast } = useToast();

    const [selectedCountry, setSelectedCountry] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [preferredList, setPreferredList] = useState<RankedRetailer[]>([]);
    const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(new Set());
    const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showAllRecommendations, setShowAllRecommendations] = useState(false);
    
    const draggedItem = useRef<RankedRetailer | null>(null);
    const dragOverItem = useRef<RankedRetailer | null>(null);


    const availableCountries = useMemo(() => {
        if (!boosters) return [];
        return [...new Set(boosters.map(b => b.country))].sort();
    }, [boosters]);

    const availableRetailers = useMemo(() => {
        if (!selectedCountry || !boosters) return [];
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        const normalizedQuery = lowercasedQuery.replace(/[^a-z0-9]/g, '');

        return boosters
            .filter(b => b.country === selectedCountry)
            .filter(b => {
                if (!lowercasedQuery) return true;
                const nameLower = b.name.toLowerCase();
                const nameNormalized = nameLower.replace(/[^a-z0-9]/g, '');
                
                // Standard includes match or fuzzy normalized match
                return nameLower.includes(lowercasedQuery) || 
                       (normalizedQuery.length > 0 && nameNormalized.includes(normalizedQuery));
            })
            .filter(b => !preferredList.some(pr => pr.id === b.id))
            .filter(b => !expandedParentIds.has(b.id));
    }, [boosters, selectedCountry, searchQuery, preferredList, expandedParentIds]);

    const handleAddRetailer = (retailer: Booster) => {
        const retailerNorm = normalizeForHoldingMatch(retailer.name);
        const holding = holdingCompanies?.find(
            hc => normalizeForHoldingMatch(hc.name) === retailerNorm && hc.country === selectedCountry
        );
        if (holding && boosters) {
            const existingIds = new Set(preferredList.map(pr => pr.id));
            const toAdd: RankedRetailer[] = [];
            let nextRank = preferredList.length + 1;
            for (const bannerId of holding.bannerIds) {
                const matchingBooster = boosters.find(b => b.id === bannerId && b.country === selectedCountry);
                if (matchingBooster && !existingIds.has(matchingBooster.id)) {
                    toAdd.push({ ...matchingBooster, rank: nextRank++ });
                    existingIds.add(matchingBooster.id);
                }
            }
            if (toAdd.length > 0) {
                setExpandedParentIds(prev => new Set(prev).add(retailer.id));
                setPreferredList(prev => [...prev, ...toAdd]);
            } else {
                setPreferredList(prev => [...prev, { ...retailer, rank: prev.length + 1 }]);
            }
        } else {
            setPreferredList(prev => [...prev, { ...retailer, rank: prev.length + 1 }]);
        }
    };

    const handleRemoveRetailer = (retailerId: string) => {
        setPreferredList(prev => prev.filter(r => r.id !== retailerId).map((r, index) => ({...r, rank: index + 1})));
    };

    const handleAskGenie = () => {
        if (preferredList.length === 0) {
            toast({ variant: 'destructive', title: 'Empty List', description: 'Please add at least one retailer to your preferred list.' });
            return;
        }
        setIsGenerating(true);
        setRecommendations(null);
        setShowAllRecommendations(false);

        setTimeout(() => {
            if (!storeLists) {
                toast({ variant: 'destructive', title: 'Error', description: 'Standard lists are not available to compare against.' });
                setIsGenerating(false);
                return;
            }

            const groupedStandardLists = storeLists.reduce<Record<string, { retailers: Set<string>, fullList: StoreList[] }>>((acc, sl) => {
                if (sl.country !== selectedCountry) return acc;
                const key = sl.name;
                if (!acc[key]) {
                    acc[key] = { retailers: new Set(), fullList: [] };
                }
                acc[key].retailers.add(normalizeRetailerName(sl.retailer));
                acc[key].fullList.push(sl);
                return acc;
            }, {});

            const preferredRetailerNames = new Set(preferredList.map(r => normalizeRetailerName(r.name)));

            const allRecommendations: Recommendation[] = Object.entries(groupedStandardLists).map(([listName, { retailers: standardListRetailers, fullList }]) => {
                const matchedRetailers: Booster[] = [];
                const unmatchedRetailers: Booster[] = [];

                preferredList.forEach(preferredRetailer => {
                    if (standardListRetailers.has(normalizeRetailerName(preferredRetailer.name))) {
                        matchedRetailers.push(preferredRetailer);
                    } else {
                        unmatchedRetailers.push(preferredRetailer);
                    }
                });

                const matchPercentage = preferredRetailerNames.size > 0
                    ? Math.round((matchedRetailers.length / preferredRetailerNames.size) * 100)
                    : 0;
                
                return {
                    listName,
                    country: selectedCountry,
                    matchPercentage,
                    matchedRetailers,
                    unmatchedRetailers,
                    suggestedBoosters: unmatchedRetailers,
                    fullStandardList: fullList.sort((a, b) => a.retailer.localeCompare(b.retailer)),
                };
            });
            
            const sortedRecs = allRecommendations.sort((a, b) => b.matchPercentage - a.matchPercentage);
            
            setRecommendations(sortedRecs);
            setIsGenerating(false);
            toast({ title: 'Recommendations Generated!', description: 'The List Genie has found the best matching lists for you.' });
        }, 1500);
    };
    
    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, item: RankedRetailer) => {
        draggedItem.current = item;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, targetItem: RankedRetailer) => {
        e.preventDefault();
        dragOverItem.current = targetItem;
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!draggedItem.current || !dragOverItem.current || draggedItem.current.id === dragOverItem.current.id) {
            draggedItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const currentList = [...preferredList];
        const draggedIndex = currentList.findIndex(item => item.id === draggedItem.current!.id);
        const targetIndex = currentList.findIndex(item => item.id === dragOverItem.current!.id);

        const [removed] = currentList.splice(draggedIndex, 1);
        currentList.splice(targetIndex, 0, removed);
        
        setPreferredList(currentList.map((item, index) => ({ ...item, rank: index + 1 })));

        draggedItem.current = null;
        dragOverItem.current = null;
    };

    const handleDownloadPdf = () => {
      toast({ title: "Feature coming soon!", description: "PDF exports will be available in a future update."})
    };

    const handleExportXlsx = () => {
      toast({ title: "Feature coming soon!", description: "Excel exports will be available in a future update."})
    };
    
    const visibleRecommendations = useMemo(() => {
        if (!recommendations) return [];
        return showAllRecommendations ? recommendations : recommendations.slice(0, 3);
    }, [recommendations, showAllRecommendations]);


    const isLoading = isLoadingBoosters || isLoadingStoreLists;


    return (
        <div className="container mx-auto max-w-full space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-bold tracking-tight">List Genie</h1>
                    <p className="text-xs text-muted-foreground">Build your perfect store list and let our AI find the best match.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                    <Link href="/standard-lists">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Retailer/Channel Mix Lists
                    </Link>
                </Button>
            </div>

            <RetailerTabs />
            
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Step 1: Build Your Preferred Retailer List</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Select onValueChange={(value) => { setSelectedCountry(value); setPreferredList([]); setRecommendations(null); }} value={selectedCountry}>
                        <SelectTrigger className="w-[280px] h-9 text-xs">
                            <SelectValue placeholder="Select a Country..." />
                        </SelectTrigger>
                        <SelectContent>
                            {isLoading ? (
                                <SelectItem value="loading" disabled className="text-xs">Loading countries...</SelectItem>
                            ) : (
                                availableCountries.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)
                            )}
                        </SelectContent>
                    </Select>
                    
                    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", !selectedCountry && "opacity-50 pointer-events-none")}>
                        {/* Left Side: Available Retailers */}
                        <div className="border rounded-lg p-4 flex flex-col gap-3">
                             <h3 className="font-semibold text-xs">Available Retailers for {selectedCountry}</h3>
                             <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search retailers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-9 text-xs" />
                            </div>
                            <ScrollArea className="h-64">
                                <div className="pr-3 space-y-1">
                                {availableRetailers.length > 0 ? availableRetailers.map(retailer => (
                                    <div key={retailer.id} className="flex items-center space-x-2 p-1.5 text-sm rounded-md hover:bg-muted">
                                        <Button variant="outline" size="sm" className="h-7 w-8 text-xs" onClick={() => handleAddRetailer(retailer)}>+</Button>
                                        <span className="font-normal flex-1 text-xs">{retailer.name}</span>
                                    </div>
                                )) : <div className="text-center text-xs text-muted-foreground p-4">No retailers available or all have been added.</div>}
                                </div>
                            </ScrollArea>
                        </div>
                        {/* Right Side: Ranked List */}
                         <div className="border rounded-lg p-4 flex flex-col gap-3">
                            <h3 className="font-semibold text-xs">Your Ranked List ({preferredList.length})</h3>
                            <p className="text-[11px] text-muted-foreground -mt-2">Drag to rank by importance (1 = most important).</p>
                             <ScrollArea className="h-64">
                                <div className="pr-3 space-y-0.5">
                                {preferredList.length > 0 ? (
                                    preferredList.map(retailer => (
                                        <div 
                                            key={retailer.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, retailer)}
                                            onDragEnter={(e) => handleDragEnter(e, retailer)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                            className={cn(
                                                "flex items-center gap-1 p-0.5 rounded-md bg-muted/50 cursor-grab active:cursor-grabbing",
                                                draggedItem.current?.id === retailer.id && "opacity-30"
                                            )}
                                        >
                                            <GripVertical className="h-4 w-4 text-muted-foreground"/>
                                            <span className="text-[11px] font-bold w-5 text-center">{retailer.rank}.</span>
                                            <span className="flex-1 font-medium text-xs">{retailer.name}</span>
                                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveRetailer(retailer.id)}>
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-xs text-muted-foreground p-8">Add retailers from the left to build your list.</div>
                                )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className={cn(!selectedCountry && "opacity-50 pointer-events-none")}>
                     <Button size="lg" onClick={handleAskGenie} disabled={isGenerating || preferredList.length === 0}>
                        {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
                        {isGenerating ? 'Analyzing...' : 'Ask the Genie'}
                    </Button>
                </CardFooter>
            </Card>

            {(isGenerating || recommendations) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Step 2: Review Genie's Recommendations</CardTitle>
                        <CardDescription className="text-xs">The best standard lists based on your choices. Pick one and use it in the Categories page.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         {isGenerating && (
                            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                                <Loader2 className="h-10 w-10 animate-spin mb-4" />
                                <p className="text-xs">Finding the best matches...</p>
                            </div>
                        )}
                        {!isGenerating && recommendations && (
                             <TooltipProvider>
                             <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {visibleRecommendations.map(rec => {
                                    const matchedRetailerNames = new Set(rec.matchedRetailers.map(r => normalizeRetailerName(r.name)));
                                    return (
                                    <Card key={rec.listName} className="flex flex-col">
                                        <CardHeader className="pb-2">
                                            <div className="flex justify-between items-start">
                                                <CardTitle className="text-base">{rec.listName}</CardTitle>
                                                <Badge className={cn("text-[11px]",
                                                    rec.matchPercentage > 80 ? "bg-green-500" : rec.matchPercentage > 60 ? "bg-yellow-500" : "bg-orange-500",
                                                    "text-white"
                                                )}>
                                                    {rec.matchPercentage}% Match
                                                </Badge>
                                            </div>
                                            <CardDescription className="text-xs pt-1">{rec.country}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="text-xs flex-grow space-y-3">
                                            <Separator />
                                            <div>
                                                <h4 className="font-semibold mb-2 text-xs">Retailers from Standard List:</h4>
                                                <Table className="text-[11px]">
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="h-auto py-1">Retailer</TableHead>
                                                            <TableHead className="h-auto py-1 text-right">Wkly</TableHead>
                                                            <TableHead className="h-auto py-1 text-right">Mthly</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {rec.fullStandardList.map(sl => {
                                                            const isMatch = matchedRetailerNames.has(normalizeRetailerName(sl.retailer));
                                                            return (
                                                                <TableRow key={sl.id}>
                                                                    <TableCell className={cn("py-1 flex items-center gap-2", isMatch ? "font-bold" : "text-muted-foreground")}>
                                                                        {isMatch && <Check className="h-4 w-4 text-green-500" />}
                                                                        {sl.retailer}
                                                                    </TableCell>
                                                                    <TableCell className={cn("py-1 text-right", !isMatch && "text-muted-foreground")}>{sl.weeklyQuota}</TableCell>
                                                                    <TableCell className={cn("py-1 text-right", !isMatch && "text-muted-foreground")}>{sl.monthlyQuota}</TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            {rec.suggestedBoosters.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <h4 className="font-semibold text-xs">Suggested Boosters to Add:</h4>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Info className="h-4 w-4 text-muted-foreground" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs text-xs">These are retailers from your preferred list that were not found in the recommended standard list.</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                    <Table className="text-[11px]">
                                                        <TableBody>
                                                            {rec.suggestedBoosters.map(b => (
                                                                <TableRow key={b.id}>
                                                                    <TableCell className="font-medium py-1">{b.name}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                        </CardContent>
                                        <CardFooter className="flex gap-2 p-2 border-t">
                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleDownloadPdf}>
                                                <Download className="mr-2 h-4 w-4" /> PDF
                                            </Button>
                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleExportXlsx}>
                                                <FileSpreadsheet className="mr-2 h-4 w-4" /> XLSX
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                    )
                                })}
                            </div>
                            </TooltipProvider>
                        )}
                         {recommendations && recommendations.length > 3 && !showAllRecommendations && (
                                <div className="text-center pt-4">
                                    <Button variant="outline" size="sm" onClick={() => setShowAllRecommendations(true)}>
                                        Show All {recommendations.length} Recommendations
                                    </Button>
                                </div>
                            )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
