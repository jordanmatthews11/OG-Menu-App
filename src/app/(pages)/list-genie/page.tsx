
"use client";

import * as React from 'react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from "@/components/ui/input";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, GripVertical, Loader2, Search, Wand2, X, Check, Info, Download, FileSpreadsheet, Building2, ClipboardPaste, Upload, AlertTriangle } from "lucide-react";
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
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { normalizeRetailerName, normalizeForHoldingMatch, retailerNamesMatch, sameCountry } from '@/lib/retailer-match';
import { buildBreakout, type BreakoutRow } from '@/lib/holding-companies';
import { parseRetailerListText, parseRetailerListRows, type ParsedEntry } from '@/lib/retailer-list-import';
import { scoreList, overallScore, type VolumeGap } from '@/lib/list-scoring';


interface RankedRetailer extends Booster {
    rank: number;
    /** Requested monthly visits — same unit as a store list's monthlyQuota. */
    monthlyTarget?: number;
}

interface Recommendation {
    listName: string;
    country: string;
    /** Rank-weighted retailer presence, 0-100. */
    matchPercentage: number;
    /** Σ min(available, target) / Σ target, 0-100. Null when no targets were supplied. */
    volumeCoveragePct: number | null;
    matchedRetailers: RankedRetailer[];
    unmatchedRetailers: RankedRetailer[];
    /** Picks whose requested volume this list can't fully cover. */
    gaps: VolumeGap[];
    /** Monthly visits this list offers, keyed by pick name. */
    availableByName: Map<string, number>;
    fullStandardList: StoreList[];
    /** Rows with their holding-company banner decomposition (parent + indented children). */
    breakout: BreakoutRow[];
    suggestedBoosters: RankedRetailer[];
}

type ImportStatus = 'matched' | 'unknown';
type ImportPreviewRow = ParsedEntry & { status: ImportStatus; booster?: Booster };

/** True if a retailer name (store row or broken-out banner) is covered by one of the user's matched picks. */
const retailerIsMatched = (retailerName: string, matchedPicks: Booster[]): boolean =>
    matchedPicks.some(r => retailerNamesMatch(r.name, retailerName));


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

    // --- Bulk import (paste or spreadsheet) ---
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [importParsed, setImportParsed] = useState<ParsedEntry[]>([]);
    const [importDuplicates, setImportDuplicates] = useState<string[]>([]);
    const [importMode, setImportMode] = useState<'append' | 'replace'>('replace');
    const [importSource, setImportSource] = useState<string>('');
    const importFileRef = useRef<HTMLInputElement>(null);
    
    const draggedItem = useRef<RankedRetailer | null>(null);
    const dragOverItem = useRef<RankedRetailer | null>(null);
    // A row is only draggable while its grip is held, so the visits input stays editable.
    const [dragEnabledId, setDragEnabledId] = useState<string | null>(null);

    const storeListsRef = useRef(storeLists);
    useEffect(() => { storeListsRef.current = storeLists; }, [storeLists]);


    const availableCountries = useMemo(() => {
        if (!boosters) return [];
        return [...new Set(boosters.map(b => b.country))].sort();
    }, [boosters]);

    /**
     * Normalized names already in the ranked list. Dedupe is by NAME, not just booster id, so a
     * banner can't be added twice — e.g. picking "Ahold Delhaize (All Banners)" pulls in Hannaford,
     * and Hannaford is then unavailable even if a separate booster record shares that name.
     */
    const selectedRetailerNames = useMemo(
        () => new Set(preferredList.map(r => normalizeRetailerName(r.name))),
        [preferredList]
    );

    /** Holding companies for the selected country, indexed for banner/parent lookups. */
    const holdingContext = useMemo(() => {
        const parentByBoosterId = new Map<string, HoldingCompany>();
        const parentByBannerName = new Map<string, HoldingCompany>();
        const holdingByName = new Map<string, HoldingCompany>();

        (holdingCompanies || [])
            .filter(hc => sameCountry(hc.country, selectedCountry))
            .forEach(hc => {
                holdingByName.set(normalizeForHoldingMatch(hc.name), hc);
                (hc.bannerIds || []).forEach(id => {
                    parentByBoosterId.set(id, hc);
                    const booster = (boosters || []).find(b => b.id === id);
                    if (booster) parentByBannerName.set(normalizeRetailerName(booster.name), hc);
                });
            });

        return { parentByBoosterId, parentByBannerName, holdingByName };
    }, [holdingCompanies, boosters, selectedCountry]);

    /** The holding company this retailer is a banner OF, if any. */
    const parentHoldingFor = (r: { id: string; name: string }): HoldingCompany | null =>
        holdingContext.parentByBoosterId.get(r.id)
        ?? holdingContext.parentByBannerName.get(normalizeRetailerName(r.name))
        ?? null;

    /** The holding company this retailer IS (an "(All Banners)" parent), if any. */
    const holdingSelfFor = (r: { name: string }): HoldingCompany | null =>
        holdingContext.holdingByName.get(normalizeForHoldingMatch(r.name)) ?? null;

    /**
     * Retailers matching the search. Ones already covered by the ranked list stay VISIBLE but are
     * flagged `alreadyAdded` (rendered disabled), so searching e.g. "hannaford" makes it obvious the
     * retailer is already in the Genie rather than looking like no match was found.
     */
    const availableRetailers = useMemo(() => {
        if (!selectedCountry || !boosters) return [];
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        const normalizedQuery = lowercasedQuery.replace(/[^a-z0-9]/g, '');

        const matches = boosters
            .filter(b => b.country === selectedCountry)
            .filter(b => {
                if (!lowercasedQuery) return true;
                const nameLower = b.name.toLowerCase();
                const nameNormalized = nameLower.replace(/[^a-z0-9]/g, '');

                // Standard includes match or fuzzy normalized match
                return nameLower.includes(lowercasedQuery) ||
                       (normalizedQuery.length > 0 && nameNormalized.includes(normalizedQuery));
            })
            .map(b => ({
                ...b,
                alreadyAdded:
                    preferredList.some(pr => pr.id === b.id) ||
                    selectedRetailerNames.has(normalizeRetailerName(b.name)) ||
                    expandedParentIds.has(b.id),
            }));

        // Keep selectable retailers on top; already-added ones sink to the bottom.
        return [...matches.filter(b => !b.alreadyAdded), ...matches.filter(b => b.alreadyAdded)];
    }, [boosters, selectedCountry, searchQuery, preferredList, selectedRetailerNames, expandedParentIds]);

    const handleAddRetailer = (retailer: Booster) => {
        // Already covered (same booster or same retailer name) — nothing to add.
        if (
            preferredList.some(pr => pr.id === retailer.id) ||
            selectedRetailerNames.has(normalizeRetailerName(retailer.name))
        ) {
            toast({
                title: 'Already in your list',
                description: `${retailer.name} is already in your ranked list.`,
            });
            return;
        }

        const holding = holdingSelfFor(retailer);
        const resolvedBanners = holding && boosters
            ? (holding.bannerIds || [])
                .map(id => boosters.find(b => b.id === id && sameCountry(b.country, selectedCountry)))
                .filter((b): b is Booster => !!b)
            : [];

        // Only treat it as a parent if its banners actually resolve; otherwise add it as a retailer.
        if (holding && resolvedBanners.length > 0) {
            const existingIds = new Set(preferredList.map(pr => pr.id));
            const existingNames = new Set(selectedRetailerNames);
            const toAdd: RankedRetailer[] = [];
            let nextRank = preferredList.length + 1;

            for (const banner of resolvedBanners) {
                const nameKey = normalizeRetailerName(banner.name);
                // Skip banners already covered, so expanding a parent never duplicates a pick.
                if (existingIds.has(banner.id) || existingNames.has(nameKey)) continue;
                toAdd.push({ ...banner, rank: nextRank++ });
                existingIds.add(banner.id);
                existingNames.add(nameKey);
            }

            // Hide the parent even if every banner was already picked, so it can't be re-added.
            setExpandedParentIds(prev => new Set(prev).add(retailer.id));
            if (toAdd.length > 0) {
                setPreferredList(prev => [...prev, ...toAdd]);
            } else {
                toast({
                    title: 'Banners already added',
                    description: `All banners for ${retailer.name} are already in your ranked list.`,
                });
            }
        } else {
            setPreferredList(prev => [...prev, { ...retailer, rank: prev.length + 1 }]);
        }
    };

    const handleRemoveRetailer = (retailerId: string) => {
        const removed = preferredList.find(r => r.id === retailerId);
        const remaining = preferredList.filter(r => r.id !== retailerId);
        setPreferredList(remaining.map((r, index) => ({ ...r, rank: index + 1 })));

        // If that was the last banner of a holding company, make the parent selectable again.
        const parent = removed ? parentHoldingFor(removed) : null;
        if (parent && !remaining.some(r => parentHoldingFor(r)?.id === parent.id)) {
            setExpandedParentIds(prev => {
                const next = new Set(prev);
                (boosters || [])
                    .filter(b => holdingSelfFor(b)?.id === parent.id)
                    .forEach(b => next.delete(b.id));
                return next;
            });
        }
    };

    /** Set/clear the requested monthly visits on one pick. */
    const handleTargetChange = (retailerId: string, raw: string) => {
        const trimmed = raw.trim();
        const parsed = trimmed === '' ? undefined : Number(trimmed);
        const next = typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0
            ? Math.round(parsed)
            : undefined;
        setPreferredList(prev => prev.map(r => (r.id === retailerId ? { ...r, monthlyTarget: next } : r)));
    };

    const totalMonthlyTarget = useMemo(
        () => preferredList.reduce((sum, r) => sum + (r.monthlyTarget || 0), 0),
        [preferredList]
    );

    // --- Bulk import -------------------------------------------------------------------
    const resetImport = () => {
        setImportText('');
        setImportParsed([]);
        setImportDuplicates([]);
        setImportSource('');
        if (importFileRef.current) importFileRef.current.value = '';
    };

    /**
     * Preview rows. A name that doesn't resolve to a Booster is still usable — matching against
     * store lists is by name — so it's flagged rather than dropped.
     */
    const importPreview: ImportPreviewRow[] = useMemo(() => {
        return importParsed.map(entry => {
            const booster = (boosters || []).find(
                b => sameCountry(b.country, selectedCountry) && retailerNamesMatch(b.name, entry.name)
            );
            return booster
                ? { ...entry, status: 'matched' as const, booster }
                : { ...entry, status: 'unknown' as const };
        });
    }, [importParsed, boosters, selectedCountry]);

    const handleImportTextChange = (value: string) => {
        setImportText(value);
        setImportSource('');
        if (importFileRef.current) importFileRef.current.value = '';
        const result = parseRetailerListText(value);
        setImportParsed(result.entries);
        setImportDuplicates(result.duplicates);
    };

    const handleImportFile = (file: File) => {
        const isCsv = /\.csv$/i.test(file.name);
        const reader = new FileReader();

        reader.onload = e => {
            try {
                const content = e.target?.result;
                let rows: unknown[][] = [];

                if (isCsv) {
                    const parsed = Papa.parse(String(content ?? ''), { skipEmptyLines: true });
                    rows = (parsed.data as unknown[][]) || [];
                } else {
                    const workbook = XLSX.read(content, { type: 'binary' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    // header:1 -> arrays of cells, so no specific column layout is required.
                    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
                }

                const result = parseRetailerListRows(rows);
                setImportText('');
                setImportParsed(result.entries);
                setImportDuplicates(result.duplicates);
                setImportSource(file.name);

                if (result.entries.length === 0) {
                    toast({
                        variant: 'destructive',
                        title: 'No retailers found',
                        description: 'Could not find retailer names in that file.',
                    });
                }
            } catch (err) {
                console.error('Import parse failed:', err);
                toast({
                    variant: 'destructive',
                    title: 'Could not read file',
                    description: 'Please upload a .xlsx, .xls or .csv file.',
                });
            }
        };

        if (isCsv) reader.readAsText(file);
        else reader.readAsBinaryString(file);
    };

    const handleConfirmImport = () => {
        if (importPreview.length === 0) return;

        const base = importMode === 'replace' ? [] : [...preferredList];
        const seen = new Set(base.map(r => normalizeRetailerName(r.name)));
        const added: RankedRetailer[] = [];
        let skipped = 0;

        importPreview.forEach((row, index) => {
            const key = normalizeRetailerName(row.name);
            if (seen.has(key)) {
                skipped++;
                return;
            }
            seen.add(key);
            // Prefer the canonical Booster name when we recognised it, so holding-company
            // badges and matching behave exactly as they do for hand-picked retailers.
            added.push({
                id: row.booster?.id ?? `imported-${index}-${key}`,
                name: row.booster?.name ?? row.name,
                country: selectedCountry,
                isCustom: !row.booster,
                rank: 0,
                monthlyTarget: row.monthlyTarget,
            });
        });

        setPreferredList([...base, ...added].map((r, i) => ({ ...r, rank: i + 1 })));
        if (importMode === 'replace') setExpandedParentIds(new Set());

        setIsImportOpen(false);
        resetImport();
        toast({
            title: 'List imported',
            description: `${added.length} retailer${added.length === 1 ? '' : 's'} added${skipped ? `, ${skipped} already in your list` : ''}.`,
        });
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
            const currentStoreLists = storeListsRef.current;

            if (!currentStoreLists || currentStoreLists.length === 0) {
                toast({ variant: 'destructive', title: 'No Store Lists Available', description: 'There are no Retailer/Channel Mix lists to compare against. Add lists in the Admin Console first.' });
                setIsGenerating(false);
                return;
            }

            const normalizedCountry = selectedCountry.toLowerCase().trim();
            const groupedStandardLists = currentStoreLists.reduce<Record<string, StoreList[]>>((acc, sl) => {
                if (sl.country.toLowerCase().trim() !== normalizedCountry) return acc;
                (acc[sl.name] ||= []).push(sl);
                return acc;
            }, {});

            const listCount = Object.keys(groupedStandardLists).length;

            if (listCount === 0) {
                const uniqueStoreListCountries = [...new Set(currentStoreLists.map(sl => sl.country))];
                toast({
                    variant: 'destructive',
                    title: 'No Lists for This Country',
                    description: `No Retailer/Channel Mix lists found for "${selectedCountry}". Available countries in store lists: ${uniqueStoreListCountries.join(', ') || 'none'}.`,
                });
                setRecommendations([]);
                setIsGenerating(false);
                return;
            }

            const allRecommendations: Recommendation[] = Object.entries(groupedStandardLists).map(([listName, rows]) => {
                const sortedRows = [...rows].sort((a, b) => b.monthlyQuota - a.monthlyQuota || a.retailer.localeCompare(b.retailer));
                // Decompose holding-company parents (e.g. "Ahold Delhaize 40") into their banners so a
                // pick like "Food Lion" matches a list that only names the parent.
                const breakout = buildBreakout(sortedRows, holdingCompanies, boosters);
                const score = scoreList(preferredList, breakout);

                return {
                    listName,
                    country: selectedCountry,
                    matchPercentage: score.retailerMatchPct,
                    volumeCoveragePct: score.volumeCoveragePct,
                    matchedRetailers: score.matched,
                    unmatchedRetailers: score.unmatched,
                    gaps: score.gaps,
                    availableByName: score.availableByName,
                    suggestedBoosters: score.unmatched,
                    fullStandardList: sortedRows,
                    breakout,
                };
            });

            // Volume only influences the ranking when the user supplied targets.
            const sortedRecs = allRecommendations.sort((a, b) =>
                overallScore(b.matchPercentage, b.volumeCoveragePct) - overallScore(a.matchPercentage, a.volumeCoveragePct)
                || b.matchPercentage - a.matchPercentage
                || a.listName.localeCompare(b.listName)
            );
            
            setRecommendations(sortedRecs);
            setIsGenerating(false);

            if (sortedRecs.length > 0 && sortedRecs[0].matchPercentage > 0) {
                toast({ title: 'Recommendations Generated!', description: `Found ${sortedRecs.length} list(s). Best match: ${sortedRecs[0].matchPercentage}%.` });
            } else if (sortedRecs.length > 0) {
                toast({ title: 'Recommendations Generated', description: `Found ${sortedRecs.length} list(s), but none share retailers with your preferred list. Check that retailer names match between boosters and store lists.` });
            }
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
        setDragEnabledId(null);
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

    const exportFileName = (rec: Recommendation) =>
      `${rec.listName}-${rec.country}`.replace(/[^a-zA-Z0-9_-]+/g, '_');

    const handleDownloadPdf = async (rec: Recommendation) => {
      try {
        const { jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const totalMonthly = rec.fullStandardList.reduce((sum, sl) => sum + sl.monthlyQuota, 0);

        const doc = new jsPDF();
        const marginX = 14;

        doc.setFontSize(16);
        doc.text(rec.listName, marginX, 18);
        doc.setFontSize(10);
        doc.setTextColor(110);
        const volumeText = rec.volumeCoveragePct !== null ? `  •  ${rec.volumeCoveragePct}% volume` : '';
        doc.text(`${rec.country}  •  ${rec.matchPercentage}% retailers${volumeText}`, marginX, 25);
        doc.setTextColor(0);

        doc.setFontSize(11);
        doc.text('Retailers from Standard List', marginX, 35);

        // Flatten parent rows + their banner decomposition, tracking which are matched/children.
        const pdfRows = rec.breakout.flatMap(({ row, children }) => [
          { label: row.retailer, qty: row.monthlyQuota, isChild: false, matched: retailerIsMatched(row.retailer, rec.matchedRetailers) },
          ...children.map(c => ({
            label: `    ${c.name} (${c.percentage}%)`,
            qty: c.monthlyQuota,
            isChild: true,
            matched: retailerIsMatched(c.name, rec.matchedRetailers),
          })),
        ]);

        autoTable(doc, {
          startY: 38,
          head: [['Retailer', 'Monthly']],
          body: pdfRows.map(r => [r.label, String(r.qty)]),
          foot: [['Total', String(totalMonthly)]],
          headStyles: { fillColor: [74, 45, 138], halign: 'left' },
          footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right' } },
          styles: { fontSize: 9, cellPadding: 2 },
          theme: 'striped',
          didParseCell: (data) => {
            if (data.section === 'body') {
              const r = pdfRows[data.row.index];
              if (!r) return;
              if (r.matched) data.cell.styles.fontStyle = 'bold';
              if (r.isChild) {
                data.cell.styles.fontSize = 8;
                data.cell.styles.textColor = r.matched ? 40 : 130;
              }
            }
          },
        });

        if (rec.suggestedBoosters.length > 0) {
          const finalY = (doc as any).lastAutoTable?.finalY ?? 38;
          doc.setFontSize(11);
          doc.text('Suggested Boosters to Add', marginX, finalY + 10);
          autoTable(doc, {
            startY: finalY + 13,
            body: rec.suggestedBoosters.map(b => [b.name, b.monthlyTarget ? `${b.monthlyTarget} needed` : '']),
            styles: { fontSize: 9, cellPadding: 2 },
            theme: 'plain',
          });
        }

        const shortfalls = rec.gaps.filter(g => g.available > 0);
        if (shortfalls.length > 0) {
          const finalY = (doc as any).lastAutoTable?.finalY ?? 38;
          doc.setFontSize(11);
          doc.text('Short on volume', marginX, finalY + 10);
          autoTable(doc, {
            startY: finalY + 13,
            head: [['Retailer', 'Available', 'Requested', 'Short']],
            body: shortfalls.map(g => [g.name, String(g.available), String(g.target), String(g.short)]),
            headStyles: { fillColor: [74, 45, 138], halign: 'left' },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
            styles: { fontSize: 9, cellPadding: 2 },
            theme: 'striped',
          });
        }

        doc.save(`${exportFileName(rec)}.pdf`);
        toast({ title: 'PDF downloaded', description: `Exported "${rec.listName}".` });
      } catch (err) {
        console.error('PDF export failed:', err);
        toast({ variant: 'destructive', title: 'PDF export failed', description: 'Could not generate the PDF. Please try again.' });
      }
    };

    const handleExportXlsx = (rec: Recommendation) => {
      try {
        const totalMonthly = rec.fullStandardList.reduce((sum, sl) => sum + sl.monthlyQuota, 0);

        const sheetData: (string | number)[][] = [
          [rec.listName],
          [`Country: ${rec.country}`],
          [`Retailer match: ${rec.matchPercentage}%`],
          ...(rec.volumeCoveragePct !== null ? [[`Volume coverage: ${rec.volumeCoveragePct}%`]] : []),
          [],
          ['Retailer', 'Monthly'],
          // Parent rows, each followed by its indented banner decomposition.
          ...rec.breakout.flatMap(({ row, children }) => [
            [row.retailer, row.monthlyQuota] as (string | number)[],
            ...children.map(c => [`    ↳ ${c.name} (${c.percentage}%)`, c.monthlyQuota] as (string | number)[]),
          ]),
          ['Total', totalMonthly],
        ];

        if (rec.suggestedBoosters.length > 0) {
          sheetData.push(
            [],
            ['Suggested Boosters to Add', 'Requested'],
            ...rec.suggestedBoosters.map(b => [b.name, b.monthlyTarget ?? ''] as (string | number)[]),
          );
        }

        const shortfalls = rec.gaps.filter(g => g.available > 0);
        if (shortfalls.length > 0) {
          sheetData.push(
            [],
            ['Short on volume', 'Available', 'Requested', 'Short'],
            ...shortfalls.map(g => [g.name, g.available, g.target, g.short] as (string | number)[]),
          );
        }

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];

        const wb = XLSX.utils.book_new();
        const safeSheetName = rec.listName.substring(0, 31).replace(/[^a-zA-Z0-9_ ]/g, '') || 'List';
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
        XLSX.writeFile(wb, `${exportFileName(rec)}.xlsx`);
        toast({ title: 'XLSX downloaded', description: `Exported "${rec.listName}".` });
      } catch (err) {
        console.error('XLSX export failed:', err);
        toast({ variant: 'destructive', title: 'XLSX export failed', description: 'Could not generate the spreadsheet. Please try again.' });
      }
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
                     <div className="flex flex-wrap items-center gap-2">
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
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 text-xs"
                            disabled={!selectedCountry}
                            onClick={() => { resetImport(); setIsImportOpen(true); }}
                        >
                            <ClipboardPaste className="mr-2 h-4 w-4" />
                            Paste or upload a list
                        </Button>
                    </div>

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
                                {availableRetailers.length > 0 ? availableRetailers.map(retailer => {
                                    const self = holdingSelfFor(retailer);
                                    const parent = self ? null : parentHoldingFor(retailer);
                                    const added = retailer.alreadyAdded;
                                    return (
                                    <div
                                        key={retailer.id}
                                        className={cn(
                                            "flex items-center space-x-2 p-1.5 text-sm rounded-md",
                                            added ? "bg-muted/40 opacity-70" : "hover:bg-muted"
                                        )}
                                    >
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 w-8 text-xs"
                                            disabled={added}
                                            title={added ? 'Already in your ranked list' : `Add ${retailer.name}`}
                                            onClick={() => handleAddRetailer(retailer)}
                                        >
                                            {added ? <Check className="h-3 w-3 text-green-600" /> : '+'}
                                        </Button>
                                        <span className={cn("font-normal flex-1 text-xs", added && "text-muted-foreground")}>
                                            {retailer.name}
                                        </span>
                                        {added && (
                                            <Badge
                                                variant="secondary"
                                                className="shrink-0 py-0 text-[9px] font-normal"
                                                title={self ? 'Its banners are already in your ranked list' : 'Already in your ranked list'}
                                            >
                                                {self ? 'Banners added' : 'In your list'}
                                            </Badge>
                                        )}
                                        {self && !added && (
                                            <Badge
                                                variant="secondary"
                                                className="shrink-0 gap-1 py-0 text-[9px] font-normal"
                                                title={`Holding company — adds all ${(self.bannerIds || []).length} banners`}
                                            >
                                                <Building2 className="h-2.5 w-2.5" />
                                                {(self.bannerIds || []).length} banners
                                            </Badge>
                                        )}
                                        {parent && (
                                            <Badge
                                                variant="outline"
                                                className="max-w-[120px] shrink-0 truncate py-0 text-[9px] font-normal text-muted-foreground"
                                                title={`Part of ${parent.name}`}
                                            >
                                                ↳ {parent.name}
                                            </Badge>
                                        )}
                                    </div>
                                    );
                                }) : (
                                    <div className="text-center text-xs text-muted-foreground p-4">
                                        {searchQuery.trim() ? 'No retailers match your search.' : 'No retailers available for this country.'}
                                    </div>
                                )}
                                </div>
                            </ScrollArea>
                        </div>
                        {/* Right Side: Ranked List */}
                         <div className="border rounded-lg p-4 flex flex-col gap-3">
                            <div className="flex items-baseline justify-between gap-2">
                                <h3 className="font-semibold text-xs">Your Ranked List ({preferredList.length})</h3>
                                {totalMonthlyTarget > 0 && (
                                    <span className="text-[11px] text-muted-foreground">
                                        {totalMonthlyTarget} monthly visits requested
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-muted-foreground -mt-2">
                                Drag to rank by importance (1 = most important). Enter monthly visits per retailer to score volume.
                            </p>
                             <ScrollArea className="h-64">
                                <div className="pr-3 space-y-0.5">
                                {preferredList.length > 0 ? (
                                    preferredList.map(retailer => {
                                        const parent = parentHoldingFor(retailer);
                                        return (
                                        <div
                                            key={retailer.id}
                                            draggable={dragEnabledId === retailer.id}
                                            onDragStart={(e) => handleDragStart(e, retailer)}
                                            onDragEnter={(e) => handleDragEnter(e, retailer)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                            className={cn(
                                                "flex items-center gap-1 p-0.5 rounded-md bg-muted/50",
                                                draggedItem.current?.id === retailer.id && "opacity-30"
                                            )}
                                        >
                                            <GripVertical
                                                className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                                                onMouseDown={() => setDragEnabledId(retailer.id)}
                                                onMouseUp={() => setDragEnabledId(null)}
                                                aria-label="Drag to reorder"
                                            />
                                            <span className="text-[11px] font-bold w-5 text-center">{retailer.rank}.</span>
                                            <span className="flex-1 font-medium text-xs">{retailer.name}</span>
                                            {parent && (
                                                <Badge
                                                    variant="outline"
                                                    className="max-w-[140px] shrink-0 truncate py-0 text-[9px] font-normal text-muted-foreground"
                                                    title={`Part of ${parent.name}`}
                                                >
                                                    ↳ {parent.name}
                                                </Badge>
                                            )}
                                            <Input
                                                type="number"
                                                min={0}
                                                inputMode="numeric"
                                                value={retailer.monthlyTarget ?? ''}
                                                onChange={e => handleTargetChange(retailer.id, e.target.value)}
                                                onPointerDown={e => e.stopPropagation()}
                                                placeholder="visits"
                                                title="Requested monthly visits (optional)"
                                                className="h-6 w-16 shrink-0 px-1 text-right text-[10px]"
                                            />
                                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveRetailer(retailer.id)}>
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center text-xs text-muted-foreground p-8">Add retailers from the left to build your list.</div>
                                )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className={cn(!selectedCountry && "opacity-50 pointer-events-none")}>
                     <Button size="lg" onClick={handleAskGenie} disabled={isGenerating || preferredList.length === 0 || isLoading}>
                        {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
                        {isGenerating ? 'Analyzing...' : isLoading ? 'Loading data...' : 'Ask the Genie'}
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
                        {!isGenerating && recommendations && recommendations.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                                <p className="text-sm font-medium">No matching lists found.</p>
                                <p className="text-xs mt-1">None of the store lists for {selectedCountry} share retailers with your preferred list. Check that your boosters and store list retailers use consistent names.</p>
                            </div>
                        )}
                        {!isGenerating && recommendations && recommendations.length > 0 && (
                             <TooltipProvider>
                             <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {visibleRecommendations.map(rec => {
                                    return (
                                    <Card key={rec.listName} className="flex flex-col">
                                        <CardHeader className="pb-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <CardTitle className="text-base">{rec.listName}</CardTitle>
                                                <div className="flex shrink-0 flex-col items-end gap-1">
                                                    <Badge className={cn("text-[11px]",
                                                        rec.matchPercentage > 80 ? "bg-green-500" : rec.matchPercentage > 60 ? "bg-yellow-500" : "bg-orange-500",
                                                        "text-white"
                                                    )}>
                                                        {rec.matchPercentage}% Retailers
                                                    </Badge>
                                                    {rec.volumeCoveragePct !== null && (
                                                        <Badge
                                                            variant="outline"
                                                            className={cn("text-[11px]",
                                                                rec.volumeCoveragePct > 80 ? "border-green-500 text-green-700"
                                                                    : rec.volumeCoveragePct > 60 ? "border-yellow-500 text-yellow-700"
                                                                    : "border-orange-500 text-orange-700"
                                                            )}
                                                            title="Share of your requested monthly visits this list can cover"
                                                        >
                                                            {rec.volumeCoveragePct}% Volume
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <CardDescription className="text-xs pt-1">
                                                {rec.country} · {rec.matchedRetailers.length} of {rec.matchedRetailers.length + rec.unmatchedRetailers.length} retailers
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="text-xs flex-grow space-y-3">
                                            <Separator />
                                            <div>
                                                <h4 className="font-semibold mb-2 text-xs">Retailers from Standard List:</h4>
                                                <Table className="text-[11px]">
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="h-auto py-1">Retailer</TableHead>
                                                            <TableHead className="h-auto py-1 text-right">Mthly</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {rec.breakout.map(({ row: sl, children }) => {
                                                            const parentMatch = retailerIsMatched(sl.retailer, rec.matchedRetailers);
                                                            return (
                                                                <React.Fragment key={sl.id}>
                                                                    <TableRow>
                                                                        <TableCell className={cn("py-1 flex items-center gap-2", parentMatch ? "font-bold" : "text-muted-foreground")}>
                                                                            {parentMatch && <Check className="h-4 w-4 text-green-500" />}
                                                                            {sl.retailer}
                                                                        </TableCell>
                                                                        <TableCell className={cn("py-1 text-right", !parentMatch && "text-muted-foreground")}>{sl.monthlyQuota}</TableCell>
                                                                    </TableRow>
                                                                    {children.map(child => {
                                                                        const childMatch = retailerIsMatched(child.name, rec.matchedRetailers);
                                                                        return (
                                                                            <TableRow key={`${sl.id}-${child.boosterId}`} className="bg-muted/30">
                                                                                <TableCell className={cn("py-0.5 pl-6 flex items-center gap-2", childMatch ? "font-semibold" : "text-muted-foreground")}>
                                                                                    {childMatch && <Check className="h-3.5 w-3.5 text-green-500" />}
                                                                                    <span className="text-[10px]">
                                                                                        ↳ {child.name}
                                                                                        <span className="ml-1 text-muted-foreground">({child.percentage}%)</span>
                                                                                    </span>
                                                                                </TableCell>
                                                                                {/* Extra right padding pulls sub-retailer counts out of the parent's count column. */}
                                                                                <TableCell className={cn("py-0.5 pr-9 text-right text-[10px]", !childMatch && "text-muted-foreground")}>{child.monthlyQuota}</TableCell>
                                                                            </TableRow>
                                                                        );
                                                                    })}
                                                                </React.Fragment>
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
                                                                    <TableCell className="py-1 text-right text-muted-foreground">
                                                                        {b.monthlyTarget ? `${b.monthlyTarget} needed` : ''}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}

                                            {/* Retailers the list carries, but not at the requested volume. */}
                                            {rec.gaps.some(g => g.available > 0) && (
                                                <div>
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <h4 className="text-xs font-semibold">Short on volume:</h4>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Info className="h-4 w-4 text-muted-foreground" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs text-xs">This list carries these retailers, but fewer monthly visits than you asked for.</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                    <Table className="text-[11px]">
                                                        <TableBody>
                                                            {rec.gaps.filter(g => g.available > 0).map(g => (
                                                                <TableRow key={g.name}>
                                                                    <TableCell className="py-1 font-medium">{g.name}</TableCell>
                                                                    <TableCell className="py-1 text-right text-muted-foreground">
                                                                        {g.available} of {g.target}
                                                                        <span className="ml-1 text-orange-600">(−{g.short})</span>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                        </CardContent>
                                        <CardFooter className="flex gap-2 p-2 border-t">
                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => handleDownloadPdf(rec)}>
                                                <Download className="mr-2 h-4 w-4" /> PDF
                                            </Button>
                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => handleExportXlsx(rec)}>
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

            <Dialog open={isImportOpen} onOpenChange={open => { setIsImportOpen(open); if (!open) resetImport(); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm">Import a retailer list</DialogTitle>
                        <DialogDescription className="text-xs">
                            Paste a list or upload a spreadsheet. Numbers are read as monthly visits, so
                            &quot;Kroger (60)&quot; asks for 60 visits a month.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <Textarea
                            value={importText}
                            onChange={e => handleImportTextChange(e.target.value)}
                            rows={4}
                            className="text-xs"
                            placeholder={'Ahold Delhaize (40), Albertsons (all banners) (60), Costco Wholesale Corp (20)\n\nOne per line also works, with or without numbers.'}
                        />

                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                ref={importFileRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleImportFile(file);
                                }}
                            />
                            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => importFileRef.current?.click()}>
                                <Upload className="mr-2 h-3.5 w-3.5" />
                                Upload .xlsx / .csv
                            </Button>
                            {importSource && <span className="text-[11px] text-muted-foreground">{importSource}</span>}
                        </div>

                        {importDuplicates.length > 0 && (
                            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                                Skipped {importDuplicates.length} repeated {importDuplicates.length === 1 ? 'retailer' : 'retailers'}: {importDuplicates.join(', ')}
                            </p>
                        )}

                        {importPreview.length > 0 && (
                            <div className="rounded-md border">
                                <ScrollArea className="h-56">
                                    <Table className="text-[11px]">
                                        <TableHeader className="sticky top-0 bg-muted">
                                            <TableRow>
                                                <TableHead className="h-7 py-1">Retailer</TableHead>
                                                <TableHead className="h-7 py-1 w-[90px] text-right">Monthly</TableHead>
                                                <TableHead className="h-7 py-1 w-[190px]">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {importPreview.map((row, i) => (
                                                <TableRow key={`${row.name}-${i}`}>
                                                    <TableCell className="py-1 font-medium">{row.booster?.name ?? row.name}</TableCell>
                                                    <TableCell className="py-1 text-right">
                                                        {row.monthlyTarget ?? <span className="text-muted-foreground">—</span>}
                                                    </TableCell>
                                                    <TableCell className="py-1">
                                                        {row.status === 'matched' ? (
                                                            <span className="inline-flex items-center gap-1 text-green-600">
                                                                <Check className="h-3 w-3" /> Known retailer
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground" title="Not in the Boosters list — still matched against store lists by name">
                                                                Not in Boosters — matched by name
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </div>
                        )}

                        {importPreview.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground">Add to your list:</span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={importMode === 'replace' ? 'default' : 'outline'}
                                    className="h-7 text-[11px]"
                                    onClick={() => setImportMode('replace')}
                                >
                                    Replace
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={importMode === 'append' ? 'default' : 'outline'}
                                    className="h-7 text-[11px]"
                                    onClick={() => setImportMode('append')}
                                >
                                    Append
                                </Button>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                        <Button type="button" size="sm" disabled={importPreview.length === 0} onClick={handleConfirmImport}>
                            Add {importPreview.length > 0 ? `${importPreview.length} retailer${importPreview.length === 1 ? '' : 's'}` : 'list'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
