export const cities = ["Mangaluru", "Bengaluru", "Hubballi"] as const;

export const categories = {
  coworking: "Coworking",
  library: "Library",
  study: "Study centre",
  private: "Private office",
} as const;

export const amenities = {
  wifi: "High-speed Wi-Fi",
  power: "Charging ports",
  ac: "Air conditioning",
  meeting: "Meeting rooms",
  coffee: "Coffee",
  quiet: "Quiet zone",
} as const;

export type City = (typeof cities)[number];
export type Category = keyof typeof categories;
export type Amenity = keyof typeof amenities;

export type Workspace = {
  id: string;
  name: string;
  city: City;
  neighborhood: string;
  address: string;
  timezone: string;
  category: Category;
  description: string;
  hours: string;
  hourlyPrice: number;
  rating: number;
  sampleAvailableSeats: number;
  amenities: Amenity[];
  image: { src: string; alt: string };
  featured?: boolean;
};
