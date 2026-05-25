import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'supabase', 'seed', 'vehicles_makes_models.sql');

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function inferBody(name) {
  const n = name.toLowerCase();
  if (/\b(coach|tourismo|travego|i6\b|i8\b|9700|9900|lion's coach|setra|neoplan|van hool|irizar|prevost|j4500|king long|yutong|solaris|temsa|intercity hd)\b/.test(n)) return 'coach';
  if (/\b(minibus|shuttle bus|school bus|midibus|commuter bus)\b/.test(n)) return 'minibus';
  if (/\b(v-class|vito|sprinter|transit|crafter|master|ducato|boxer|movano|caravelle|multivan|tourneo|hiace|nv\d|expert|trafic|vivaro|scudo|odyssey|sienna|carnival|pacifica|caravan|voyager|alhambra|sharan|galaxy|espace|zafira|metris|eqv|marco polo)\b/.test(n)) return 'van';
  if (/\b(pickup|truck|f-150|f150|silverado|sierra|ram 1500|tacoma|tundra|ranger|navara|frontier|titan|amarok|hilux|l200|triton|colorado|canyon|ridgeline|cybertruck|r1t|mav)\b/.test(n)) return 'pickup';
  if (/\b(suv|crossover|rav4|highlander|4runner|sequoia|cr-v|pilot|passport|hr-v|cx-5|cx-9|cx-30|cx-50|cx-90|outback|forester|ascent|crosstrek|wrangler|grand cherokee|cherokee|compass|renegade|bronco|explorer|expedition|edge|escape|ecosport|taurus|tahoe|suburban|yukon|escalade|xt4|xt5|xt6|navigator|aviator|nautilus|corsair|defender|discovery|range rover|evoque|velar|sport|x[1-7]|q[3-8]|e-tron|q4|q8|gl[abc]|gle|gls|g-class|gv\d|lx\d|rx\d|nx\d|ux\d|mdx|rdx|tucson|santa fe|palisade|telluride|sorento|sportage|seltos|ev6|ev9|ioniq 5|model y|model x|macan|cayenne|urus|bentayga|cullinan|dbx|xc\d|ex30|ex90|kodiaq|karoq|tiguan|atlas|taos|enyaq|ariya|kona|venue|soul|vitara|jimny|outlander|eclipse cross|pajero|asx)\b/.test(n)) return 'suv';
  if (/\b(coupe|911|718|mustang|camaro|corvette|challenger|charger|supra|gr86|brz|mx-5|miata|488|f8|hurac|revuelto|db11|vantage|f-type|gran turismo|4 series|2 series|z4|tt|rc\b|812|296|sf90|roma|portofino|812|mc20|gt\b)\b/.test(n)) return 'coupe';
  if (/\b(convertible|roadster|cabrio|spyder|spider)\b/.test(n)) return 'convertible';
  if (/\b(wagon|estate|touring|avant|sportwagon|combi|v60|v90|outback)\b/.test(n)) return 'wagon';
  if (/\b(hatch|golf|polo|focus|fiesta|yaris|fit|swift|mazda2|mazda3|mini cooper|i20|i30|corolla hatch|proace city)\b/.test(n)) return 'hatchback';
  if (/\b(limo|limousine|stretch|maybach|phantom|ghost|wraith|dawn|s-class|e-class|c-class|a-class|3 series|5 series|7 series|a4|a6|a8|model 3|camry|accord|altima|sonata|k5|passat|jetta|malibu|impala|ct5|cts|model s|air\b)\b/.test(n)) return 'sedan';
  return 'other';
}

const VARIANT_SUFFIXES = [
  ' Hybrid',
  ' Electric',
  ' Plug-in Hybrid',
  ' Touring',
  ' Sport',
  ' Limited',
  ' Premium',
  ' Executive',
  ' SE',
  ' XLE',
  ' GT',
  ' RS',
  ' AWD',
  ' Long Range',
  ' Performance',
];

function padModels(base, min = 18, max = 32) {
  const out = [];
  const seen = new Set();
  for (const name of base) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  let idx = 0;
  while (out.length < min && idx < base.length) {
    for (const suffix of VARIANT_SUFFIXES) {
      const cand = base[idx] + suffix;
      const key = cand.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(cand);
      }
      if (out.length >= min) break;
    }
    idx += 1;
  }
  return out.slice(0, max);
}

function entry(name, category, baseModels, opts = {}) {
  const min = opts.min ?? 18;
  const max = opts.max ?? 32;
  const defaultBody = opts.defaultBody;
  const models = padModels(baseModels, min, max).map((modelName) => ({
    name: modelName,
    body_type: defaultBody ?? inferBody(modelName),
  }));
  return { name, category, models };
}

const CATALOG = [
  entry('Toyota', 'car', ['Alphard', 'Vellfire', 'Noah', 'Voxy', 'Estima', 'Granvia', 'Camry', 'Corolla', 'RAV4', 'Highlander', '4Runner', 'Tundra', 'Tacoma', 'Prius', 'Crown', 'Land Cruiser', 'Sequoia', 'Supra', 'GR86', 'bZ4X', 'Yaris', 'Venza', 'C-HR', 'Mirai', 'Sienna', 'GR Corolla', 'Hilux', 'Fortuner']),
  entry('Honda', 'car', ['Accord', 'Civic', 'CR-V', 'Pilot', 'HR-V', 'Odyssey', 'Passport', 'Ridgeline', 'Fit', 'Insight', 'Clarity', 'Prologue', 'City', 'Jazz', 'BR-V', 'ZR-V', 'e:Ny1', 'Legend', 'Integra', 'Prelude']),
  entry('Nissan', 'car', ['Altima', 'Sentra', 'Maxima', 'Rogue', 'Murano', 'Pathfinder', 'Armada', 'Kicks', 'Versa', 'Frontier', 'Titan', 'Leaf', 'Ariya', 'Z', 'GT-R', '370Z', 'X-Trail', 'Qashqai', 'Juke', 'Patrol', 'Navara', 'Skyline']),
  entry('Mazda', 'car', ['Mazda3', 'Mazda6', 'CX-5', 'CX-30', 'CX-50', 'CX-9', 'CX-90', 'MX-5 Miata', 'CX-3', 'MX-30', 'BT-50', 'CX-60', 'CX-80', '323', '626', 'RX-7', 'RX-8', 'Tribute', 'MPV', 'Premacy']),
  entry('Subaru', 'car', ['Outback', 'Forester', 'Crosstrek', 'Ascent', 'Impreza', 'Legacy', 'WRX', 'BRZ', 'Solterra', 'Levorg', 'XV', 'Tribeca', 'Baja', 'SVX', 'Justy', 'Sambar', 'Exiga', 'Liberty']),
  entry('Mitsubishi', 'car', ['Outlander', 'Eclipse Cross', 'Mirage', 'Lancer', 'Pajero', 'ASX', 'Triton', 'L200', 'Montero', 'Galant', '3000GT', 'i-MiEV', 'RVR', 'Delica', 'Xpander', 'Attrage', 'Colt', 'Sigma']),
  entry('Suzuki', 'car', ['Swift', 'Vitara', 'Jimny', 'S-Cross', 'Baleno', 'Ignis', 'Celerio', 'Alto', 'SX4', 'Grand Vitara', 'Kizashi', 'Ertiga', 'XL7', 'Carry', 'Across', 'Swace', 'Fronx', 'Brezza']),
  entry('Lexus', 'car', ['ES', 'IS', 'LS', 'GS', 'RC', 'LC', 'UX', 'NX', 'RX', 'GX', 'LX', 'TX', 'RZ', 'CT', 'HS', 'LFA', 'SC', 'LM', 'LBX']),
  entry('Infiniti', 'car', ['Q50', 'Q60', 'Q70', 'QX50', 'QX55', 'QX60', 'QX80', 'G35', 'G37', 'FX35', 'FX50', 'M35', 'M37', 'EX35', 'JX35', 'I30', 'I35', 'Q45']),
  entry('Acura', 'car', ['Integra', 'TLX', 'MDX', 'RDX', 'ZDX', 'ILX', 'RLX', 'NSX', 'TSX', 'TL', 'RSX', 'Legend', 'CL', 'SLX', 'Vigor', 'RL', 'CSX', 'EL']),
  entry('BMW', 'car', ['3 Series', '5 Series', '7 Series', '2 Series', '4 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'XM', 'Z4', 'i4', 'i5', 'i7', 'iX', 'M2', 'M3', 'M4', 'M5', 'M8']),
  entry('Mercedes-Benz', 'car', ['C-Class', 'E-Class', 'S-Class', 'A-Class', 'CLA', 'CLS', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'G-Class', 'SL', 'SLC', 'AMG GT', 'EQE', 'EQS', 'EQB', 'EQA', 'Maybach S-Class', 'CLE', 'GLC Coupe', 'GLE Coupe']),
  entry('Audi', 'car', ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'e-tron', 'e-tron GT', 'TT', 'R8', 'RS3', 'RS5', 'RS6', 'RS7', 'S3', 'S4', 'S5', 'S6', 'S8', 'Q8 e-tron']),
  entry('Volkswagen', 'car', ['Golf', 'Jetta', 'Passat', 'Arteon', 'Tiguan', 'Atlas', 'Taos', 'ID.4', 'ID.7', 'ID. Buzz', 'Polo', 'T-Roc', 'T-Cross', 'Touran', 'Scirocco', 'Beetle', 'CC', 'Phaeton', 'Amarok', 'Teramont']),
  entry('Porsche', 'car', ['911', '718 Boxster', '718 Cayman', 'Panamera', 'Macan', 'Cayenne', 'Taycan', 'Carrera', 'Turbo S', 'GT3', 'GT4', 'Cayman', 'Boxster', 'Macan Electric', 'Cayenne Coupe', 'Panamera Sport Turismo']),
  entry('Opel', 'car', ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Crossland', 'Grandland', 'Combo', 'Zafira', 'Adam', 'Karl', 'Ampera', 'Ampera-e', 'Vectra', 'Omega', 'Meriva', 'Agila', 'Tigra', 'Speedster']),
  entry('Ford', 'car', ['Mustang', 'Fusion', 'Focus', 'Fiesta', 'Taurus', 'Explorer', 'Expedition', 'Edge', 'Escape', 'Bronco', 'Bronco Sport', 'Ranger', 'F-150', 'F-150 Lightning', 'Maverick', 'EcoSport', 'Flex', 'GT', 'Mach-E', 'Puma', 'Kuga', 'Mondeo', 'Galaxy']),
  entry('Chevrolet', 'car', ['Malibu', 'Impala', 'Camaro', 'Corvette', 'Equinox', 'Traverse', 'Tahoe', 'Suburban', 'Blazer', 'Trax', 'Trailblazer', 'Colorado', 'Silverado', 'Bolt EV', 'Bolt EUV', 'Spark', 'Cruze', 'Sonic', 'Volt', 'Aveo', 'Captiva', 'Orlando']),
  entry('GMC', 'car', ['Sierra', 'Canyon', 'Yukon', 'Yukon XL', 'Acadia', 'Terrain', 'Envoy', 'Savana', 'Hummer EV', 'Hummer EV SUV', 'Typhoon', 'Jimmy', 'Sonoma', 'Safari', 'Denali', 'Sierra EV']),
  entry('Cadillac', 'car', ['CT4', 'CT5', 'CT6', 'XT4', 'XT5', 'XT6', 'Escalade', 'Lyriq', 'Celestiq', 'ATS', 'CTS', 'XTS', 'SRX', 'DTS', 'DeVille', 'Seville', 'Eldorado', 'Fleetwood']),
  entry('Lincoln', 'car', ['Navigator', 'Aviator', 'Nautilus', 'Corsair', 'Continental', 'MKZ', 'MKX', 'MKT', 'Town Car', 'Mark LT', 'LS', 'Zephyr', 'Blackwood', 'Corsair Grand Touring']),
  entry('Chrysler', 'car', ['300', 'Pacifica', 'Voyager', '200', 'Sebring', 'PT Cruiser', 'Aspen', 'Crossfire', 'Concorde', 'LHS', 'Town and Country', 'Cirrus', 'Neon', 'LeBaron']),
  entry('Dodge', 'car', ['Charger', 'Challenger', 'Durango', 'Hornet', 'Journey', 'Grand Caravan', 'Dart', 'Avenger', 'Caliber', 'Nitro', 'Magnum', 'Viper', 'Stealth', 'Intrepid', 'Neon', 'Ramcharger']),
  entry('Jeep', 'car', ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator', 'Wagoneer', 'Grand Wagoneer', 'Commander', 'Liberty', 'Patriot', 'Commando', 'CJ-7', 'CJ-5', 'Avenger', 'Recon']),
  entry('Ram', 'car', ['1500', '2500', '3500', 'ProMaster City', 'ProMaster', 'Dakota', 'C/V Tradesman', 'Chassis Cab', 'TRX', 'Rebel', 'Laramie', 'Big Horn', 'Limited', 'Longhorn']),
  entry('Tesla', 'car', ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck', 'Roadster', 'Semi', 'Model 3 Highland', 'Model Y Juniper'], { min: 15, max: 24 }),
  entry('Rivian', 'car', ['R1T', 'R1S', 'R2', 'R3', 'R3X', 'EDV 700', 'EDV 500', 'Amazon Delivery Van'], { min: 15, max: 22 }),
  entry('Lucid', 'car', ['Air Pure', 'Air Touring', 'Air Grand Touring', 'Air Sapphire', 'Air Dream Edition', 'Gravity', 'Air Midnight Dream', 'Air Stealth', 'Air GT'], { min: 15, max: 22 }),
  entry('Volvo', 'car', ['S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90', 'C40', 'EX30', 'EX90', '850', '240', '740', '940', 'S40', 'V40', 'C30', 'XC70', 'S80']),
  entry('Polestar', 'car', ['Polestar 1', 'Polestar 2', 'Polestar 3', 'Polestar 4', 'Polestar 5', 'Polestar 6', 'Polestar BST', 'Polestar 2 Long Range', 'Polestar 3 Performance'], { min: 15, max: 22 }),
  entry('Peugeot', 'car', ['208', '308', '408', '508', '2008', '3008', '5008', 'Rifter', 'Traveller', 'Partner', 'e-208', 'e-2008', 'e-308', 'RCZ', '206', '207', '307', '407', '607', '106']),
  entry('Citroen', 'car', ['C3', 'C4', 'C5 Aircross', 'C5 X', 'Berlingo', 'SpaceTourer', 'Ami', 'e-C4', 'DS3', 'C1', 'C2', 'C-Elysee', 'Xsara', 'Xantia', 'C6', 'C8', 'Saxo', 'Nemo']),
  entry('Renault', 'car', ['Clio', 'Megane', 'Captur', 'Arkana', 'Kadjar', 'Koleos', 'Scenic', 'Espace', 'Talisman', 'Zoe', 'Twingo', 'Fluence', 'Laguna', 'Symbol', 'Duster', 'Sandero', 'Logan', 'Kangoo', 'Austral']),
  entry('Dacia', 'car', ['Sandero', 'Logan', 'Duster', 'Jogger', 'Spring', 'Lodgy', 'Dokker', '1300', '1310', 'Pick-Up', 'Bigster', 'Manifesto', 'Solenza', 'Nova']),
  entry('Fiat', 'car', ['500', '500X', '500L', 'Panda', 'Tipo', 'Punto', 'Bravo', 'Linea', 'Uno', 'Palio', 'Siena', 'Mobi', 'Argo', 'Cronos', 'Fastback', 'Pulse', 'Strada', 'Doblo', 'Freemont']),
  entry('Alfa Romeo', 'car', ['Giulia', 'Stelvio', 'Tonale', 'Giulietta', 'MiTo', '4C', 'Spider', 'GTV', 'Brera', '159', '156', '147', '166', 'GT', '8C Competizione', '33', '75', '90']),
  entry('Maserati', 'car', ['Ghibli', 'Quattroporte', 'Levante', 'Grecale', 'GranTurismo', 'GranCabrio', 'MC20', 'Coupe', 'Spyder', '3200 GT', 'Biturbo', 'Shamal', 'Karif', 'Bora', 'Merak']),
  entry('Ferrari', 'car', ['Roma', 'Portofino', '296 GTB', '296 GTS', 'SF90 Stradale', 'SF90 Spider', '812 Superfast', '812 GTS', 'F8 Tributo', 'F8 Spider', '488 GTB', '488 Pista', 'LaFerrari', 'California', '458 Italia', 'Enzo', 'F12', 'GTC4Lusso']),
  entry('Lamborghini', 'car', ['Urus', 'Huracan', 'Revuelto', 'Aventador', 'Gallardo', 'Murcielago', 'Diablo', 'Countach', 'Miura', 'Espada', 'Jalpa', 'Centenario', 'Sian', 'Temerario', 'Sterrato', 'Huracan STO', 'Huracan Tecnica']),
  entry('Bentley', 'car', ['Continental GT', 'Continental GTC', 'Flying Spur', 'Bentayga', 'Mulsanne', 'Azure', 'Brooklands', 'Arnage', 'Turbo R', 'Eight', 'Continental R', 'Speed Six', 'Batur', 'Bacalar']),
  entry('Rolls-Royce', 'car', ['Phantom', 'Ghost', 'Wraith', 'Dawn', 'Cullinan', 'Spectre', 'Silver Shadow', 'Silver Spirit', 'Corniche', 'Park Ward', 'Silver Seraph', 'Camargue', 'Silver Cloud', 'Boat Tail']),
  entry('Aston Martin', 'car', ['DB11', 'DB12', 'Vantage', 'DBS', 'DBX', 'Valhalla', 'Valkyrie', 'Vanquish', 'Rapide', 'Virage', 'DB9', 'DB7', 'One-77', 'Cygnet', 'Lagonda', 'Victor']),
  entry('Jaguar', 'car', ['XE', 'XF', 'XJ', 'F-Pace', 'E-Pace', 'I-Pace', 'F-Type', 'XK', 'S-Type', 'X-Type', 'XKR', 'XFR', 'Mark 2', 'E-Type', 'XJS', 'XJ220', 'C-X75']),
  entry('Land Rover', 'car', ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque', 'Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Series III', 'LR2', 'LR3', 'LR4', 'Classic', '130', '110', '90']),
  entry('Mini', 'car', ['Cooper', 'Cooper S', 'Countryman', 'Clubman', 'Paceman', 'Convertible', 'Coupe', 'Roadster', 'John Cooper Works', 'Electric', 'Aceman', 'Cooper SE', 'One', 'Hatch', 'Hardtop']),
  entry('Hyundai', 'car', ['Elantra', 'Sonata', 'Accent', 'Azera', 'Tucson', 'Santa Fe', 'Palisade', 'Kona', 'Venue', 'Ioniq 5', 'Ioniq 6', 'Ioniq', 'Veloster', 'Genesis Coupe', 'Nexo', 'Staria', 'Bayon', 'Creta', 'i10', 'i20', 'i30']),
  entry('Kia', 'car', ['Forte', 'K5', 'Stinger', 'Soul', 'Seltos', 'Sportage', 'Sorento', 'Telluride', 'Carnival', 'Niro', 'EV6', 'EV9', 'Rio', 'Optima', 'Cadenza', 'K900', 'Mohave', 'Picanto', 'Cerato', 'Proceed']),
  entry('Genesis', 'car', ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80', 'Electrified G80', 'Electrified GV70', 'X Concept', 'Essentia', 'Mint', 'Neolun', 'Coupe Concept']),
  entry('SsangYong', 'car', ['Torres', 'Korando', 'Rexton', 'Tivoli', 'Musso', 'Rodius', 'Kyron', 'Actyon', 'Chairman', 'Stavic', 'XLV', 'Korando e-Motion', 'Torres EVX']),
  entry('Skoda', 'car', ['Octavia', 'Superb', 'Fabia', 'Scala', 'Kamiq', 'Karoq', 'Kodiaq', 'Enyaq', 'Rapid', 'Yeti', 'Roomster', 'Citigo', 'Felicia', 'Favorit', 'Kushaq', 'Slavia', 'Monte Carlo']),
  entry('SEAT', 'car', ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco', 'Alhambra', 'Toledo', 'Cordoba', 'Altea', 'Mii', 'Exeo', 'Marbella', 'Malaga', 'Ronda']),
  entry('Cupra', 'car', ['Formentor', 'Leon', 'Born', 'Ateca', 'Tavascan', 'Terramar', 'Urban Rebel', 'Raval', 'Ibiza', 'DarkRebel', 'TCR', 'e-Racer', 'Formentor VZ5']),
  entry('BYD', 'car', ['Han', 'Tang', 'Song', 'Song Plus', 'Yuan', 'Yuan Plus', 'Seal', 'Dolphin', 'Atto 3', 'Seagull', 'Qin', 'Destroyer 05', 'Frigate 07', 'Shark', 'Yangwang U8', 'Yangwang U9']),
  entry('NIO', 'car', ['ET5', 'ET5 Touring', 'ET7', 'EL6', 'EL7', 'EL8', 'EC6', 'EC7', 'EP9', 'ES6', 'ES7', 'ES8', 'ET9', 'Firefly', 'Onvo L60', 'Onvo L90']),
  entry('MG', 'car', ['MG4', 'MG5', 'MG6', 'ZS', 'HS', 'Marvel R', 'Cyberster', 'TF', 'F', 'ZR', 'ZT', '3', 'Gloster', 'Hector', 'Astor', 'Comet', 'MGB', 'Midget']),
  entry('Geely', 'car', ['Emgrand', 'Coolray', 'Azkarra', 'Okavango', 'Geometry C', 'Geometry A', 'Monjaro', 'Tugella', 'Preface', 'Boyue', 'Xingyue', 'Icon', 'Panda Mini EV', 'Galaxy E8', 'Galaxy L7']),
  entry('Chery', 'car', ['Tiggo 2', 'Tiggo 3', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Arrizo 5', 'Arrizo 6', 'Arrizo 8', 'QQ', 'Fulwin', 'Omoda 5', 'Jaecoo 7', 'Exeed TX', 'Exeed VX', 'eQ1', 'eQ7']),
  entry('Haval', 'car', ['H6', 'H9', 'Jolion', 'Dargo', 'F7', 'F7x', 'H2', 'H4', 'Big Dog', 'Xiaolong', 'M6', 'H6 GT', 'H6 HEV', 'Tank 300', 'Tank 500']),
  entry('Tata', 'car', ['Nexon', 'Punch', 'Harrier', 'Safari', 'Tiago', 'Tigor', 'Altroz', 'Curvv', 'Sierra', 'Indica', 'Indigo', 'Sumo', 'Aria', 'Bolt', 'Zest', 'Nano', 'Hexa']),
  entry('Mahindra', 'car', ['Scorpio', 'XUV700', 'XUV300', 'Thar', 'Bolero', 'Marazzo', 'KUV100', 'TUV300', 'XUV400', 'BE 6e', 'XEV 9e', 'Scorpio N', 'Commander', 'Armada', 'Quanto', 'Verito']),
  entry('Smart', 'car', ['Fortwo', 'Forfour', '#1', '#3', '#5', 'EQ Fortwo', 'EQ Forfour', 'Roadster', 'Crossblade', 'Brabus Fortwo', 'Pulse', 'Passion', 'Prime', 'Pure']),
  entry('Mercedes-Benz Vans', 'minivan', ['V-Class', 'V-Class Marco Polo', 'Vito', 'Vito Tourer', 'EQV', 'Metris', 'Sprinter Passenger', 'eVito', 'Viano', 'V-Class Exclusive', 'V-Class Avantgarde', 'Vito Mixto', 'V-Class Long', 'V-Class Extra Long'], { defaultBody: 'van', min: 20, max: 35 }),
  entry('Volkswagen Van', 'minivan', ['Multivan', 'Caravelle', 'Transporter Kombi', 'ID. Buzz', 'Sharan', 'Touran', 'Caddy Maxi Life', 'California', 'Multivan Style', 'Caravelle Executive', 'Transporter Shuttle', 'Caddy Kombi', 'Multivan eHybrid', 'Grand California'], { defaultBody: 'van', min: 20, max: 35 }),
  entry('Ford Tourneo', 'minivan', ['Tourneo Custom', 'Tourneo Connect', 'Tourneo Courier', 'Transit Connect Wagon', 'Galaxy', 'S-Max', 'Grand C-Max', 'Freestyle', 'Windstar', 'Aerostar', 'Transit Custom Kombi', 'Tourneo Active', 'E-Tourneo Custom'], { defaultBody: 'van', min: 20, max: 35 }),
  entry('Renault Passenger', 'minivan', ['Trafic Passenger', 'Trafic SpaceClass', 'Espace', 'Grand Espace', 'Scenic', 'Grand Scenic', 'Kangoo', 'Kangoo E-Tech', 'Trafic Combi', 'Master Passenger', 'Arkana Space', 'Rafale'], { defaultBody: 'van', min: 18, max: 32 }),
  entry('Nissan Passenger Van', 'minivan', ['Serena', 'NV350 Caravan', 'Elgrand', 'Quest', 'NV200', 'NV300 Combi', 'Primastar Passenger', 'Townstar', 'e-NV200', 'Serena e-Power', 'Lafesta', 'Presage'], { defaultBody: 'van', min: 18, max: 32 }),
  entry('Peugeot Traveller', 'minivan', ['Traveller', 'Rifter', 'Partner Tepee', 'Expert Tepee', '5008', '807', '806', 'Expert Combi', 'Traveller Business', 'e-Traveller', 'Rifter Long', 'Partner Combi'], { defaultBody: 'van', min: 18, max: 32 }),
  entry('Citroen SpaceTourer', 'minivan', ['SpaceTourer', 'Berlingo Multispace', 'Jumpy SpaceTourer', 'C4 SpaceTourer', 'C8', 'Xsara Picasso', 'C3 Picasso', 'Dispatch Combi', 'e-SpaceTourer', 'Berlingo XL', 'Spacetourer Business'], { defaultBody: 'van', min: 18, max: 32 }),
  entry('Opel Zafira Life', 'minivan', ['Zafira Life', 'Combo Life', 'Vivaro Life', 'Meriva', 'Sintra', 'Zafira', 'Zafira Tourer', 'Combo Tour', 'Vivaro Combi', 'Mokka-e MPV', 'Frontera MPV'], { defaultBody: 'van', min: 18, max: 32 }),
  entry('Fiat Ulysse', 'minivan', ['Doblo MPV', 'Ulysse', 'Multipla', 'Scudo Panorama', 'Talento Panorama', '500L Living', 'Doblo Combi', 'Doblo XL', 'e-Doblo', 'Scudo Combi', 'Ulysse Hybrid'], { defaultBody: 'van', min: 18, max: 32 }),
  entry('Toyota HiAce', 'minivan', ['HiAce Commuter', 'HiAce GL', 'HiAce Super GL', 'HiAce Regius', 'HiAce Grandia', 'HiAce LWB', 'HiAce SLWB', 'HiAce Crew Van', 'HiAce Ambulance', 'HiAce Wheelchair', 'Quantum', 'Ventury', "Ses'fikile", 'HiAce Siyaya'], { defaultBody: 'van', min: 20, max: 35 }),
  entry('Mercedes-Benz Sprinter', 'minibus', ['Sprinter 311', 'Sprinter 314', 'Sprinter 316', 'Sprinter 319', 'Sprinter 324', 'Sprinter Crew', 'Sprinter Shuttle', 'Sprinter Minibus', 'Sprinter City', 'eSprinter', 'Sprinter Transfer', 'Sprinter Mobility', 'Sprinter 417', 'Sprinter 519', 'Sprinter L2H2', 'Sprinter L3H2', 'Sprinter L4H3'], { defaultBody: 'minibus', min: 20, max: 38 }),
  entry('Ford Transit', 'minibus', ['Transit 350', 'Transit 410', 'Transit Minibus', 'Transit Shuttle', 'Transit Crew', 'Transit L3H2', 'Transit L4H3', 'Transit Custom Minibus', 'E-Transit Minibus', 'Transit 460', 'Transit 470', 'Transit Trail', 'Transit Connect Minibus', 'Transit Passenger'], { defaultBody: 'minibus', min: 20, max: 38 }),
  entry('Volkswagen Crafter', 'minibus', ['Crafter Minibus', 'Crafter Kombi', 'Crafter Shuttle', 'Crafter L3H2', 'Crafter L4H3', 'Crafter 35', 'Crafter 50', 'Crafter 55', 'e-Crafter Shuttle', 'Crafter Transfer', 'Crafter Mobility', 'Crafter School', 'Crafter Commuter'], { defaultBody: 'minibus', min: 18, max: 35 }),
  entry('Iveco Daily', 'minibus', ['Daily Minibus', 'Daily Tourys', 'Daily City', 'Daily 35S', 'Daily 50C', 'Daily 70C', 'Daily L2H2', 'Daily L3H2', 'Daily L4H3', 'Daily Electric Minibus', 'Daily Commuter', 'Daily School', 'Daily Wheelchair'], { defaultBody: 'minibus', min: 18, max: 35 }),
  entry('Renault Master', 'minibus', ['Master Minibus', 'Master Combi', 'Master L2H2', 'Master L3H2', 'Master Passenger', 'Master City', 'Master E-Tech Minibus', 'Master Trail', 'Master L4H3', 'Master Shuttle', 'Master School', 'Master Mobility'], { defaultBody: 'minibus', min: 18, max: 35 }),
  entry('Peugeot Boxer', 'minibus', ['Boxer Minibus', 'Boxer Combi', 'Boxer L2H2', 'Boxer L3H2', 'Boxer L4H3', 'Boxer 330', 'Boxer 435', 'Boxer Shuttle', 'Boxer School', 'Boxer Wheelchair', 'e-Boxer Minibus', 'Boxer City'], { defaultBody: 'minibus', min: 18, max: 35 }),
  entry('Fiat Ducato', 'minibus', ['Ducato Minibus', 'Ducato Combi', 'Ducato L2H2', 'Ducato L3H2', 'Ducato L4H3', 'Ducato 33', 'Ducato 35', 'Ducato Shuttle', 'Ducato School', 'Ducato Wheelchair', 'Ducato City', 'Ducato Panorama'], { defaultBody: 'minibus', min: 18, max: 35 }),
  entry('Nissan Interstar', 'minibus', ['Interstar Minibus', 'Interstar Combi', 'NV400 Minibus', 'Civilian', 'Caravan Minibus', 'Interstar L2H2', 'Interstar L3H2', 'Interstar Shuttle', 'Interstar School', 'Interstar Commuter', 'Interstar Wheelchair'], { defaultBody: 'minibus', min: 18, max: 32 }),
  entry('Opel Movano', 'minibus', ['Movano Minibus', 'Movano Combi', 'Movano L2H2', 'Movano L3H2', 'Movano Shuttle', 'Movano School', 'Movano City', 'Movano Wheelchair', 'Movano Commuter', 'Movano L4H3'], { defaultBody: 'minibus', min: 18, max: 32 }),
  entry('MAN TGE', 'minibus', ['TGE Minibus', 'TGE Combi', 'TGE L2H2', 'TGE L3H2', 'TGE Shuttle', 'TGE School', 'TGE City', 'TGE Wheelchair', 'TGE Commuter', 'TGE 3140', 'TGE 3180', 'TGE 3200'], { defaultBody: 'minibus', min: 18, max: 32 }),
  entry('Toyota Commuter', 'minibus', ['HiAce Commuter Bus', 'Coaster', 'Coaster B50', 'Coaster Gold', 'Quantum', "Ses'fikile", 'Ventury 16', 'HiAce 14 Seater', 'HiAce 15 Seater', 'Coaster School', 'Coaster Wheelchair', 'Coaster Long'], { defaultBody: 'minibus', min: 18, max: 32 }),
  entry('LDV', 'minibus', ['Deliver 9 Minibus', 'Deliver 7 Minibus', 'V80 Minibus', 'G10', 'G10 Plus', 'Deliver 9 Shuttle', 'Deliver 9 School', 'Deliver 9 Commuter', 'V80 Commuter', 'Mifa 9', 'Mifa 7'], { defaultBody: 'minibus', min: 18, max: 32 }),
  entry('Mercedes-Benz Coaches', 'bus', ['Tourismo', 'Tourismo R', 'Tourismo M', 'Travego', 'Travego M', 'Travego L', 'Intouro', 'Intouro K', 'Intouro M', 'Setra MultiClass', 'Citaro', 'Citaro G', 'Citaro U', 'eCitaro', 'Conecto', 'Capacito', 'Tourismo E', 'Tourismo K'], { defaultBody: 'coach', min: 20, max: 38 }),
  entry('Volvo Coaches', 'bus', ['9700', '9900', '8900', '7900', 'B11R', 'B8R', 'B13R', '9700 DD', '9900 DD', '9700 B', '7900 Electric', '7900 Hybrid', 'B7R', 'B9R', 'B12M', 'B12B', '8700', '9400']),
  entry('Scania', 'bus', ['Touring', 'Touring HD', 'Interlink', 'Citywide', 'Fencer', 'Marco Polo', 'Irizar i6 Scania', 'K-series', 'N-series', 'F-series', 'H-series', 'L-series', 'OmniExpress', 'OmniLink', 'OmniCity', 'Metrolink']),
  entry('MAN Coaches', 'bus', ['Lion\'s Coach', 'Lion\'s Coach E', 'Lion\'s Intercity', 'Lion\'s City', 'Lion\'s City E', 'Lion\'s Regio', 'Fortuna', 'Lion\'s Coach C', 'Lion\'s Coach L', 'Lion\'s Coach LE', 'Lion\'s Coach DD', 'Neoplan Skyliner', 'Neoplan Tourliner', 'Neoplan Cityliner']),
  entry('Setra', 'bus', ['S 515 HD', 'S 516 HD', 'S 517 HD', 'S 531 DT', 'S 531 DT-2', 'S 417 TC', 'S 431 DT', 'ComfortClass', 'TopClass', 'MultiClass', 'S 415 NF', 'S 416 NF', 'S 515 LE', 'S 516 LE']),
  entry('Neoplan', 'bus', ['Skyliner', 'Tourliner', 'Cityliner', 'Starliner', 'Jetliner', 'Centroliner', 'Metroliner', 'Spaceliner', 'Megaliner', 'Euroliner', 'Transliner', 'Skyliner L', 'Tourliner G', 'Cityliner C']),
  entry('Van Hool', 'bus', ['T9', 'T8', 'A9', 'A330', 'CX45', 'CX35', 'ExquiCity', 'New A330', 'New T9', 'Altano', 'Astromega', 'C2045', 'T915', 'A308', 'ExquiCity 18', 'ExquiCity 24']),
  entry('Irizar', 'bus', ['i6', 'i6S', 'i8', 'i4', 'i3', 'ie', 'ie tram', 'Century', 'InterCentury', 'PB', 'Scania K i6', 'Volvo B i8', 'i6Efficient', 'i8Efficient', 'i4Efficient']),
  entry('Prevost', 'bus', ['H3-45', 'X3-45', 'X3-45 VIP', 'H3-41', 'X3-41', 'X3-41 VIP', 'H3-45 VIP', 'X3-45 Commuter', 'H3-45 Commuter', 'X3-45 Entertainer', 'H3-45 Entertainer', 'Liberty', 'Marathon']),
  entry('MCI', 'bus', ['J4500', 'D4505', 'D4500', 'E4500', 'G4500', 'D4005', 'D4000', 'J3500', 'D3500', 'Commuter Coach', 'Entertainer Coach', 'Luxury Coach', 'Champion']),
  entry('Yutong', 'bus', ['ZK6128', 'ZK6126', 'ZK6119', 'ZK6908', 'ZK6122', 'ZK6120', 'ZK6125', 'ZK6127', 'ZK6137', 'ZK6147', 'T12', 'T15', 'C12', 'C13', 'E12', 'E15', 'U12', 'U13']),
  entry('King Long', 'bus', ['XMQ6127', 'XMQ6129', 'XMQ6125', 'XMQ6101', 'XMQ6905', 'XMQ6120', 'XMQ6119', 'XMQ6122', 'XMQ6130', 'XMQ6140', 'Golden Dragon', 'XML6127', 'XML6129', 'XML6905']),
  entry('BYD Coaches', 'bus', ['K9', 'K8', 'K7', 'K11', 'K12', 'C8', 'C9', 'C10', 'C12', 'B12', 'B13', 'B18', 'B70', 'B80', 'B12A', 'B12B', 'K9UD', 'K9A']),
  entry('Solaris', 'bus', ['Urbino 12', 'Urbino 18', 'Urbino 15', 'Urbino 9', 'Urbino Electric', 'Urbino Hybrid', 'InterUrbino', 'InterUrbino 12', 'InterUrbino 13', 'Vacanza', 'Alpino', 'Trollino', 'MetroStyle', 'i3 Electric']),
  entry('Temsa', 'bus', ['Safari HD', 'Safari MD', 'Safari Commuter', 'Maraton', 'Avenue', 'Prestij', 'LD SB Plus', 'HD 12', 'HD 13', 'MD 9', 'MD 12', 'Safari RD', 'Safari XL']),
  entry('Mercedes-Benz Special', 'special', ['Sprinter Ambulance', 'Vito Ambulance', 'G-Class Armored', 'S-Class Armored', 'Maybach Pullman', 'Sprinter Prisoner Transport', 'Unimog', 'Zetros', 'Actros Special', 'Atego Special', 'Sprinter Refrigerated', 'V-Class VIP', 'Sprinter Limousine']),
  entry('Ford Special', 'special', ['Transit Ambulance', 'Transit Prisoner Transport', 'F-550 Ambulance', 'E-Series Ambulance', 'Transit Limousine', 'Mustang Parade Car', 'Transit Refrigerated', 'Transit Mobile Clinic', 'Bronco First Responder', 'F-650 Chassis Cab']),
  entry('Toyota Special', 'special', ['Land Cruiser Armored', 'HiAce Ambulance', 'Coaster Mobile Clinic', 'Alphard Executive', 'Mirai Police', 'Tundra Fire Truck', 'Proace Ambulance', 'Hilux Emergency', 'Land Cruiser Fire', 'Coaster Wheelchair']),
  entry('Rolls-Royce Special', 'special', ['Phantom Extended', 'Ghost Extended', 'Cullinan Black Badge', 'Phantom Limousine', 'Ghost Armored', 'Phantom Drophead Parade', 'Spectre Chauffeur', 'Wraith Black Badge', 'Dawn Black Badge']),
  entry('BMW Special', 'special', ['7 Series Protection', 'X5 Protection', 'X7 Protection', 'i7 Protection', '5 Series Police', 'M5 Emergency', 'X5 Ambulance', '7 Series Limousine', 'iX M60 Emergency']),
  entry('Cadillac Special', 'special', ['Escalade Stretch', 'Escalade ESV Limousine', 'XTS Limousine', 'Fleetwood Hearse', 'Escalade Armored', 'CT5-V Blackwing Parade', 'Presidential State Car', 'Escalade Mobile Command']),
  entry('Lincoln Special', 'special', ['Navigator L Limousine', 'Continental Coach Door', 'Town Car Limousine', 'Navigator Armored', 'MKT Hearse', 'Navigator Presidential', 'Blackwood Special', 'Aviator Limousine']),
];

function buildSql(catalog) {
  const modelCount = catalog.reduce((n, m) => n + m.models.length, 0);
  const makeValues = catalog.map((m) => `  ('${esc(m.name)}', '${esc(m.category)}')`);
  const valueLines = [];
  for (const make of catalog) {
    for (const model of make.models) {
      const body = model.body_type ? `'${esc(model.body_type)}'` : 'NULL';
      valueLines.push(`  ('${esc(make.name)}', '${esc(model.name)}', ${body})`);
    }
  }
  const out = [];
  out.push('-- Generated by scripts/generate-vehicle-seed.mjs');
  out.push(`-- Makes: ${catalog.length}, Models: ${modelCount}`);
  out.push('BEGIN;');
  out.push('');
  out.push('TRUNCATE TABLE public.vehicle_models RESTART IDENTITY CASCADE;');
  out.push('TRUNCATE TABLE public.vehicle_makes RESTART IDENTITY CASCADE;');
  out.push('');
  out.push('INSERT INTO public.vehicle_makes (name, category)');
  out.push('VALUES');
  out.push(makeValues.join(',\n'));
  out.push('ON CONFLICT (name) DO NOTHING;');
  out.push('');
  out.push('INSERT INTO public.vehicle_models (make_id, name, body_type)');
  out.push('SELECT vm.id, v.model_name, v.body_type');
  out.push('FROM (VALUES');
  out.push(valueLines.join(',\n'));
  out.push(') AS v(make_name, model_name, body_type)');
  out.push('JOIN public.vehicle_makes vm ON vm.name = v.make_name');
  out.push('ON CONFLICT (make_id, name) DO NOTHING;');
  out.push('');
  out.push('COMMIT;');
  out.push('');
  return { sql: out.join('\n'), modelCount, makeCount: catalog.length };
}
const { sql, modelCount, makeCount } = buildSql(CATALOG);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, sql, 'utf8');
console.log(`Wrote ${OUT}`);
console.log(`Makes: ${makeCount}, Models: ${modelCount}`);
