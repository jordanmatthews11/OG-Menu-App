"use client";

import { useState, useMemo, useEffect } from "react";
import type { Booster } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, X, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import { RetailerTabs } from "@/components/retailer/retailer-tabs";

type SortKey = "name" | "country";
type SortConfig = { key: SortKey; direction: "asc" | "desc" };

export default function AvailableRetailersPage() {
  const firestore = useFirestore();
  const { data: boosters, isLoading, error } = useCollection<Booster>(
    useMemoFirebase(() => (firestore ? collection(firestore, "boosters") : null), [firestore])
  );
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortConfig>({ key: "name", direction: "asc" });

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to load retailers",
        description: "Could not fetch the retailer list. Please try again.",
      });
      console.error("Error fetching boosters:", error);
    }
  }, [error, toast]);

  const rows = useMemo(() => {
    let list = boosters ? [...boosters] : [];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) => b.name.toLowerCase().includes(q) || (b.country || "").toLowerCase().includes(q)
      );
    }

    const other: SortKey = sort.key === "name" ? "country" : "name";
    list.sort((a, b) => {
      const av = String(a[sort.key] ?? "").toLowerCase();
      const bv = String(b[sort.key] ?? "").toLowerCase();
      if (av < bv) return sort.direction === "asc" ? -1 : 1;
      if (av > bv) return sort.direction === "asc" ? 1 : -1;
      return String(a[other] ?? "").localeCompare(String(b[other] ?? ""));
    });

    return list;
  }, [boosters, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );

  const sortIcon = (key: SortKey) => (
    <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5", sort.key === key ? "" : "text-muted-foreground/50")} />
  );

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-full">
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4 text-muted-foreground">Loading retailers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-full">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Available Retailers</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Every retailer available for collection, from the Booster list. Search or sort to find one.
          </p>
        </div>
      </div>

      <RetailerTabs />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search retailers or countries..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 text-xs h-9"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearch("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {rows.length} retailer{rows.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="border rounded-md">
            <ScrollArea className="h-[70vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted z-10">
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/50 text-xs" onClick={() => toggleSort("name")}>
                      <div className="flex items-center">Retailer {sortIcon("name")}</div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 text-xs w-[220px]"
                      onClick={() => toggleSort("country")}
                    >
                      <div className="flex items-center">Country {sortIcon("country")}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length > 0 ? (
                    rows.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium text-xs py-1.5">{b.name}</TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground">{b.country}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-xs text-muted-foreground py-8">
                        No retailers match your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
