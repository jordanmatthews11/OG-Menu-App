
import { z } from "zod";

export const supportFormSchema = z.object({
  name: z.string().min(2, { message: "Your name is required and must be at least 2 characters." }),
  urgency: z.number().min(1).max(5),
  assistanceType: z.enum(["support", "privateSpace", "newCustomCategoryCode"], {
    required_error: "You must select a request type."
  }),

  // Support Fields
  support_issueType: z.string().optional(),
  support_customer: z.string().optional(),
  support_dashboardType: z.string().optional(),
  support_description: z.string().optional(),
  support_specialInstructions: z.string().optional(),
  support_collectionCountry: z.string().optional(),
  support_collectionStartDate: z.date().optional(),
  support_collectionEndDate: z.date().optional(),
  support_collectionLocations: z.coerce.number().optional(),
  
  // Private Space Fields
  privateSpace_name: z.string().optional(),
  privateSpace_domains: z.string().optional(),
  privateSpace_collections: z.string().optional(),
  privateSpace_specialInstructions: z.string().optional(),

  // New Custom Category Code Fields
  customCategory_customer: z.string().optional(),
  customCategory_category: z.string().optional(),
  customCategory_code: z.string().optional(),
  customCategory_jobIds: z.string().optional(),
  customCategory_notes: z.string().optional(),

}).superRefine((data, ctx) => {
    if (data.assistanceType === 'support' && (!data.support_description || data.support_description.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please provide a detailed description for the support request.",
        path: ["support_description"],
      });
    }
     if (data.assistanceType === 'support' && (!data.support_issueType || data.support_issueType.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select an issue type.",
        path: ["support_issueType"],
      });
    }
    if (data.assistanceType === 'newCustomCategoryCode') {
        if (!data.customCategory_customer || data.customCategory_customer.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Customer name is required.", path: ["customCategory_customer"] });
        }
        if (!data.customCategory_category || data.customCategory_category.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Category is required.", path: ["customCategory_category"] });
        }
        if (!data.customCategory_code || data.customCategory_code.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Category Code is required.", path: ["customCategory_code"] });
        }
    }
    if (data.assistanceType === 'privateSpace') {
      if (!data.privateSpace_name || data.privateSpace_name.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Private Space name is required.", path: ["privateSpace_name"] });
      }
      if (!data.privateSpace_domains || data.privateSpace_domains.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one domain is required.", path: ["privateSpace_domains"] });
      }
       if (!data.privateSpace_collections || data.privateSpace_collections.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one collection is required.", path: ["privateSpace_collections"] });
      }
    }
});

    
