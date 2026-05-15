export type CompanyBookingStatus = 'მიმდინარე' | 'დადასტურებული' | 'დასრულებული' | 'გაუქმებული';

export type CompanyActiveBooking = {
  id: string;
  type: string;
  route: string;
  driverName: string;
  driverPhone: string;
  driverPlate: string;
  vehicleClass: string;
  status: CompanyBookingStatus;
  date: string;
  priceGel: number;
};

export const MOCK_COMPANY_SUBSCRIPTION = {
  tier: 'პრემიუმ',
  validUntil: '31 დეკ 2026',
  monthlyLimit: 120,
  usedThisMonth: 34,
};

export const MOCK_COMPANY_STATS = {
  totalBookings: 47,
  totalSpentGel: 12840,
};

export const MOCK_ACTIVE_COMPANY_BOOKINGS: CompanyActiveBooking[] = [
  {
    id: 'bk-1042',
    type: 'ტრანსფერი',
    route: 'თბილისი (აეროპორტი) → ბათუმი',
    driverName: 'გიორგი მელაძე',
    driverPhone: '+995 555 12 34 56',
    driverPlate: 'AA-123-BB',
    vehicleClass: 'ბიზნეს',
    status: 'მიმდინარე',
    date: '14 მაი 2026, 14:30',
    priceGel: 420,
  },
  {
    id: 'bk-1041',
    type: 'ტური',
    route: 'კახეთი — ღვინის ტური (1 დღე)',
    driverName: 'ნინო ხარაიშვილი',
    driverPhone: '+995 577 98 76 54',
    driverPlate: 'BC-777-DD',
    vehicleClass: 'კომფორტი',
    status: 'დადასტურებული',
    date: '16 მაი 2026, 09:00',
    priceGel: 650,
  },
];

export type HistoryRow = {
  id: string;
  type: string;
  route: string;
  date: string;
  priceGel: number;
  status: CompanyBookingStatus;
};

export const MOCK_BOOKING_HISTORY: HistoryRow[] = [
  {
    id: 'h-900',
    type: 'ტრანსფერი',
    route: 'თბილისი → ქუთაისი',
    date: '10 მაი 2026',
    priceGel: 180,
    status: 'დასრულებული',
  },
  {
    id: 'h-899',
    type: 'ერთდღიანი ტური',
    route: 'მცხეთა — უფლისციხე',
    date: '5 მაი 2026',
    priceGel: 290,
    status: 'დასრულებული',
  },
  {
    id: 'h-898',
    type: 'ტური',
    route: 'სვანეთი (3 დღე)',
    date: '22 აპრ 2026',
    priceGel: 2400,
    status: 'დასრულებული',
  },
  {
    id: 'h-897',
    type: 'ტრანსფერი',
    route: 'ბათუმი → თბილისი',
    date: '18 აპრ 2026',
    priceGel: 350,
    status: 'გაუქმებული',
  },
  {
    id: 'h-896',
    type: 'ტრანსფერი',
    route: 'თბილისი → გორი',
    date: '12 აპრ 2026',
    priceGel: 95,
    status: 'დასრულებული',
  },
];

export const MOCK_COMPANY_LEGAL_ID = '405012345';
