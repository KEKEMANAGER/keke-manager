export type BookingTabKey = 'pending' | 'confirmed' | 'completed';

export type MockBooking = {
  id: string;
  company: string;
  date: string;
  route: string;
  priceGel: number;
  tab: BookingTabKey;
};

export const MOCK_DRIVER_STATS = {
  completedTrips: 142,
  rating: 4.8,
  earningsGel: 18420,
};

export const MOCK_BALANCE_GEL = 1240;

export const MOCK_ACTIVE_BOOKING = {
  id: 'bk-active-1',
  company: 'ქართული ლოგისტიკა LLC',
  from_location: 'თბილისი, ვაკე',
  to_location: 'ქუთაისი, ცენტრი',
  date: '15 მაისი, 09:30',
  priceGel: 180,
};

export const MOCK_BOOKINGS: MockBooking[] = [
  {
    id: '1',
    company: 'სატრანსპორტო კომპანია არმა',
    date: '16 მაისი, 14:00',
    route: 'თბილისი → რუსთავი',
    priceGel: 45,
    tab: 'pending',
  },
  {
    id: '2',
    company: 'Black Sea Cargo',
    date: '14 მაისი, 11:20',
    route: 'ბათუმი → ფოთი',
    priceGel: 120,
    tab: 'pending',
  },
  {
    id: '3',
    company: 'კავკასია ტრანსი',
    date: '12 მაისი, 08:00',
    route: 'თბილისი → გორი',
    priceGel: 95,
    tab: 'confirmed',
  },
  {
    id: '4',
    company: 'EuroLine Georgia',
    date: '10 მაისი, 16:45',
    route: 'თბილისი აეროპორტი → ცენტრი',
    priceGel: 35,
    tab: 'completed',
  },
  {
    id: '5',
    company: 'სატრანსპორტო კომპანია არმა',
    date: '8 მაისი, 10:15',
    route: 'თბილისი → მცხეთა',
    priceGel: 40,
    tab: 'completed',
  },
];

export const MOCK_RATING_BREAKDOWN = {
  punctuality: 4.9,
  cleanliness: 4.7,
  communication: 4.8,
  driving: 4.9,
};
