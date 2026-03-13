
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import type { Category, StoreList, Booster, Order } from '@/lib/types';
import { Search, X, Loader2, Settings, PlusCircle, ArrowUpDown, CalendarIcon, Download, FileSpreadsheet, AlertTriangle, MessageSquare, Copy, Trash2, MinusCircle, XCircle, ChevronsUpDown, Star, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase, useUser, errorEmitter } from '@/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import * as XLSX from "xlsx";
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';


export type CartItem = {
  id: string; // Unique ID for the cart item, e.g., `${category.id}`
  category: Category;
  storeLists: StoreList[];
  boosters: { booster: Booster; storeCount: number }[];
  startDate?: Date;
  endDate?: Date;
  notes?: string;
};

// New type for managing configurations for multiple categories in the dialog
type TempConfiguration = {
    category: Category;
    storeLists: StoreList[];
    boosters: { booster: Booster; storeCount: number }[];
    startDate?: Date;
    endDate?: Date;
    notes?: string;
    proceedWithoutStandardList?: boolean;
};


type GroupedStoreList = {
    name: string;
    country: string;
    retailers: StoreList[];
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

type CountrySelectionDialogState = {
    isOpen: boolean;
    group: GroupedCategory | null;
    selectedCountries: Record<string, boolean>;
};

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
                        "w-full justify-start text-left font-normal h-9 text-xs",
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
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 1}
                    toYear={new Date().getFullYear() + 10}
                />
            </PopoverContent>
        </Popover>
    );
}

const TotalRequestCard = ({ config }: { config: TempConfiguration }) => {
    const total = useMemo(() => {
        const boosterTotal = config.boosters.reduce((sum, b) => sum + b.storeCount, 0);
        const standardMonthlyTotal = config.storeLists.reduce((sum, sl) => sum + (sl.monthlyQuota || 0), 0);

        return {
            monthlyTotal: standardMonthlyTotal + boosterTotal,
            standardMonthlyTotal,
        };
    }, [config]);

    return (
         <Card>
            <CardHeader className="p-2">
                <CardTitle className="text-sm">Total Request</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                    <p className="text-muted-foreground">Standard Monthly Quota:</p>
                    <p className="font-medium">{total.standardMonthlyTotal} stores</p>
                </div>
                <Separator/>
                <div className="flex justify-between items-center font-bold text-xs">
                    <p>Total Monthly Stores:</p>
                    <p>{total.monthlyTotal} stores</p>
                </div>
            </CardContent>
        </Card>
    )
}

const collectionTypes = ["Syndicated - For Paying Customer", "Syndicated - For Marketing", "Syndicated - For Prospective Client Demo", "Private Collection"] as const;

export default function CategoriesPage() {
  const firestore = useFirestore();
  const { user } = useUser();

  const { data: categories, isLoading: isLoadingCategories, error: errorCategories } = useCollection<Category>(useMemoFirebase(() => firestore ? collection(firestore, 'categories') : null, [firestore]));
  const { data: storeLists, isLoading: isLoadingStoreLists, error: errorStoreLists } = useCollection<StoreList>(useMemoFirebase(() => firestore ? collection(firestore, 'storeLists') : null, [firestore]));
  const { data: boosterData, isLoading: isLoadingBoosters, error: errorBoosters } = useCollection<Booster>(useMemoFirebase(() => firestore ? collection(firestore, 'boosters') : null, [firestore]));

  const isLoading = isLoadingCategories || isLoadingStoreLists || isLoadingBoosters;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [categorySearch, setCategorySearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [categorySort, setCategorySort] = useState<SortConfig<GroupedCategory>>({ key: 'name', direction: 'asc' });

  // State for multi-category selection - now stores individual Category objects
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  
  // Wizard step: 1 = Select Categories, 2 = Configure Retailers, 3 = Review & Submit
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  // Holds the temporary configurations for all categories being edited
  const [tempConfigs, setTempConfigs] = useState<TempConfiguration[]>([]);
  // The category currently being focused on within the dialog's accordion
  const [activeConfigCategory, setActiveConfigCategory] = useState<Category | null>(null);

  const [boosterSearch, setBoosterSearch] = useState('');
  const [customBoosterName, setCustomBoosterName] = useState('');
  
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [hubspotDealId, setHubspotDealId] = useState('');
  const [typeOfCollection, setTypeOfCollection] = useState<Order['typeOfCollection'] | ''>('');
  
  const [isNoListConfirmOpen, setIsNoListConfirmOpen] = useState(false);

  // State to manage which category configuration is open
  const [openCollapsibleId, setOpenCollapsibleId] = useState<string | null>(null);


  const [isCopyEmailDialogOpen, setIsCopyEmailDialogOpen] = useState(false);
  
  const [countrySelectionDialog, setCountrySelectionDialog] = useState<CountrySelectionDialogState>({
    isOpen: false,
    group: null,
    selectedCountries: {},
  });

  const [premiumCountryFilter, setPremiumCountryFilter] = useState('all');


  const { toast } = useToast();

  const [boosterInputValues, setBoosterInputValues] = useState<Record<string, string>>({});
  const [isBoosterSectionOpen, setIsBoosterSectionOpen] = useState(false);
  const [isStoreListSectionOpen, setIsStoreListSectionOpen] = useState(true);

  useEffect(() => {
    if (user && (currentStep === 2 || currentStep === 3)) {
        setSubmitterName(user.displayName || '');
        setSubmitterEmail(user.email || '');
    }
  }, [user, currentStep]);


  useEffect(() => {
    const error = errorCategories || errorStoreLists || errorBoosters;
    if (error) {
        toast({
            variant: "destructive",
            title: "Error Loading Data",
            description: "Could not fetch necessary data from the database. Please check permissions and try again."
        });
        console.error("Data loading error:", error);
    }
  }, [errorCategories, errorStoreLists, errorBoosters, toast]);


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
  
  const groupedStoreLists = useMemo((): GroupedStoreList[] => {
      const groups: Record<string, GroupedStoreList> = {};
      (storeLists || []).forEach(sl => {
          const key = `${sl.name}-${sl.country}`;
          if (!groups[key]) {
              groups[key] = { name: sl.name, country: sl.country, retailers: [] };
          }
          groups[key].retailers.push(sl);
      });
      return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [storeLists]);

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
  
   const availableStoreListsForCountry = useMemo(() => {
    if (!activeConfigCategory) return [];
    return groupedStoreLists.filter(sl => sl.country === activeConfigCategory.country);
  }, [groupedStoreLists, activeConfigCategory]);

  const activeConfig = tempConfigs.find(c => c.category.id === activeConfigCategory?.id);

  const availableBoosters = useMemo(() => {
    if (!activeConfigCategory || !boosterData) return [];
    const lowercasedSearch = boosterSearch.toLowerCase();
    
    // Get custom boosters for the current category
    const customBoosters = activeConfig?.boosters
        .filter(b => b.booster.isCustom)
        .map(b => b.booster) || [];
    
    // Combine standard and custom boosters
    const allBoosters = [...boosterData, ...customBoosters];
    const uniqueBoosters = Array.from(new Set(allBoosters.map(b => b.id))).map(id => allBoosters.find(b => b.id === id)!);


    return uniqueBoosters
        .filter(b => b.country === activeConfigCategory.country || b.isCustom)
        .filter(b => b.name.toLowerCase().includes(lowercasedSearch));
  }, [boosterSearch, activeConfigCategory, activeConfig, boosterData]);

  const unconfiguredCount = useMemo(() => {
      const configuredIds = new Set(tempConfigs.filter(c => (c.storeLists.length > 0 || c.proceedWithoutStandardList) && c.startDate && c.endDate).map(c => c.category.id));
      return selectedCategories.filter(sc => !configuredIds.has(sc.id)).length;
  }, [tempConfigs, selectedCategories]);


  const handleOpenConfigureDialog = useCallback((cats: Category[]) => {
    if (cats.length === 0) return;

    // Preserve existing configurations for categories that are already in `tempConfigs`
    const existingConfigs = new Map(tempConfigs.map(c => [c.category.id, c]));
    
    const newConfigs = cats.map(cat => {
        if (existingConfigs.has(cat.id)) {
            return existingConfigs.get(cat.id)!;
        }
        return {
            category: cat,
            storeLists: [],
            boosters: [],
            startDate: undefined,
            endDate: undefined,
            notes: '',
            proceedWithoutStandardList: false,
        };
    });

    // Initialize booster input values from the combined configs
    const newBoosterValues: Record<string, string> = {};
    newConfigs.forEach(config => {
        config.boosters.forEach(b => {
            newBoosterValues[b.booster.id] = String(b.storeCount);
        });
    });
    setBoosterInputValues(newBoosterValues);


    setTempConfigs(newConfigs);
    setActiveConfigCategory(newConfigs[0]?.category || null);
    setOpenCollapsibleId(newConfigs[0]?.category.id || null); // Set the first one to be open
    setCurrentStep(2);
}, [tempConfigs]);


const handleToggleGroupSelection = (group: GroupedCategory, isSelected: boolean) => {
    const isMultiCountry = group.sourceCategories.length > 1;

    if (isSelected) {
        if (isMultiCountry) {
            // Open dialog to choose countries
            setCountrySelectionDialog({
                isOpen: true,
                group,
                selectedCountries: group.sourceCategories.reduce((acc, cat) => {
                    acc[cat.country] = selectedCategories.some(sc => sc.id === cat.id);
                    return acc;
                }, {} as Record<string, boolean>),
            });
        } else {
            // Single country group, add directly
            setSelectedCategories(prev => [...prev, group.sourceCategories[0]]);
        }
    } else {
        // Deselect all categories from this group
        const groupIds = new Set(group.sourceCategories.map(sc => sc.id));
        setSelectedCategories(prev => prev.filter(sc => !groupIds.has(sc.id)));
    }
};

const handleCountrySelectionConfirm = () => {
    const { group, selectedCountries } = countrySelectionDialog;
    if (!group) return;

    const groupIds = new Set(group.sourceCategories.map(sc => sc.id));

    // Get the source categories that were checked in the dialog
    const newlySelectedCats = group.sourceCategories.filter(
        sc => selectedCountries[sc.country]
    );

    setSelectedCategories(prev => [
        // Remove all categories belonging to this group first
        ...prev.filter(sc => !groupIds.has(sc.id)),
        // Then add back only the newly selected ones
        ...newlySelectedCats,
    ]);

    setCountrySelectionDialog({ isOpen: false, group: null, selectedCountries: {} });
};


const handleStoreListGroupSelect = (listGroup: GroupedStoreList) => {
    if (!activeConfigCategory) return;
    setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== activeConfigCategory.id) return config;

        const isSelected = config.storeLists.some(sl => sl.name === listGroup.name && sl.country === listGroup.country);
        let newSelection;
        if (isSelected) {
            newSelection = config.storeLists.filter(sl => sl.name !== listGroup.name || sl.country !== listGroup.country);
        } else {
            newSelection = [...config.storeLists, ...listGroup.retailers];
        }
        return { ...config, storeLists: newSelection, proceedWithoutStandardList: newSelection.length === 0 ? config.proceedWithoutStandardList : false };
    }));
};

const handleProceedWithoutListChange = (checked: boolean) => {
    if (checked) {
        setIsNoListConfirmOpen(true);
    } else {
        // Unchecking it
        if (!activeConfigCategory) return;
        setTempConfigs(prev => prev.map(config => {
            if (config.category.id !== activeConfigCategory.id) return config;
            return { ...config, proceedWithoutStandardList: false };
        }));
    }
};

const confirmProceedWithoutList = () => {
    if (!activeConfigCategory) return;
    setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== activeConfigCategory.id) return config;
        return { ...config, proceedWithoutStandardList: true, storeLists: [] };
    }));
};

const handleClearSelections = (categoryId: string) => {
    setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== categoryId) return config;
        return { ...config, storeLists: [], boosters: [], startDate: undefined, endDate: undefined, proceedWithoutStandardList: false };
    }));
    setBoosterInputValues({});
    toast({
        title: "Selections Cleared",
        description: `Selections for "${activeConfigCategory?.name}" have been cleared.`
    });
};

const handleBoosterSelect = (booster: Booster, isSelected: boolean) => {
     if (!activeConfigCategory) return;
    setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== activeConfigCategory.id) return config;
        
        const boosterIndex = config.boosters.findIndex(b => b.booster.id === booster.id);
        if (isSelected && boosterIndex === -1) {
             const newBoosters = [...config.boosters, {booster, storeCount: 20}];
             setBoosterInputValues(prevBoosterValues => ({...prevBoosterValues, [booster.id]: '20'}));
             return {...config, boosters: newBoosters};
        } else if (!isSelected && boosterIndex > -1) {
            const newBoosters = config.boosters.filter(b => b.booster.id !== booster.id);
            setBoosterInputValues(prevBoosterValues => {
                const newValues = {...prevBoosterValues};
                delete newValues[booster.id];
                return newValues;
            });
            return {...config, boosters: newBoosters};
        }
        return config;
    }));
};

const handleAddCustomBooster = () => {
    if (!customBoosterName.trim() || !activeConfigCategory) return;
    
    const newBooster: Booster = {
        id: `custom-${Date.now()}`,
        name: customBoosterName.trim(),
        country: activeConfigCategory.country,
        isCustom: true,
    };

    setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== activeConfigCategory.id) return config;
        
        const newBoosters = [...config.boosters, {booster: newBooster, storeCount: 20}];
        setBoosterInputValues(prevBoosterValues => ({...prevBoosterValues, [newBooster.id]: '20'}));
        return {...config, boosters: newBoosters};
    }));

    setCustomBoosterName('');
};


const handleBoosterCountChange = (boosterId: string, value: string) => {
     if (!activeConfigCategory) return;
    // Update the string value for the input
    setBoosterInputValues(prev => ({...prev, [boosterId]: value}));

    // Update the number value in the main config state if it's a valid number
    const parsedValue = parseInt(value, 10);
    if (!isNaN(parsedValue)) {
        setTempConfigs(prev => prev.map(config => {
            if (config.category.id !== activeConfigCategory.id) return config;
            return {
                ...config,
                boosters: config.boosters.map(b => 
                    b.booster.id === boosterId ? {...b, storeCount: parsedValue} : b
                )
            };
        }));
    }
};

const handleBoosterCountBlur = (boosterId: string) => {
    const value = boosterInputValues[boosterId];
    if (value === '' || isNaN(parseInt(value, 10)) || parseInt(value, 10) <= 0) {
        toast({
            variant: "destructive",
            title: "Invalid Booster Count",
            description: "Booster count must be a number greater than 0. Defaulting to 1.",
        });
        setBoosterInputValues(prev => ({...prev, [boosterId]: '1'}));
        setTempConfigs(prev => prev.map(config => {
            if (config.category.id !== activeConfigCategory?.id) return config;
            return {
                ...config,
                boosters: config.boosters.map(b => 
                    b.booster.id === boosterId ? {...b, storeCount: 1} : b
                )
            };
        }));
    }
};

const handleCustomBoosterNameChange = (boosterId: string, name: string) => {
    if (!activeConfigCategory) return;
    setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== activeConfigCategory.id) return config;

        return {
            ...config,
            boosters: config.boosters.map(b => 
                b.booster.id === boosterId ? {...b, booster: {...b.booster, name }} : b
            )
        };
    }));
}


const handleDateChange = (date: Date | undefined, type: 'start' | 'end') => {
    if (!activeConfigCategory) return;
     setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== activeConfigCategory.id) return config;
        if (type === 'start') {
            return {...config, startDate: date};
        } else {
             return {...config, endDate: date};
        }
    }));
}

const handleNotesChange = (value: string) => {
    if (!activeConfigCategory) return;
    setTempConfigs(prev => prev.map(config => {
        if (config.category.id !== activeConfigCategory.id) return config;
        return {...config, notes: value};
    }));
}

const handleApplyToAll = (sourceConfig: TempConfiguration) => {
    if (!sourceConfig) return;
    
    setTempConfigs(prev => prev.map(config => ({
        ...config,
        storeLists: sourceConfig.storeLists.filter(sl => sl.country === config.category.country),
        boosters: sourceConfig.boosters.filter(b => (b.booster.country === config.category.country && !b.booster.isCustom)), // Don't copy custom boosters
        startDate: sourceConfig.startDate,
        endDate: sourceConfig.endDate,
        notes: sourceConfig.notes,
        proceedWithoutStandardList: sourceConfig.proceedWithoutStandardList,
    })));
    toast({
        title: "Configuration Applied",
        description: `Settings from ${sourceConfig.category.name} (${sourceConfig.category.country}) applied to all selected categories.`
    })
};

  const validateOrder = (order: TempConfiguration[]) => {
    const unconfiguredItems = order.filter(config => !config.startDate || !config.endDate);

    if (unconfiguredItems.length > 0) {
        const itemNames = unconfiguredItems.map(item => `"${item.category.name} (${item.category.country})"`).join(', ');
        toast({
            variant: "destructive",
            title: "Missing Collection Period",
            description: `Please set a start and end date for the following item(s): ${itemNames}`,
        });
        return false;
    }

    const itemsWithoutLists = order.filter(config => config.storeLists.length === 0 && !config.proceedWithoutStandardList);
     if (itemsWithoutLists.length > 0) {
        const itemNames = itemsWithoutLists.map(item => `"${item.category.name} (${item.category.country})"`).join(', ');
        toast({
            variant: "destructive",
            title: "Missing Standard List",
            description: `Please select a standard list or check "Proceed without standard list" for the following item(s): ${itemNames}`,
        });
        return false;
    }

    if (order.length === 0) {
        toast({
            variant: "destructive",
            title: "Empty Order",
            description: "Please configure at least one category before submitting.",
        });
        return false;
    }
    return true;
  };
  
  const handleSubmitOrder = async () => {
    if (!firestore) {
        toast({ variant: 'destructive', title: 'Database not available', description: 'Please try again in a moment.' });
        return;
    }

    const orderToSubmit = tempConfigs.filter(config => config.storeLists.length > 0 || config.boosters.length > 0 || config.proceedWithoutStandardList);

    if (!validateOrder(orderToSubmit)) return;
    
    if (!submitterName || !submitterEmail || !customerName || !hubspotDealId || !typeOfCollection) {
      toast({
        variant: "destructive",
        title: "Information Required",
        description: "Please fill out all fields: Customer Name, Hubspot Deal ID, and Type of Collection.",
      });
      return;
    }

    setIsSubmitting(true);
    
    const orderId = `order-${Date.now()}`;
    const orderRef = doc(firestore, 'orders', orderId);

    const orderData: Order = {
        id: orderId,
        customer: customerName,
        hubspotDealId: hubspotDealId,
        typeOfCollection: typeOfCollection,
        submittedBy: submitterName,
        submitterEmail: submitterEmail,
        timestamp: new Date().toISOString(),
        status: "New",
        opsTeamNotes: "",
        items: orderToSubmit.map(item => ({
            categoryName: item.category.name,
            categoryCode: item.category.number,
            country: item.category.country,
            startDate: item.startDate ? format(item.startDate, 'yyyy-MM-dd') : 'N/A',
            endDate: item.endDate ? format(item.endDate, 'yyyy-MM-dd') : 'N/A',
            notes: item.notes || '',
            retailers: [
                ...item.storeLists.map(sl => ({
                    name: sl.retailer,
                    listName: sl.name, // Ensure listName is saved
                    type: 'Standard',
                    weeklyQuota: sl.weeklyQuota,
                    monthlyQuota: sl.monthlyQuota
                })),
                ...item.boosters.map(b => ({
                    name: b.booster.name,
                    type: b.booster.isCustom ? 'Custom Booster' : 'Booster',
                    weeklyQuota: Math.round(b.storeCount / 4),
                    monthlyQuota: b.storeCount
                }))
            ]
        }))
    };

    setDoc(orderRef, orderData)
        .then(() => {
            toast({
                title: "Order Submitted!",
                description: "Your request has been sent. The Ops team will be notified via Slack (notifications are batched and sent every 15 minutes).",
            });
            // Reset states
            setTempConfigs([]);
            setSelectedCategories([]);
            setSubmitterName('');
            setSubmitterEmail('');
            setCustomerName('');
            setHubspotDealId('');
            setTypeOfCollection('');
            setCurrentStep(1);
            setIsSubmitting(false);
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'create',
                requestResourceData: orderData,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            setIsSubmitting(false);
        });
  };

  const handleExportToXlsx = () => {
    const orderToExport = tempConfigs.filter(config => config.storeLists.length > 0 || config.boosters.length > 0 || config.proceedWithoutStandardList);
    if (!validateOrder(orderToExport)) return;

    const wb = XLSX.utils.book_new();

    orderToExport.forEach(item => {
        const sheetData: (string | number | undefined)[][] = [
            ["Category:", item.category.name],
            ["Country:", item.category.country],
            ["Collection Period:", `${item.startDate ? format(item.startDate, "PP") : 'N/A'} - ${item.endDate ? format(item.endDate, "PP") : 'N/A'}`],
            item.notes ? ["Notes:", item.notes] : [],
            [], // spacer
            ["Retailer", "List Type", "Weekly Quota", "Monthly Quota"]
        ];

        const allRetailers = [
            ...item.storeLists.map(sl => ({ name: sl.retailer, type: `Standard (${sl.name})`, weekly: sl.weeklyQuota, monthly: sl.monthlyQuota })),
            ...item.boosters.map(b => ({ name: b.booster.name, type: b.booster.isCustom ? 'Custom Booster' : 'Booster', weekly: Math.round(b.storeCount / 4), monthly: b.storeCount })),
        ];
        
        allRetailers.forEach(r => {
            sheetData.push([r.name, r.type, r.weekly, r.monthly]);
        });
        
        const totalWeekly = allRetailers.reduce((sum, r) => sum + r.weekly, 0);
        const totalMonthly = allRetailers.reduce((sum, r) => sum + r.monthly, 0);
        sheetData.push(["Total", "", totalWeekly, totalMonthly]);

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const safeSheetName = `${item.category.name.substring(0, 20)}_${item.category.country}`.replace(/[^a-zA-Z0-9_]/g, '');
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    });

    XLSX.writeFile(wb, `order-export-${new Date().toISOString().split('T')[0]}.xlsx`);
};

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
        <p className="ml-4 text-muted-foreground">Loading subscription data...</p>
      </div>
    );
  }

  const orderForEmail = tempConfigs.filter(config => config.storeLists.length > 0 || config.boosters.length > 0 || config.proceedWithoutStandardList);

  const handleRemoveSelectedCategory = (categoryId: string) => {
    setSelectedCategories(prev => prev.filter(c => c.id !== categoryId));
  };


  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {([{ step: 1, label: 'Select Categories' }, { step: 2, label: 'Configure Retailers' }, { step: 3, label: 'Review & Submit' }] as const).map(({ step, label }, i) => (
            <div key={step} className="flex items-center">
              <div className={cn(
                'flex items-center gap-2',
                currentStep === step ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}>
                <span className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm',
                  currentStep === step ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50'
                )}>{step}</span>
                <span className="text-sm">{label}</span>
              </div>
              {i < 2 && <div className="mx-2 h-px w-8 bg-muted-foreground/30" aria-hidden />}
            </div>
          ))}
        </div>

        {currentStep === 1 && (
        <div>
            <div className="mb-4">
                <h2 className="text-lg font-semibold">Step 1: Select Categories</h2>
                <p className="text-sm text-muted-foreground">Choose one or more retail categories for data syndication</p>
            </div>

            {selectedCategories.length > 0 && (
                <Card className="mb-4">
                    <CardHeader className="p-3">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-base">
                                {selectedCategories.length} {selectedCategories.length === 1 ? 'Category' : 'Categories'} Selected
                            </CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedCategories([])}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Clear all
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="flex flex-wrap gap-2">
                            {selectedCategories.map(category => (
                                <Badge key={category.id} variant="secondary" className="pl-3 pr-1 py-1 text-sm">
                                    {category.name} ({category.country})
                                    {category.premium && <Star className="h-3 w-3 ml-1.5 text-amber-500 fill-amber-500" />}
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="ml-1 h-5 w-5"
                                        onClick={() => handleRemoveSelectedCategory(category.id)}
                                    >
                                        <X className="h-3 w-3" />
                                        <span className="sr-only">Remove {category.name}</span>
                                    </Button>
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex justify-between items-center mb-4 gap-4">
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
            <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-muted-foreground">
                    {selectedCategories.length === 0 ? 'No categories selected' : `${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'} selected`}
                </p>
                <Button
                    onClick={() => selectedCategories.length > 0 && handleOpenConfigureDialog(selectedCategories)}
                    disabled={selectedCategories.length === 0}
                    className="bg-[#4A2D8A] hover:bg-[#3d2570]"
                >
                    Next: Configure Retailers
                </Button>
            </div>
            <Card>
                <ScrollArea className="h-[75vh]">
                    <Table>
                        <TableHeader className={cn("sticky top-0 bg-muted z-10")}>
                            <TableRow>
                                <TableHead className="w-[60px] p-1.5">
                                    <Checkbox
                                        aria-label="Select all rows"
                                        className="translate-y-[2px] invisible"
                                    />
                                </TableHead>
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
                                const selectedCountInGroup = group.sourceCategories.filter(sc => selectedCategories.some(c => c.id === sc.id)).length;
                                const isSelected = selectedCountInGroup > 0;
                                const isIndeterminate = isSelected && selectedCountInGroup < group.sourceCategories.length;
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
                                <TableRow key={group.name} data-state={isSelected ? 'selected' : ''}>
                                    <TableCell className="p-1.5">
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={(checked) => handleToggleGroupSelection(group, !!checked)}
                                            aria-label={`Select row for ${group.name}`}
                                        />
                                    </TableCell>
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
        )}

        {currentStep === 2 && (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold">Step 2: Configure Retailers</h2>
                    <p className="text-sm text-muted-foreground">Configure store lists and boosters for each selected category. Use &quot;Apply to All&quot; to copy a configuration.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep(1)}>Back</Button>
                    <Button className="bg-[#4A2D8A] hover:bg-[#3d2570]" onClick={() => setCurrentStep(3)}>Next: Review & Submit</Button>
                </div>
            </div>
            <div className="flex-grow min-h-0 flex gap-4 overflow-y-auto">
                <div className="w-1/2 flex flex-col gap-4">
                    <Card className="flex-grow flex flex-col">
                        <CardHeader className="p-2">
                            <CardTitle className="text-xs">Selected Categories</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow overflow-hidden px-1 py-2 pt-0">
                            <ScrollArea className="h-full">
                                <div className="space-y-2">
                                    {tempConfigs.map(config => {
                                        const uniqueStoreListCount = new Set(config.storeLists.map(sl => sl.name)).size;
                                        const isOpen = openCollapsibleId === config.category.id;

                                        return (
                                        <Collapsible 
                                            key={config.category.id} 
                                            open={isOpen} 
                                            onOpenChange={() => {
                                                if (isOpen) {
                                                    setOpenCollapsibleId(null);
                                                    setActiveConfigCategory(null);
                                                } else {
                                                    setOpenCollapsibleId(config.category.id);
                                                    setActiveConfigCategory(config.category);
                                                }
                                            }}
                                            className="border rounded-md"
                                        >
                                            <div className={cn("flex justify-between items-center p-2 text-sm", isOpen && 'bg-accent/20')}>
                                                <div className="flex flex-col items-start text-left flex-1">
                                                    <div className='flex items-center gap-2'>
                                                        <span className="font-semibold text-xs">{config.category.name}</span>
                                                        <Badge variant="outline" className="text-[10px]">{config.category.country}</Badge>
                                                        {config.category.premium && <Star className="h-3 w-3 text-amber-500 fill-amber-500"/>}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-normal flex items-center gap-x-1.5 mt-1">
                                                        {(uniqueStoreListCount > 0 || config.proceedWithoutStandardList) && <Badge variant="secondary" className='py-0 text-[10px]'>{config.proceedWithoutStandardList ? 'No Standard List' : `${uniqueStoreListCount} list${uniqueStoreListCount > 1 ? 's' : ''}`}</Badge>}
                                                        {config.boosters.length > 0 && <Badge variant="secondary" className='py-0 text-[10px]'>{config.boosters.length} booster{config.boosters.length > 1 ? 's' : ''}</Badge>}
                                                        {(!config.startDate || !config.endDate) && <Badge variant="destructive" className='py-0 text-[10px]'>Date required</Badge>}
                                                        {uniqueStoreListCount === 0 && !config.proceedWithoutStandardList && <Badge variant="destructive" className='py-0 text-[10px]'>List required</Badge>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                     <CollapsibleTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                                                            {isOpen ? 'Collapse' : 'Expand'}
                                                            <ChevronsUpDown className="ml-2 h-3 w-3" />
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                </div>
                                            </div>
                                            <CollapsibleContent className="p-2 space-y-4 pt-2 border-t">
                                                <div className="flex justify-between items-center">
                                                    <Button 
                                                        onClick={(e) => { e.stopPropagation(); handleApplyToAll(config); }}
                                                        variant="secondary"
                                                        size="sm"
                                                        className="text-xs" 
                                                        disabled={tempConfigs.length < 2}
                                                    >
                                                        <Settings className="mr-2 h-4 w-4" />
                                                        Apply this setup to All
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={(e) => { e.stopPropagation(); handleClearSelections(config.category.id); }}
                                                    >
                                                        <XCircle className="mr-2 h-3 w-3" /> Clear Selections
                                                    </Button>
                                                </div>
                                                <Separator/>

                                                <Collapsible open={isStoreListSectionOpen} onOpenChange={setIsStoreListSectionOpen}>
                                                    <CollapsibleTrigger asChild>
                                                        <div className="flex items-center justify-between cursor-pointer">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-semibold text-xs">A. Select Standard Store Lists (Required)</h4>
                                                                {!isStoreListSectionOpen && (
                                                                    <Badge variant={(uniqueStoreListCount === 0 && !activeConfig?.proceedWithoutStandardList) ? "destructive" : "secondary"} className='py-0 text-[10px]'>
                                                                        {activeConfig?.proceedWithoutStandardList ? 'None' : `${uniqueStoreListCount} list${uniqueStoreListCount === 1 ? '' : 's'}`} selected
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <Button variant="ghost" size="sm" className="h-8">
                                                                {isStoreListSectionOpen ? ( <MinusCircle className="mr-2 h-4 w-4" /> ) : ( <PlusCircle className="mr-2 h-4 w-4" /> )}
                                                                <span className="text-xs">{isStoreListSectionOpen ? 'Hide' : 'Add/Edit'}</span>
                                                            </Button>
                                                        </div>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <div className="mt-1 space-y-2">
                                                            <ScrollArea className="h-40 pr-3">
                                                                <Accordion type="multiple" className="w-full" disabled={activeConfig?.proceedWithoutStandardList}>
                                                                    {availableStoreListsForCountry.length > 0 ? availableStoreListsForCountry.map(slGroup => {
                                                                        const isSelected = activeConfig?.storeLists.some(s => s.name === slGroup.name && s.country === slGroup.country);
                                                                        return (
                                                                            <AccordionItem value={slGroup.name} key={slGroup.name}>
                                                                                <div className="flex items-center gap-2 flex-1 pr-2 py-1">
                                                                                    <Checkbox checked={isSelected} id={`sl-check-${config.category.id}-${slGroup.name}`} onCheckedChange={() => handleStoreListGroupSelect(slGroup)}/>
                                                                                    <label htmlFor={`sl-check-${config.category.id}-${slGroup.name}`} className="cursor-pointer text-[10px] font-medium flex-1">{slGroup.name}</label>
                                                                                    <AccordionTrigger className="p-0 hover:no-underline [&>svg]:-ml-2 [&>svg]:size-4"/>
                                                                                </div>
                                                                                <AccordionContent>
                                                                                    <div className="space-y-1 pl-6">
                                                                                        {slGroup.retailers.map(retailer => (
                                                                                            <div key={retailer.id} className="flex justify-between items-center text-[10px]">
                                                                                                <p className="text-muted-foreground">{retailer.retailer}</p>
                                                                                                <p className="font-mono text-muted-foreground">{retailer.monthlyQuota} per month</p>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </AccordionContent>
                                                                            </AccordionItem>
                                                                        );
                                                                    }) : (
                                                                        <p className="text-[10px] text-muted-foreground p-4 text-center">No standard store lists available for {activeConfigCategory?.country}.</p>
                                                                    )}
                                                                </Accordion>
                                                            </ScrollArea>
                                                             <div className="flex items-center space-x-2 pt-2 border-t">
                                                                <Checkbox
                                                                    id={`no-standard-list-${config.category.id}`}
                                                                    checked={activeConfig?.proceedWithoutStandardList}
                                                                    onCheckedChange={(checked) => handleProceedWithoutListChange(!!checked)}
                                                                />
                                                                <label
                                                                    htmlFor={`no-standard-list-${config.category.id}`}
                                                                    className="text-xs font-medium leading-none text-red-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                                >
                                                                    Proceed without standard list
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </CollapsibleContent>
                                                </Collapsible>
                                                
                                                <Separator />

                                                <Collapsible open={isBoosterSectionOpen} onOpenChange={setIsBoosterSectionOpen}>
                                                    <CollapsibleTrigger asChild>
                                                        <div className="flex items-center justify-between cursor-pointer">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-semibold text-xs">B. Add Optional Boosters</h4>
                                                                {!isBoosterSectionOpen && (
                                                                    <Badge variant="secondary" className='py-0 text-[10px]'>
                                                                        {activeConfig?.boosters?.length || 0} booster{activeConfig?.boosters?.length === 1 ? '' : 's'} selected
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <Button variant="ghost" size="sm" className="h-8">
                                                                {isBoosterSectionOpen ? ( <MinusCircle className="mr-2 h-4 w-4" /> ) : ( <PlusCircle className="mr-2 h-4 w-4" /> )}
                                                                <span className="text-xs">{isBoosterSectionOpen ? 'Hide' : 'Add/Edit'}</span>
                                                            </Button>
                                                        </div>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent className="pt-2 space-y-3">
                                                        {activeConfig && activeConfig.boosters.length > 0 && (
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px]">Selected Boosters</Label>
                                                                <div className="space-y-2 rounded-md border p-2 max-h-32 overflow-y-auto">
                                                                    {activeConfig.boosters.map(({booster}) => (
                                                                        <div key={booster.id} className="flex items-center gap-2">
                                                                            {booster.isCustom ? (
                                                                                <Input
                                                                                    value={booster.name}
                                                                                    onChange={(e) => handleCustomBoosterNameChange(booster.id, e.target.value)}
                                                                                    className="h-8 flex-1 text-xs"
                                                                                />
                                                                            ) : (
                                                                                <span className="text-xs font-medium flex-1">{booster.name}</span>
                                                                            )}
                                                                            <Input
                                                                                type="number"
                                                                                value={boosterInputValues[booster.id] || ''}
                                                                                onChange={(e) => handleBoosterCountChange(booster.id, e.target.value)}
                                                                                onBlur={() => handleBoosterCountBlur(booster.id)}
                                                                                className="h-8 w-16 text-xs"
                                                                                aria-label="Monthly Quota"
                                                                                placeholder="e.g. 20"
                                                                            />
                                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleBoosterSelect(booster, false)}>
                                                                                <Trash2 className="h-3 w-3" />
                                                                            </Button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div>
                                                            <Label className="text-[10px]">Available Boosters</Label>
                                                            <div className="relative mt-1">
                                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                                <Input 
                                                                    placeholder="Search boosters..."
                                                                    value={boosterSearch}
                                                                    onChange={(e) => setBoosterSearch(e.target.value)}
                                                                    className="pl-7 h-8 text-xs"
                                                                />
                                                                {boosterSearch && <Button variant="ghost" size="icon" className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setBoosterSearch('')}><X className="h-3 w-3"/></Button>}
                                                            </div>
                                                            <ScrollArea className="h-24 mt-2">
                                                                <div className="space-y-1 pr-3">
                                                                {availableBoosters.filter(b => !activeConfig?.boosters.some(sb => sb.booster.id === b.id)).length > 0 ? availableBoosters.filter(b => !activeConfig?.boosters.some(sb => sb.booster.id === b.id)).map(booster => (
                                                                        <div key={booster.id} className="flex items-center space-x-2 p-1 rounded-md hover:bg-muted">
                                                                            <Checkbox
                                                                                id={`booster-${config.category.id}-${booster.id}`}
                                                                                checked={activeConfig?.boosters.some(b => b.booster.id === booster.id)}
                                                                                onCheckedChange={(checked) => handleBoosterSelect(booster, !!checked)}
                                                                            />
                                                                            <Label htmlFor={`booster-${config.category.id}-${booster.id}`} className="text-xs font-normal flex-1 cursor-pointer">{booster.name}</Label>
                                                                        </div>
                                                                    )
                                                                ) : (
                                                                    <p className="text-xs text-muted-foreground p-4 text-center">No more boosters to add.</p>
                                                                )}
                                                                </div>
                                                            </ScrollArea>
                                                        </div>
                                                        
                                                        <div className="mt-1 space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    placeholder="Add a custom booster and press enter..."
                                                                    value={customBoosterName}
                                                                    onChange={(e) => setCustomBoosterName(e.target.value)}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomBooster(); } }}
                                                                    className="h-8 text-xs"
                                                                />
                                                                <Button type="button" onClick={handleAddCustomBooster} disabled={!customBoosterName.trim()} size="sm" className="text-xs">Add</Button>
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground p-1">
                                                                <b>Pro Tip!</b> When adding custom boosters, clearly define each retailer and visit count in your list. Include any important details in Notes/Comments and share the list with the Ops team.
                                                            </p>
                                                        </div>
                                                    </CollapsibleContent>
                                                </Collapsible>
                                                
                                                <Separator />

                                                <div>
                                                    <h4 className="font-semibold mb-2 text-xs">C. Collection Period (Required)</h4>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <DatePicker 
                                                            date={activeConfig?.startDate}
                                                            onDateChange={(d) => handleDateChange(d, 'start')}
                                                            placeholder="Start Date"
                                                        />
                                                        <DatePicker 
                                                            date={activeConfig?.endDate}
                                                            onDateChange={(d) => handleDateChange(d, 'end')}
                                                            disabled={{ before: activeConfig?.startDate }}
                                                            placeholder="End Date"
                                                        />
                                                    </div>
                                                </div>

                                                <Separator />

                                                <div>
                                                    <h4 className="font-semibold mb-2 text-xs">D. Collection Notes</h4>
                                                    <Textarea 
                                                        value={activeConfig?.notes || ''}
                                                        onChange={(e) => handleNotesChange(e.target.value)}
                                                        placeholder="Add any specific instructions or comments for this category..."
                                                        className="text-xs"
                                                    />
                                                </div>

                                            </CollapsibleContent>
                                        </Collapsible>
                                    )})}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                <div className="w-1/2 flex flex-col gap-4">
                    <div className='space-y-2 flex-grow flex flex-col min-h-0'>
                        <h4 className="font-semibold text-sm">Selection Summary</h4>
                        <ScrollArea className="flex-grow">
                            <div className="space-y-2 pr-2">
                                {tempConfigs.map(config => {
                                    const retailerMap = new Map<string, { name: string; type: 'Standard' | 'Booster'; weekly: number; monthly: number; boosterExtra?: number }>();

                                    // Aggregate standard lists by retailer
                                    config.storeLists.forEach((sl) => {
                                        const existing = retailerMap.get(sl.retailer);
                                        const weekly = sl.weeklyQuota || 0;
                                        const monthly = sl.monthlyQuota || 0;

                                        if (existing) {
                                            existing.weekly += weekly;
                                            existing.monthly += monthly;
                                        } else {
                                            retailerMap.set(sl.retailer, {
                                                name: sl.retailer,
                                                type: 'Standard',
                                                weekly,
                                                monthly,
                                            });
                                        }
                                    });

                                    const customBoosters: { name: string; type: string; weekly: number; monthly: number }[] = [];

                                    // Apply boosters
                                    config.boosters.forEach((b) => {
                                        const weekly = Math.round(b.storeCount / 4);
                                        const monthly = b.storeCount;

                                        if (b.booster.isCustom) {
                                            customBoosters.push({
                                                name: b.booster.name,
                                                type: 'Custom Booster',
                                                weekly,
                                                monthly,
                                            });
                                            return;
                                        }

                                        const existing = retailerMap.get(b.booster.name);
                                        if (existing) {
                                            existing.weekly += weekly;
                                            existing.monthly += monthly;
                                            existing.boosterExtra = (existing.boosterExtra || 0) + monthly;
                                        } else {
                                            retailerMap.set(b.booster.name, {
                                                name: b.booster.name,
                                                type: 'Booster',
                                                weekly,
                                                monthly,
                                            });
                                        }
                                    });

                                    const allRetailers = [
                                        ...Array.from(retailerMap.values()),
                                        ...customBoosters,
                                    ].sort((a, b) => a.name.localeCompare(b.name));
                                    const uniqueStoreListCount = new Set(config.storeLists.map(sl => sl.name)).size;
                                    const isConfigIncomplete = (uniqueStoreListCount === 0 && !config.proceedWithoutStandardList) || !config.startDate || !config.endDate;

                                    return (
                                        <Card key={config.category.id} className="overflow-hidden">
                                            <CardHeader className="px-2 py-1 bg-muted/50">
                                                <CardTitle className="text-sm flex justify-between items-center">
                                                    <span>{config.category.name} <Badge variant="outline" className="text-[10px]">{config.category.country}</Badge></span>
                                                    {isConfigIncomplete && (
                                                        <Badge variant="destructive" className="text-[10px]">
                                                            Info required
                                                        </Badge>
                                                    )}
                                                </CardTitle>
                                                 {(config.startDate || config.endDate) && (
                                                    <CardDescription className="text-xs pt-1">
                                                        {config.startDate ? `From: ${format(config.startDate, 'PP')}` : 'Start date missing'}
                                                        {' | '}
                                                        {config.endDate ? `To: ${format(config.endDate, 'PP')}`: 'End date missing'}
                                                    </CardDescription>
                                                )}
                                            </CardHeader>
                                            <CardContent className="p-1.5 space-y-1.5">
                                                {allRetailers.length === 0 ? (
                                                    <p className="text-[10px] text-muted-foreground text-center py-2">No selections made.</p>
                                                ) : (
                                                    <Table className="text-[10px]">
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="h-6 px-0.5 py-1">Retailer</TableHead>
                                                                <TableHead className="h-6 px-0.5 py-1">List Type</TableHead>
                                                                <TableHead className="h-6 px-0.5 py-1 text-right">Monthly</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {allRetailers.map((item, index) => (
                                                                <TableRow key={index} className="h-6">
                                                                    <TableCell className="px-0.5 py-1 font-medium">{item.name}</TableCell>
                                                                    <TableCell className="px-0.5 py-1 text-muted-foreground">
                                                                        {item.type === 'Standard' && 'boosterExtra' in item && item.boosterExtra
                                                                            ? <>Standard <span className="text-[9px] text-primary font-medium">(Boosted - Add {item.boosterExtra})</span></>
                                                                            : item.type}
                                                                    </TableCell>
                                                                    <TableCell className="px-0.5 py-1 text-right font-mono">{item.monthly}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                )}
                                                {config.notes && (
                                                    <div className="pt-2 mt-2 border-t">
                                                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{config.notes}</p>
                                                    </div>
                                                )}
                                            </CardContent>
                                            <CardFooter className="p-0">
                                                <TotalRequestCard config={config} />
                                            </CardFooter>
                                        </Card>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
              </div>
            </div>
        )}

        {currentStep === 3 && (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Step 3: Review & Submit</h2>
                <Button variant="outline" onClick={() => setCurrentStep(2)}>Back</Button>
            </div>
            {unconfiguredCount > 0 && (
                <Alert variant="destructive" className="w-auto max-w-md">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                        You have {unconfiguredCount} {unconfiguredCount === 1 ? 'category' : 'categories'} that require a list selection and/or a collection period.
                    </AlertDescription>
                </Alert>
            )}
            <div className="flex gap-2 flex-wrap">
                <Button onClick={handleExportToXlsx} variant="outline" size="sm">
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Export XLSX
                </Button>
                <Button onClick={() => setIsCopyEmailDialogOpen(true)} variant="outline" size="sm">
                    <Copy className="mr-2 h-4 w-4" /> Copy for Email
                </Button>
                <Button onClick={handleSubmitOrder} size="sm" className="bg-[#4A2D8A] hover:bg-[#3d2570]" disabled={isSubmitting || !customerName || !hubspotDealId || !typeOfCollection}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirm & Submit
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Order details</CardTitle>
                    <CardDescription>Please confirm the details before submitting.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="customer-name-s3" className="text-right">Customer</Label>
                        <Input id="customer-name-s3" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="col-span-3" placeholder="Customer or Prospect Name" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="hubspot-deal-id-s3" className="text-right">Hubspot Deal ID</Label>
                        <Input id="hubspot-deal-id-s3" value={hubspotDealId} onChange={(e) => setHubspotDealId(e.target.value)} className="col-span-3" placeholder="Required" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="type-of-collection-s3" className="text-right">Collection Type</Label>
                        <Select onValueChange={(value) => setTypeOfCollection(value as Order['typeOfCollection'])} value={typeOfCollection}>
                            <SelectTrigger id="type-of-collection-s3" className="col-span-3">
                                <SelectValue placeholder="Select a type..." />
                            </SelectTrigger>
                            <SelectContent>
                                {collectionTypes.map(type => (
                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="submitter-name-s3" className="text-right">Your Name</Label>
                        <Input id="submitter-name-s3" value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="submitter-email-s3" className="text-right">Your Email</Label>
                        <Input id="submitter-email-s3" type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} className="col-span-3" />
                    </div>
                </CardContent>
            </Card>
        </div>
        )}

        <AlertDialog open={countrySelectionDialog.isOpen} onOpenChange={(open) => {if (!open) setCountrySelectionDialog({ isOpen: false, group: null, selectedCountries: {} });}}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Select Countries for &quot;{countrySelectionDialog.group?.name}&quot;</AlertDialogTitle>
                    <AlertDialogDescription>This category is available in multiple countries. Please select which ones you want to configure.</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4 space-y-2">
                    {countrySelectionDialog.group?.sourceCategories.map(sc => (
                        <div key={sc.id} className="flex items-center space-x-2">
                             <Checkbox
                                id={`country-check-${sc.id}`}
                                checked={!!countrySelectionDialog.selectedCountries[sc.country]}
                                onCheckedChange={checked => {
                                    setCountrySelectionDialog(prev => ({
                                        ...prev,
                                        selectedCountries: {
                                            ...prev.selectedCountries,
                                            [sc.country]: !!checked,
                                        }
                                    }))
                                }}
                            />
                            <label htmlFor={`country-check-${sc.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {sc.country}
                            </label>
                        </div>
                    ))}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setCountrySelectionDialog({ isOpen: false, group: null, selectedCountries: {} })}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCountrySelectionConfirm}>Confirm</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>


      <AlertDialog open={isNoListConfirmOpen} onOpenChange={setIsNoListConfirmOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    Are you sure you want to proceed without a standard store list?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmProceedWithoutList}>
                    Proceed
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       <Dialog open={isCopyEmailDialogOpen} onOpenChange={setIsCopyEmailDialogOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
                <DialogTitle>Copy Order for Email</DialogTitle>
                <DialogDescription>
                    Select and copy the content below (Ctrl+A or Cmd+A) and paste it into your email client.
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="border rounded-md p-6 bg-white">
                <div className="prose prose-sm max-w-none">
                    {orderForEmail.map(item => (
                        <div key={item.category.id} style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', marginBottom: '32px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 'bold', borderBottom: '1px solid #ddd', paddingBottom: '8px', marginBottom: '16px' }}>
                                {item.category.name} ({item.category.country})
                            </h2>
                            <p style={{ margin: '0 0 16px 0', color: '#555' }}>
                                {item.category.description}
                            </p>
                            <p style={{ margin: '0 0 16px 0' }}>
                                <strong>Collection Period:</strong> {item.startDate && item.endDate ? `${format(item.startDate, "PP")} - ${format(item.endDate, "PP")}` : 'Not specified'}
                            </p>
                            {item.notes && (
                                <div style={{ margin: '0 0 16px 0', padding: '12px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 8px 0' }}>Notes:</h3>
                                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.notes}</p>
                                </div>
                            )}

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>Retailer</th>
                                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>List Type</th>
                                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', backgroundColor: '#f2f2f2' }}>Weekly</th>
                                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', backgroundColor: '#f2f2f2' }}>Monthly</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {item.storeLists.map((sl, index) => (
                                        <tr key={`std-${index}`}>
                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>{sl.retailer}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>Standard ({sl.name})</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{sl.weeklyQuota}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{sl.monthlyQuota}</td>
                                        </tr>
                                    ))}
                                    {item.boosters.map((b, index) => (
                                        <tr key={`bst-${index}`}>
                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>{b.booster.name}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>{b.booster.isCustom ? 'Custom Booster' : 'Booster'}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{Math.round(b.storeCount / 4)}</td>
                                            <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{b.storeCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </ScrollArea>
             <DialogFooter>
                <Button onClick={() => setIsCopyEmailDialogOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
