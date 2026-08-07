export interface CuisineItem {
  value: string;
  label: string;
  icon: string;
}

export const CUISINE_ITEMS: CuisineItem[] = [
  { value: 'american', label: 'American', icon: '🍔' },
  { value: 'italian', label: 'Italian', icon: '🍝' },
  { value: 'mexican', label: 'Mexican', icon: '🌮' },
  { value: 'chinese', label: 'Chinese', icon: '🥡' },
  { value: 'japanese', label: 'Japanese / Sushi', icon: '🍣' },
  { value: 'thai', label: 'Thai', icon: '🍜' },
  { value: 'indian', label: 'Indian', icon: '🍛' },
  { value: 'mediterranean', label: 'Mediterranean', icon: '🫒' },
  { value: 'middle_eastern', label: 'Middle Eastern', icon: '🧆' },
  { value: 'korean', label: 'Korean', icon: '🍲' },
  { value: 'vietnamese', label: 'Vietnamese', icon: '🥢' },
  { value: 'bbq', label: 'BBQ', icon: '🍖' },
  { value: 'pizza', label: 'Pizza', icon: '🍕' },
  { value: 'seafood', label: 'Seafood', icon: '🦐' },
  { value: 'vegetarian', label: 'Vegan / Vegetarian', icon: '🥗' },
  { value: 'cafe', label: 'Cafe / Coffee', icon: '☕' },
  { value: 'bakery', label: 'Bakery / Dessert', icon: '🧁' },
  { value: 'bar', label: 'Bar / Pub', icon: '🍺' },
  { value: 'brunch', label: 'Breakfast / Brunch', icon: '🥞' },
  { value: 'fast_food', label: 'Fast Food', icon: '🍟' },
  { value: 'food_truck', label: 'Food Truck', icon: '🚚' },
  { value: 'other', label: 'Other', icon: '✨' },
];

export const CUISINE_VALUES: Set<string> = new Set(CUISINE_ITEMS.map((c) => c.value));

export function cuisineLabel(value: string): string {
  return CUISINE_ITEMS.find((c) => c.value === value)?.label ?? value;
}
