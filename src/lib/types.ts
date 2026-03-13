
export type Country = string;

export const countries: { name: string, flag: string }[] = [
    { name: 'US', flag: '🇺🇸' },
    { name: 'Canada', flag: '🇨🇦' },
    { name: 'Mexico', flag: '🇲🇽' },
    { name: 'UK', flag: '🇬🇧' },
    { name: 'Australia', flag: '🇦🇺' },
    { name: 'Spain', flag: '🇪🇸' },
];

export type Category = {
    id: string;
    department: string;
    subDepartment: string;
    name:string;
    number: string;
    description: string;
    exampleBrands: string;
    country: Country;
    premium: boolean;
    notes?: string;
};

export type StoreList = {
    id: string;
    name: string;
    retailer: string;
    weeklyQuota: number;
    monthlyQuota: number;
    country: Country;
};

export type Booster = {
    id: string;
    name: string;
    country: Country;
    isCustom?: boolean;
};

export type HoldingCompany = {
    id: string;
    name: string;
    banners: string[];
    country: Country;
};

export type CustomCategoryCode = {
    id: string;
    timestamp: string;
    submittedBy: string;
    customer: string;
    category: string;
    categoryCode: string;
    codeType: "Standard" | "Custom" | "Legacy";
    jobIds: string;
    notes: string;
};

export type AuthorizedUser = {
    id: string;
    name: string;
    email: string;
};

export type Feedback = {
    id: string;
    timestamp: string;
    name: string;
    email?: string;
    feedbackType: "problem" | "feature" | "general";
    description: string;
    details?: string;
    page?: string;
    feedbackStatus: "New" | "In Process" | "Roadmap" | "Declined" | "In Consideration" | "Complete";
    adminNotes?: string;
};

export type OrderItemRetailer = {
    name: string; // Retailer name
    listName?: string; // The name of the standard list it belongs to
    type: string;
    weeklyQuota: number;
    monthlyQuota: number;
};

export type OrderItem = {
    categoryName: string;
    categoryCode: string;
    country: string;
    startDate: string;
    endDate: string;
    notes: string;
    retailers: OrderItemRetailer[];
};

export type Order = {
    id: string;
    customer: string;
    submittedBy: string;
    submitterEmail: string;
    timestamp: string;
    items: OrderItem[];
    status: "New" | "In Progress" | "Complete" | "On Hold" | "Cancelled" | "Deleted";
    opsTeamNotes?: string;
    hubspotDealId: string;
    typeOfCollection: "Syndicated - For Paying Customer" | "Syndicated - For Marketing" | "Syndicated - For Prospective Client Demo" | "Private Collection";
};

export type SupportRequest = {
    id: string;
    timestamp: string;
    name: string;
    urgency: number;
    requestType: string;
    status: "New" | "In Progress" | "Complete" | "On Hold" | "Cancelled" | "Deleted";
    opsNotes?: string;
    issueType?: string;
    customer?: string;
    dashboardType?: string;
    description?: string;
    specialInstructions?: string;
    privateSpace_domains?: string;
    privateSpace_collections?: string;
    categoryName?: string;
    categoryId?: string;
    jobIds?: string;
    collectionCountry?: string;
    collectionStartDate?: string;
    collectionEndDate?: string;
    collectionLocations?: number | null;
};

export type LegacyCode = {
    id: string;
    code: string;
    timestamp: string;
};
