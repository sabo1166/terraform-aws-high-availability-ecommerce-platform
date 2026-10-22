import { z } from "zod";

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
];

export const FIELD_NAMES = ["email", "customerName", "line1", "line2", "city", "region", "postalCode", "country"] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
export type CheckoutValues = Record<FieldName, string>;

export const emptyCheckoutValues: CheckoutValues = {
  email: "",
  customerName: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "US",
};

const required = (label: string, max = 120) =>
  z.string().trim().min(1, `Enter ${label}`).max(max, `${label[0]?.toUpperCase()}${label.slice(1)} is too long`);

export const checkoutFormSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address").max(254),
  customerName: required("your full name"),
  line1: required("your street address", 200),
  line2: z.string().trim().max(200, "Address line 2 is too long"),
  city: required("your city"),
  region: required("your state or region"),
  postalCode: z
    .string()
    .trim()
    .min(1, "Enter your postal code")
    .max(16, "Postal code is too long")
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/, "Enter a valid postal code"),
  country: z.string().trim().length(2, "Choose a country"),
});

/** Returns a message per invalid field; an empty object means the form is valid. */
export function validateCheckout(values: CheckoutValues): Partial<Record<FieldName, string>> {
  const result = checkoutFormSchema.safeParse(values);
  if (result.success) return {};
  const errors: Partial<Record<FieldName, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as FieldName | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** Maps a server "address.line1" style path onto a form field name. */
export function fieldFromServerPath(path: string): FieldName | undefined {
  const name = path.replace(/^address\./, "");
  return (FIELD_NAMES as readonly string[]).includes(name) ? (name as FieldName) : undefined;
}
