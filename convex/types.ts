export type ProductBrand = "iPhone" | "Samsung" | "Other";

export type ProductCondition = "New" | "Used";

export interface Product {
  id: string;
  name: string;
  brand: ProductBrand;
  price: number;
  storage: string;
  condition: ProductCondition;
  inStock: boolean;
  sellerId: string;
}
