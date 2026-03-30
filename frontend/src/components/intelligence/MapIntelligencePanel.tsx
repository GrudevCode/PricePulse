import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Activity, Clock, Users, RefreshCw, Layers, Navigation, TrendingUp, Footprints, Car, Store, Utensils, Phone, Sparkles, Zap, DollarSign, Star, Wine, Coffee, Music, ChevronLeft, Send, MessageSquare, BarChart2, AlertTriangle, MapPin, Flame, Target, ThumbsDown, Maximize2, Minimize2, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Palette ──────────────────────────────────────────────────────────────────

const P = { primary: '#D25F2A', rose: '#F43F5E', muted: '#9A9189', border: '#E2DDD4', bg: '#FAF9F6' };

// ─── Real OSM road data for Targovishte, Bulgaria ─────────────────────────────
// Coordinates sourced from OpenStreetMap via Overpass API

const CENTER: [number, number] = [43.249, 26.574];
type TrafficLevel = 'heavy' | 'moderate' | 'light';

interface TrafficSegment {
  id: string; name: string;
  coords: [number, number][];
  baseLevel: TrafficLevel;
  isBackground?: boolean; // no colored polyline, just ambient vehicles
}

const BASE_SEGMENTS: TrafficSegment[] = [
  // бул. 29. Јануари — main boulevard, extended NE to outer town
  {
    id: 's1', name: 'бул. 29. Януари', baseLevel: 'heavy',
    coords: [
      [43.2524200, 26.5723800],
      [43.2529200, 26.5727800],
      [43.2532200, 26.5730000],
      [43.2535313, 26.5731976], [43.2536971, 26.5733193], [43.2549850, 26.5743788],
      [43.2556631, 26.5749126], [43.2563307, 26.5754363], [43.2578024, 26.5766033],
      [43.2586344, 26.5772359], [43.2594580, 26.5773621], [43.2596990, 26.5775195],
      [43.2619099, 26.5778835], [43.2624138, 26.5779638], [43.2628733, 26.5780365],
      [43.2634200, 26.5781500],
      [43.2641200, 26.5783000],
      [43.2649200, 26.5784800],
      [43.2657200, 26.5786600],
      [43.2665200, 26.5788400],
      [43.2673200, 26.5790200],
    ],
  },
  // Никола Маринов — N-S arterial, extended far NE
  {
    id: 's2', name: 'Никола Маринов', baseLevel: 'moderate',
    coords: [
      [43.2521800, 26.5733600],
      [43.2526800, 26.5733720],
      [43.2531200, 26.5733840],
      [43.2536253, 26.5733955], [43.2536182, 26.5749532], [43.2536116, 26.5758380],
      [43.2536159, 26.5762935], [43.2536645, 26.5769466], [43.2537635, 26.5776286],
      [43.2539427, 26.5784785], [43.2541303, 26.5793376], [43.2543979, 26.5806262],
      [43.2548440, 26.5828853], [43.2551151, 26.5842378],       [43.2566539, 26.5915653],
      [43.2570748, 26.5929839], [43.2573214, 26.5934701], [43.2578909, 26.5944671],
      [43.2584200, 26.5952800],
      [43.2588800, 26.5960500],
      [43.2593500, 26.5968200],
      [43.2598200, 26.5975800],
      [43.2602800, 26.5983200],
    ],
  },
  // Митрополит Андрей (NW) — from бул. 29. Януари junction to town centre roundabout
  {
    id: 's3', name: 'Митрополит Андрей (NW)', baseLevel: 'moderate',
    coords: [
      [43.2610500, 26.5779200],
      [43.2606500, 26.5778200],
      [43.2602800, 26.5777200],
      [43.2598500, 26.5776000],
      [43.2594240, 26.5774755], [43.2587489, 26.5752987], [43.2583970, 26.5742245],
      [43.2578277, 26.5724885], [43.2574391, 26.5712848], [43.2571527, 26.5704646],
      [43.2566555, 26.5694016], [43.2565937, 26.5692823], [43.2564320, 26.5690024],
      [43.2561614, 26.5686515], [43.2555961, 26.5681030], [43.2553680, 26.5679343],
    ],
  },
  // Митрополит Андрей (E) — long E section through central roundabout
  {
    id: 's4', name: 'Митрополит Андрей (E)', baseLevel: 'light',
    coords: [
      [43.2553680, 26.5679343], [43.2549624, 26.5677007], [43.2542099, 26.5674038],
      [43.2538628, 26.5672668], [43.2525391, 26.5667992], [43.2513325, 26.5663798],
      [43.2503088, 26.5659951], [43.2493034, 26.5657511], [43.2487074, 26.5658435],
      [43.2480822, 26.5659912], [43.2474920, 26.5665433], [43.2466779, 26.5682908],
      [43.2463931, 26.5689978],
      [43.2460500, 26.5695200],
      [43.2456800, 26.5700800],
      [43.2452800, 26.5706800],
      [43.2448800, 26.5712800],
    ],
  },
  // Митрополит Андрей (S) — from central roundabout to train station area
  {
    id: 's5', name: 'Митрополит Андрей (S)', baseLevel: 'light',
    coords: [
      [43.2463931, 26.5689978], [43.2457208, 26.5696486], [43.2445097, 26.5705155],
      [43.2441276, 26.5707716], [43.2428630, 26.5715841], [43.2420724, 26.5719809],
      [43.2414023, 26.5721095], [43.2414237, 26.5722635],
      [43.2408800, 26.5724800],
      [43.2402800, 26.5727200],
      [43.2396200, 26.5729600],
      [43.2389200, 26.5732000],
    ],
  },
  // Скопие — NW diagonal road to town centre (verified OSM, not a roundabout)
  {
    id: 's6', name: 'Скопие', baseLevel: 'moderate',
    coords: [
      [43.2585200, 26.5670200],
      [43.2581600, 26.5673200],
      [43.2578047, 26.5676040], [43.2576807, 26.5679482], [43.2575848, 26.5681209],
      [43.2568959, 26.5689353], [43.2566910, 26.5691711], [43.2565937, 26.5692823],
      [43.2565152, 26.5693760], [43.2561860, 26.5697685], [43.2557008, 26.5703044],
      [43.2553647, 26.5707213], [43.2546909, 26.5715189], [43.2541138, 26.5721760],
      [43.2538264, 26.5725344],
      [43.2535800, 26.5728200],
      [43.2533800, 26.5730200],
    ],
  },
  // Цар Освободител — long arterial from town centre SW to outskirts
  {
    id: 's7', name: 'Цар Освободител', baseLevel: 'moderate',
    coords: [
      [43.2414023, 26.5721095], [43.2408501, 26.5719994], [43.2404639, 26.5716516],
      [43.2396011, 26.5708121], [43.2391410, 26.5703645], [43.2385443, 26.5697992],
      [43.2381729, 26.5694507], [43.2376295, 26.5687935], [43.2371799, 26.5683621],
      [43.2364422, 26.5678240], [43.2359492, 26.5671702], [43.2348544, 26.5660023],
      [43.2343865, 26.5654696], [43.2336739, 26.5646584], [43.2329837, 26.5638726],
      [43.2321955, 26.5629916], [43.2313708, 26.5620754], [43.2307724, 26.5614160],
      [43.2300397, 26.5606139], [43.2295751, 26.5601168], [43.2284537, 26.5590034],
      [43.2276800, 26.5582800],
      [43.2269200, 26.5575800],
      [43.2261200, 26.5568600],
      [43.2252800, 26.5561200],
      [43.2244200, 26.5553600],
      [43.2235200, 26.5545600],
      [43.2226000, 26.5537600],
    ],
  },
  // Трайко Китанчев — SW residential connector
  {
    id: 's8', name: 'Трайко Китанчев', baseLevel: 'light',
    coords: [
      [43.2477153, 26.5614139], [43.2465374, 26.5615883], [43.2459911, 26.5616752],
      [43.2449447, 26.5619432], [43.2443396, 26.5622543], [43.2432311, 26.5627200],
      [43.2397485, 26.5645877], [43.2396864, 26.5647769],
      [43.2394200, 26.5644200],
      [43.2391200, 26.5640200],
      [43.2387800, 26.5635800],
      [43.2384200, 26.5631200],
    ],
  },
  // Отец Паисий — central N-S connector (Shopping Centre to train station)
  {
    id: 's9', name: 'Отец Паисий', baseLevel: 'moderate',
    coords: [
      [43.2452800, 26.5822200],
      [43.2450200, 26.5819200],
      [43.2447415, 26.5816329], [43.2444613, 26.5812645], [43.2434492, 26.5796163],
      [43.2430219, 26.5789102], [43.2429449, 26.5787787], [43.2425788, 26.5781542],
      [43.2424391, 26.5777876], [43.2422816, 26.5769333], [43.2421147, 26.5759153],
      [43.2418601, 26.5743918], [43.2418145, 26.5740199],
      [43.2417200, 26.5736200],
      [43.2415800, 26.5731800],
      [43.2414200, 26.5727200],
    ],
  },
  // Кюстенджа — SE secondary road
  {
    id: 's10', name: 'Кюстенджа', baseLevel: 'light',
    coords: [
      [43.2409800, 26.5865200],
      [43.2412000, 26.5862200],
      [43.2414107, 26.5859208], [43.2422544, 26.5847154], [43.2426989, 26.5841834],
      [43.2432556, 26.5835101], [43.2436343, 26.5830434], [43.2445153, 26.5819691],
      [43.2445894, 26.5818798], [43.2447415, 26.5816329],
    ],
  },
  // Петко Р. Славейков — short connector near town centre
  {
    id: 's11', name: 'Петко Р. Славейков', baseLevel: 'light',
    coords: [
      [43.2419200, 26.5739200],
      [43.2418500, 26.5737600],
      [43.2417613, 26.5735861], [43.2416911, 26.5733372], [43.2415185, 26.5726644],
      [43.2414499, 26.5723972], [43.2414237, 26.5722635],
      [43.2413800, 26.5720500],
      [43.2413200, 26.5717800],
    ],
  },
  // Road 4 — NW regional bypass (ties into ul. Maliovitsa / b56, continues NW out of town)
  {
    id: 's12', name: 'Road 4 (NW)', baseLevel: 'light',
    coords: [
      [43.2559261, 26.5635265], // meets ul. Малиовица (b56) — links to town grid
      [43.2565800, 26.5633400],
      [43.2574200, 26.5630800],
      [43.2585200, 26.5627800],
      [43.2598895, 26.5625408],
      [43.2614602, 26.5634017],
      [43.2622692, 26.5638767],
      [43.2627384, 26.5641465],
      [43.2632732, 26.5645978],
      [43.2636008, 26.5650378],
      [43.2641500, 26.5653200],
      [43.2648200, 26.5656200],
      [43.2655800, 26.5659600],
      [43.2664200, 26.5663400],
      [43.2672800, 26.5667200],
      [43.2681000, 26.5670800],
      [43.2689200, 26.5674400],
      [43.2697200, 26.5678000],
    ],
  },
];

// ─── Residential / background streets — vehicles only, no colored overlay ─────
// Real OSM coords from Overpass API

const BG_STREETS: TrafficSegment[] = [
  { id:'b1',  name:'ул. Стефан Карaджа',      baseLevel:'light', isBackground:true, coords:[[43.2480196,26.5775803],[43.2492035,26.5784670],[43.2501250,26.5793578],[43.2514194,26.5805291],[43.2524187,26.5812579],[43.2533889,26.5819655],[43.2542279,26.5825953],[43.2550500,26.5832000],[43.2558600,26.5837800],[43.2566200,26.5843200]] },
  { id:'b2',  name:'ул. Васил Левски',         baseLevel:'light', isBackground:true, coords:[[43.2510391,26.5729018],[43.2520097,26.5729160],[43.2521924,26.5729092],[43.2527577,26.5729441],[43.2535313,26.5731976]] },
  { id:'b3',  name:'ул. Поп Сава Катрафиков',  baseLevel:'light', isBackground:true, coords:[[43.2432766,26.5628467],[43.2435960,26.5635799],[43.2438813,26.5641963],[43.2441279,26.5647970],[43.2443922,26.5658292],[43.2447295,26.5667927],[43.2451635,26.5675462],[43.2458755,26.5687740],[43.2459993,26.5689759]] },
  { id:'b4',  name:'ул. Опълченска',           baseLevel:'light', isBackground:true, coords:[[43.2482013,26.5642400],[43.2489556,26.5642264],[43.2499892,26.5643606],[43.2509953,26.5646825],[43.2518236,26.5648959]] },
  { id:'b5',  name:'ул. Братя Миладинови',     baseLevel:'light', isBackground:true, coords:[[43.2482538,26.5688357],[43.2482289,26.5692317],[43.2482850,26.5704140],[43.2483710,26.5714553],[43.2484845,26.5728306]] },
  { id:'b6',  name:'ул. Радецки',              baseLevel:'light', isBackground:true, coords:[[43.2520568,26.5666233],[43.2523219,26.5674973],[43.2526031,26.5688921],[43.2528182,26.5702304],[43.2531316,26.5719964],[43.2533680,26.5728923]] },
  { id:'b7',  name:'ул. Трапезица',            baseLevel:'light', isBackground:true, coords:[[43.2429449,26.5787787],[43.2427377,26.5794279],[43.2424622,26.5802912],[43.2418492,26.5822530],[43.2413831,26.5836726]] },
  { id:'b8',  name:'ул. Никола Симов',         baseLevel:'light', isBackground:true, coords:[[43.2438804,26.5654997],[43.2428279,26.5662874],[43.2422559,26.5667072],[43.2412091,26.5674755],[43.2405602,26.5679517]] },
  { id:'b9',  name:'ул. Ген. Скобелев',        baseLevel:'light', isBackground:true, coords:[[43.2498460,26.5691535],[43.2503692,26.5693731],[43.2512607,26.5693718],[43.2521748,26.5692994]] },
  { id:'b10', name:'ул. Гладстон',             baseLevel:'light', isBackground:true, coords:[[43.2504658,26.5694426],[43.2506970,26.5699189],[43.2508871,26.5703107],[43.2511654,26.5708225]] },
  { id:'b11', name:'ул. Епископ Софроний',     baseLevel:'light', isBackground:true, coords:[[43.2510606,26.5794474],[43.2504435,26.5773742],[43.2500606,26.5760921],[43.2497351,26.5749939]] },
  { id:'b12', name:'ул. Велико Търново',       baseLevel:'light', isBackground:true, coords:[[43.2506966,26.5675382],[43.2504762,26.5682213],[43.2503692,26.5693731]] },
  { id:'b13', name:'ул. Копривщица',           baseLevel:'light', isBackground:true, coords:[[43.2459392,26.5627768],[43.2461609,26.5633494],[43.2473313,26.5639377]] },
  { id:'b14', name:'ул. Охрид',               baseLevel:'light', isBackground:true, coords:[[43.2422691,26.5679745],[43.2414292,26.5686330],[43.2409033,26.5689762]] },
  { id:'b15', name:'ул. Полковник Каргалов',   baseLevel:'light', isBackground:true, coords:[[43.2422559,26.5667072],[43.2422691,26.5679745],[43.2427302,26.5686907]] },
  { id:'b16', name:'ул. Мадара',              baseLevel:'light', isBackground:true, coords:[[43.2544941,26.5679310],[43.2548371,26.5686893],[43.2551558,26.5700319],[43.2553647,26.5707213]] },
  { id:'b17', name:'ул. Ивайло',             baseLevel:'light', isBackground:true, coords:[[43.2531199,26.5675305],[43.2534622,26.5680271],[43.2540224,26.5692793],[43.2541898,26.5697115]] },
  { id:'b18', name:'ул. Кракра',             baseLevel:'light', isBackground:true, coords:[[43.2561019,26.5660370],[43.2558409,26.5668720],[43.2555862,26.5676705]] },
  { id:'b19', name:'ул. Руен',               baseLevel:'light', isBackground:true, coords:[[43.2512290,26.5607802],[43.2512599,26.5623170],[43.2512850,26.5628990],[43.2514949,26.5636325],[43.2518236,26.5648959]] },
  { id:'b20', name:'ул. Панайот Волов',       baseLevel:'light', isBackground:true, coords:[[43.2512330,26.5612347],[43.2508488,26.5614638],[43.2506730,26.5620861],[43.2504268,26.5630088],[43.2499892,26.5643606]] },
  { id:'b21', name:'ул. Одрин',              baseLevel:'light', isBackground:true, coords:[[43.2501651,26.5639610],[43.2494266,26.5635157],[43.2485631,26.5629471],[43.2479829,26.5626984]] },
  { id:'b22', name:'ул. Васил Петлешков',    baseLevel:'light', isBackground:true, coords:[[43.2459392,26.5627768],[43.2444984,26.5638091],[43.2436325,26.5644647],[43.2423883,26.5653433],[43.2414671,26.5660198],[43.2402121,26.5668913]] },
  { id:'b23', name:'ул. Осъм',              baseLevel:'light', isBackground:true, coords:[[43.2470187,26.5650693],[43.2459414,26.5641217],[43.2452026,26.5639341],[43.2450509,26.5634178]] },
  { id:'b24', name:'ул. Тутракан',          baseLevel:'light', isBackground:true, coords:[[43.2502610,26.5614557],[43.2498963,26.5627319],[43.2496430,26.5636474]] },
  { id:'b25', name:'ул. Г. С. Раковски',    baseLevel:'light', isBackground:true, coords:[[43.2482013,26.5642400],[43.2473762,26.5644098],[43.2465468,26.5659136],[43.2463442,26.5664060],[43.2452065,26.5676112],[43.2440242,26.5689899],[43.2429848,26.5700093],[43.2419192,26.5710316],[43.2413205,26.5715413]] },
  { id:'b26', name:'ул. Палауза',           baseLevel:'light', isBackground:true, coords:[[43.2443674,26.5752893],[43.2447846,26.5767841],[43.2452600,26.5786213],[43.2457692,26.5804091]] },
  { id:'b27', name:'ул. Антим I',           baseLevel:'light', isBackground:true, coords:[[43.2433011,26.5762534],[43.2439851,26.5776510],[43.2444172,26.5788606],[43.2446275,26.5810603],[43.2444613,26.5812645]] },
  { id:'b28', name:'ул. Царевец',           baseLevel:'light', isBackground:true, coords:[[43.2461082,26.5760842],[43.2450728,26.5754587],[43.2444228,26.5754009]] },
  { id:'b29', name:'ул. Петко Р. Славейков (изток)', baseLevel:'light', isBackground:true, coords:[[43.2423698,26.5740621],[43.2437529,26.5741363],[43.2452475,26.5739737],[43.2459872,26.5734856]] },
  { id:'b30', name:'ул. Шейново',           baseLevel:'light', isBackground:true, coords:[[43.2403553,26.5781701],[43.2415423,26.5779382],[43.2421121,26.5778347],[43.2424391,26.5777876]] },
  { id:'b31', name:'ул. Боровец',           baseLevel:'light', isBackground:true, coords:[[43.2388166,26.5786542],[43.2393957,26.5798377],[43.2407353,26.5823638],[43.2413039,26.5834447]] },
  { id:'b32', name:'ул. Богомил',           baseLevel:'light', isBackground:true, coords:[[43.2390962,26.5757898],[43.2397874,26.5773524],[43.2402068,26.5783004]] },
  { id:'b33', name:'ул. Стефан Куцаров',    baseLevel:'light', isBackground:true, coords:[[43.2381403,26.5735407],[43.2384824,26.5734294],[43.2396764,26.5729659]] },
  { id:'b34', name:'ул. Стара Планина',     baseLevel:'light', isBackground:true, coords:[[43.2384224,26.5742381],[43.2389670,26.5740221],[43.2396545,26.5742299],[43.2401702,26.5743133]] },
  { id:'b35', name:'ул. Троян',             baseLevel:'light', isBackground:true, coords:[[43.2406597,26.5725506],[43.2406591,26.5732664],[43.2406457,26.5745021]] },
  { id:'b36', name:'ул. Ген. Янков',        baseLevel:'light', isBackground:true, coords:[[43.2407353,26.5823638],[43.2414466,26.5811059],[43.2418549,26.5798774]] },
  { id:'b37', name:'ул. Брегалница',        baseLevel:'light', isBackground:true, coords:[[43.2422674,26.5809060],[43.2428672,26.5818416],[43.2434883,26.5828105]] },
  { id:'b38', name:'ул. Камчия',            baseLevel:'light', isBackground:true, coords:[[43.2445590,26.5792659],[43.2449967,26.5796950],[43.2451945,26.5802246],[43.2455038,26.5807491]] },
  { id:'b39', name:'ул. Първи май',         baseLevel:'light', isBackground:true, coords:[[43.2422816,26.5769333],[43.2428696,26.5766571],[43.2433011,26.5762534],[43.2443674,26.5752893]] },
  { id:'b40', name:'ул. Ген. Столетов',     baseLevel:'light', isBackground:true, coords:[[43.2423878,26.5758020],[43.2429048,26.5755422],[43.2441398,26.5748749]] },
  { id:'b41', name:'ул. Хан Крум',          baseLevel:'light', isBackground:true, coords:[[43.2403563,26.5758193],[43.2413547,26.5758380],[43.2417045,26.5760284]] },
  { id:'b42', name:'ул. Граф Игнатиев',     baseLevel:'light', isBackground:true, coords:[[43.2404004,26.5747047],[43.2403136,26.5767862],[43.2402483,26.5782640]] },
  { id:'b43', name:'ул. Панагюрище',        baseLevel:'light', isBackground:true, coords:[[43.2515355,26.5742420],[43.2502921,26.5759259],[43.2501670,26.5763831],[43.2489067,26.5781797]] },
  { id:'b44', name:'ул. Христо Ботев',      baseLevel:'light', isBackground:true, coords:[[43.2446393,26.5708129],[43.2453788,26.5710064],[43.2464376,26.5713008],[43.2475560,26.5714948],[43.2491512,26.5714073],[43.2506104,26.5713913]] },
  { id:'b45', name:'ул. Колотница',         baseLevel:'light', isBackground:true, coords:[[43.2484996,26.5733724],[43.2492932,26.5740227],[43.2495218,26.5741122]] },
  { id:'b46', name:'ул. Аксаков',           baseLevel:'light', isBackground:true, coords:[[43.2434492,26.5796163],[43.2442228,26.5789085],[43.2452600,26.5786213],[43.2461559,26.5784280]] },
  { id:'b47', name:'ул. Бяло море',         baseLevel:'light', isBackground:true, coords:[[43.2528034,26.5699859],[43.2534012,26.5709611],[43.2541138,26.5721760]] },
  { id:'b48', name:'ул. Спиридон Грамадов', baseLevel:'light', isBackground:true, coords:[[43.2439171,26.5699558],[43.2440242,26.5689899],[43.2438937,26.5681301],[43.2437812,26.5668534],[43.2438804,26.5654997],[43.2437002,26.5644160]] },
  { id:'b49', name:'ул. Любен Каравелов',   baseLevel:'light', isBackground:true, coords:[[43.2434637,26.5682874],[43.2438937,26.5681301],[43.2447295,26.5667927],[43.2453188,26.5655106],[43.2462343,26.5634661]] },
  { id:'b50', name:'ул. Екзарх Йосиф',      baseLevel:'light', isBackground:true, coords:[[43.2427847,26.5663191],[43.2428998,26.5668767],[43.2429197,26.5674971],[43.2429587,26.5686638]] },
  { id:'b51', name:'ул. Цар Симеон',        baseLevel:'light', isBackground:true, coords:[[43.2553680,26.5679343],[43.2540607,26.5679269],[43.2534622,26.5680271],[43.2526031,26.5688921],[43.2521748,26.5692994],[43.2515311,26.5704399],[43.2511654,26.5708225]] },
  { id:'b52', name:'ул. Тодор Каблешков',   baseLevel:'light', isBackground:true, coords:[[43.2444123,26.5647470],[43.2448523,26.5650868],[43.2453188,26.5655106],[43.2463442,26.5664060],[43.2469924,26.5666839]] },
  { id:'b53', name:'ул. Радиомъгла',        baseLevel:'light', isBackground:true, coords:[[43.2527946,26.5651519],[43.2528298,26.5641997],[43.2526989,26.5631724],[43.2525817,26.5626628],[43.2523590,26.5617857]] },
  { id:'b54', name:'ул. Георги Бенковски',  baseLevel:'light', isBackground:true, coords:[[43.2448598,26.5729057],[43.2434356,26.5732263],[43.2427926,26.5733456],[43.2419768,26.5734970]] },
  { id:'b55', name:'ул. Хан Кубрат',        baseLevel:'light', isBackground:true, coords:[[43.2428630,26.5715841],[43.2431511,26.5724104],[43.2434356,26.5732263],[43.2437529,26.5741363]] },
  { id:'b56', name:'ул. Малиовица',         baseLevel:'light', isBackground:true, coords:[[43.2525817,26.5626628],[43.2538143,26.5629846],[43.2554436,26.5634004],[43.2559261,26.5635265]] },
  { id:'b57', name:'ул. Дамян Груев',       baseLevel:'light', isBackground:true, coords:[[43.2482289,26.5692317],[43.2474363,26.5691267],[43.2463931,26.5689978]] },
  { id:'b58', name:'бул. Сюрен',            baseLevel:'light', isBackground:true, coords:[[43.2357200,26.5554200],[43.2361800,26.5551200],[43.2366200,26.5548200],[43.2374489,26.5545454],[43.2385226,26.5539831],[43.2399330,26.5549595],[43.2411097,26.5574146],[43.2419671,26.5593342],[43.2426784,26.5612381],[43.2432311,26.5627200]] },
  { id:'b59', name:'ул. Цар Самуил',        baseLevel:'light', isBackground:true, coords:[[43.2557717,26.5649748],[43.2547989,26.5647281],[43.2542910,26.5645913],[43.2528298,26.5641997]] },
  { id:'b60', name:'ул. Черно море',        baseLevel:'light', isBackground:true, coords:[[43.2452026,26.5639341],[43.2450416,26.5644640],[43.2448523,26.5650868]] },
  { id:'b61', name:'ул. Сливница',          baseLevel:'light', isBackground:true, coords:[[43.2458755,26.5687740],[43.2460823,26.5675820],[43.2463442,26.5664060]] },
  { id:'b62', name:'ул. Осогово',           baseLevel:'light', isBackground:true, coords:[[43.2528182,26.5702304],[43.2524113,26.5708761],[43.2525234,26.5715110],[43.2527577,26.5729441]] },
  { id:'b63', name:'ул. Ком',              baseLevel:'light', isBackground:true, coords:[[43.2529179,26.5605882],[43.2527360,26.5609757],[43.2525426,26.5613995],[43.2523590,26.5617857]] },
  { id:'b64',  name:'ул. Маричa',              baseLevel:'light', isBackground:true, coords:[[43.2498730,26.5610158],[43.2497217,26.5614972],[43.2491882,26.5633655],[43.2489556,26.5642264]] },

  // ── Second OSM pass — filling the remaining gaps ───────────────────────────
  // Named streets
  { id:'b65',  name:'ул. Бузлуджа',            baseLevel:'light', isBackground:true, coords:[[43.2466779,26.5682908],[43.2482777,26.5681569]] },
  { id:'b66',  name:'ул. Арда',                baseLevel:'light', isBackground:true, coords:[[43.2498682,26.5706736],[43.2503692,26.5693731]] },
  { id:'b67',  name:'ул. Силистра',            baseLevel:'light', isBackground:true, coords:[[43.2475717,26.5669285],[43.2480037,26.5672047],[43.2482935,26.5673900]] },
  { id:'b68',  name:'ул. Куманово',            baseLevel:'light', isBackground:true, coords:[[43.2422124,26.5648900],[43.2423883,26.5653433],[43.2427847,26.5663191]] },
  { id:'b69',  name:'ул. Патриарх Евтимий',    baseLevel:'light', isBackground:true, coords:[[43.2566117,26.5663455],[43.2564594,26.5668202],[43.2561292,26.5679038]] },
  { id:'b70',  name:'ул. Тимок',               baseLevel:'light', isBackground:true, coords:[[43.2534512,26.5653059],[43.2534979,26.5660772],[43.2535467,26.5667505]] },
  { id:'b71',  name:'ул. Панега',              baseLevel:'light', isBackground:true, coords:[[43.2504268,26.5630088],[43.2512850,26.5628990]] },
  { id:'b72',  name:'ул. Пейо К. Яворов',     baseLevel:'light', isBackground:true, coords:[[43.2485631,26.5629471],[43.2489616,26.5619064],[43.2492896,26.5611085]] },
  { id:'b73',  name:'ул. Поп Сава (изток)',    baseLevel:'light', isBackground:true, coords:[[43.2439797,26.5668283],[43.2445502,26.5667881],[43.2447295,26.5667927]] },

  // Long east-west residential spine through city centre (parallel to Митрополит Андрей)
  { id:'b74',  name:'ул. Митрополит Андрей (рез.)', baseLevel:'light', isBackground:true,
    coords:[[43.2499697,26.5654952],[43.2506730,26.5657366],[43.2510032,26.5658573],[43.2514290,26.5660209],[43.2515463,26.5660263],[43.2517436,26.5660075],[43.2522456,26.5662301],[43.2524918,26.5663830],[43.2530036,26.5665654],[43.2535467,26.5667505],[43.2541816,26.5670053],[43.2544629,26.5670938],[43.2548380,26.5672413],[43.2551544,26.5673915],[43.2555862,26.5676705]] },

  // Long NW residential/service loop
  { id:'b75',  name:'ул. (NW сектор)',         baseLevel:'light', isBackground:true,
    coords:[[43.2589168,26.5597647],[43.2589773,26.5603279],[43.2591219,26.5612587],[43.2592176,26.5621250],[43.2591980,26.5623825],[43.2584304,26.5621062],[43.2578710,26.5635919],[43.2580516,26.5646720],[43.2580898,26.5655782],[43.2581274,26.5663925],[43.2582111,26.5675427]] },

  // North sector residential (43.263→43.259)
  { id:'b76',  name:'ул. (N сектор)',          baseLevel:'light', isBackground:true,
    coords:[[43.2630098,26.5778952],[43.2621474,26.5751853],[43.2615471,26.5733135],[43.2608914,26.5713076],[43.2596812,26.5675240]] },

  // South sector residential
  { id:'b77',  name:'ул. (S сектор)',          baseLevel:'light', isBackground:true,
    coords:[[43.2354811,26.5714531],[43.2361797,26.5714094],[43.2370099,26.5720902],[43.2376871,26.5727407],[43.2378822,26.5732066],[43.2381403,26.5735407]] },

  // SW residential block — cross streets and spine
  { id:'b79',  name:'ул. (SW напречна 1)',     baseLevel:'light', isBackground:true,
    coords:[[43.2396968,26.5550067],[43.2393813,26.5552227],[43.2390639,26.5554441],[43.2381705,26.5562174],[43.2378556,26.5564869]] },
  { id:'b80',  name:'ул. (SW гръбнак)',        baseLevel:'light', isBackground:true,
    coords:[[43.2390001,26.5618176],[43.2389451,26.5616047],[43.2387762,26.5612527],[43.2384446,26.5605765],[43.2382743,26.5602295],[43.2379675,26.5595664],[43.2380332,26.5586082],[43.2381270,26.5577706],[43.2378556,26.5564869],[43.2376624,26.5555443],[43.2375443,26.5549490],[43.2374489,26.5545454]] },
  { id:'b81',  name:'ул. (SW напречна 2)',     baseLevel:'light', isBackground:true,
    coords:[[43.2402939,26.5611442],[43.2400128,26.5605700],[43.2395207,26.5595349],[43.2390394,26.5584984],[43.2387349,26.5578422],[43.2385639,26.5574563]] },
  { id:'b82',  name:'ул. (SW напречна 3)',     baseLevel:'light', isBackground:true,
    coords:[[43.2381270,26.5577706],[43.2385639,26.5574563],[43.2389469,26.5571271],[43.2395274,26.5566386],[43.2398535,26.5563504],[43.2403697,26.5559082],[43.2404371,26.5557212]] },
  { id:'b83',  name:'ул. (SW свързваща)',      baseLevel:'light', isBackground:true,
    coords:[[43.2390001,26.5618176],[43.2396987,26.5614427],[43.2402939,26.5611442]] },
  { id:'b84',  name:'ул. (SW изток)',          baseLevel:'light', isBackground:true,
    coords:[[43.2396864,26.5647769],[43.2392947,26.5631302],[43.2391159,26.5623751],[43.2390001,26.5618176]] },

  // Centre-west residential approach
  { id:'b85',  name:'ул. (ц. запад)',          baseLevel:'light', isBackground:true,
    coords:[[43.2457457,26.5621827],[43.2448410,26.5626329],[43.2446884,26.5627631],[43.2436943,26.5635114],[43.2435960,26.5635799]] },

  // Central residential grid — connectors
  { id:'b86',  name:'ул. (ц. рез. 1)',         baseLevel:'light', isBackground:true, coords:[[43.2515805,26.5687087],[43.2518618,26.5681926],[43.2519239,26.5676752]] },
  { id:'b87',  name:'ул. (ц. рез. 2)',         baseLevel:'light', isBackground:true, coords:[[43.2483465,26.5666353],[43.2490389,26.5667166],[43.2494179,26.5662257],[43.2497391,26.5657919]] },
  { id:'b88',  name:'ул. (ц. рез. 3)',         baseLevel:'light', isBackground:true, coords:[[43.2499630,26.5671162],[43.2493690,26.5668132],[43.2490389,26.5667166]] },
  { id:'b89',  name:'ул. (ц. рез. 4)',         baseLevel:'light', isBackground:true, coords:[[43.2490389,26.5667166],[43.2490184,26.5670009],[43.2493014,26.5681160]] },
  { id:'b90',  name:'ул. (ц. рез. 5)',         baseLevel:'light', isBackground:true, coords:[[43.2503088,26.5659951],[43.2501857,26.5663840],[43.2499630,26.5671162],[43.2496680,26.5681489],[43.2498164,26.5689172]] },
  { id:'b91',  name:'ул. (ц. рез. 6)',         baseLevel:'light', isBackground:true, coords:[[43.2513325,26.5663798],[43.2515482,26.5677880]] },
  { id:'b92',  name:'ул. (ц. рез. 7)',         baseLevel:'light', isBackground:true, coords:[[43.2509768,26.5680960],[43.2515805,26.5687087],[43.2516774,26.5688050],[43.2521748,26.5692994]] },
  { id:'b93',  name:'ул. (ц. рез. 8)',         baseLevel:'light', isBackground:true, coords:[[43.2504762,26.5682213],[43.2496680,26.5681489],[43.2493014,26.5681160],[43.2482774,26.5679963]] },
  { id:'b94',  name:'ул. (ц. рез. 9)',         baseLevel:'light', isBackground:true, coords:[[43.2492702,26.5689112],[43.2490092,26.5700569]] },
  { id:'b95',  name:'ул. (ц. рез. 10)',        baseLevel:'light', isBackground:true, coords:[[43.2498164,26.5689172],[43.2494252,26.5689129],[43.2492702,26.5689112]] },
  { id:'b96',  name:'ул. (ц. рез. 11)',        baseLevel:'light', isBackground:true, coords:[[43.2515311,26.5704399],[43.2513445,26.5700889],[43.2512607,26.5693718]] },
  { id:'b97',  name:'ул. (ц. рез. 12)',        baseLevel:'light', isBackground:true, coords:[[43.2528034,26.5699859],[43.2523474,26.5700934],[43.2517120,26.5702431]] },

  // NW tertiary spine and loop
  { id:'b98',  name:'ул. (NW гръбнак)',        baseLevel:'light', isBackground:true,
    coords:[[43.2565305,26.5640719],[43.2567216,26.5644508],[43.2570584,26.5647855],[43.2573954,26.5651286],[43.2575418,26.5653854],[43.2576341,26.5657504],[43.2576933,26.5667674],[43.2577076,26.5669445],[43.2577668,26.5675337],[43.2578047,26.5676040]] },
  { id:'b99',  name:'ул. (NW петля)',          baseLevel:'light', isBackground:true,
    coords:[[43.2596812,26.5675240],[43.2594991,26.5673966],[43.2583573,26.5675151],[43.2582111,26.5675427]] },

  // NE residential short connectors
  { id:'b100', name:'ул. (NE свързваща 1)',    baseLevel:'light', isBackground:true, coords:[[43.2542951,26.5619470],[43.2540390,26.5624864],[43.2538143,26.5629846]] },
  { id:'b101', name:'ул. (NE свързваща 2)',    baseLevel:'light', isBackground:true, coords:[[43.2533533,26.5610186],[43.2529179,26.5605882],[43.2527067,26.5604982]] },

  // Inner-city short links
  { id:'b102', name:'ул. (вътр. 1)',           baseLevel:'light', isBackground:true, coords:[[43.2542773,26.5670267],[43.2542265,26.5662945],[43.2541679,26.5655140]] },
  { id:'b103', name:'ул. (вътр. 2)',           baseLevel:'light', isBackground:true, coords:[[43.2471857,26.5663401],[43.2472760,26.5661496],[43.2474983,26.5657956],[43.2476194,26.5656910],[43.2480378,26.5656204],[43.2483517,26.5655518]] },
  { id:'b104', name:'ул. (вътр. 3)',           baseLevel:'light', isBackground:true, coords:[[43.2471857,26.5663401],[43.2472521,26.5659136],[43.2473185,26.5657822],[43.2476116,26.5653504],[43.2480023,26.5652082],[43.2483031,26.5651563]] },
  { id:'b105', name:'ул. (вътр. 4)',           baseLevel:'light', isBackground:true, coords:[[43.2474104,26.5656266],[43.2472951,26.5655059],[43.2471329,26.5652377],[43.2470187,26.5650693]] },
  { id:'b106', name:'ул. (вътр. 5)',           baseLevel:'light', isBackground:true, coords:[[43.2517319,26.5619091],[43.2519325,26.5632512]] },
  { id:'b107', name:'ул. (вътр. 6)',           baseLevel:'light', isBackground:true, coords:[[43.2514949,26.5636325],[43.2511458,26.5637196],[43.2502315,26.5639905],[43.2501651,26.5639610]] },
  { id:'b108', name:'ул. (вътр. 7)',           baseLevel:'light', isBackground:true, coords:[[43.2514949,26.5636325],[43.2519325,26.5632512],[43.2525426,26.5627057],[43.2525817,26.5626628]] },
  { id:'b109', name:'ул. (вътр. 8)',           baseLevel:'light', isBackground:true, coords:[[43.2509953,26.5646825],[43.2511341,26.5650151],[43.2514408,26.5655274],[43.2517436,26.5660075]] },
  { id:'b110', name:'ул. (вътр. 9)',           baseLevel:'light', isBackground:true, coords:[[43.2457774,26.5696253],[43.2458519,26.5696325],[43.2459517,26.5697101],[43.2459782,26.5698119],[43.2461379,26.5712165]] },
  { id:'b111', name:'ул. (вътр. 10)',          baseLevel:'light', isBackground:true, coords:[[43.2402730,26.5550990],[43.2404567,26.5555469],[43.2404371,26.5557212]] },
  { id:'b112', name:'ул. (вътр. 11)',          baseLevel:'light', isBackground:true, coords:[[43.2388210,26.5601955],[43.2391523,26.5598742],[43.2392161,26.5598138],[43.2395207,26.5595349]] },
  { id:'b113', name:'ул. (вътр. 12)',          baseLevel:'light', isBackground:true, coords:[[43.2392161,26.5598138],[43.2390881,26.5595330],[43.2389641,26.5592797]] },
  { id:'b114', name:'ул. (вътр. 13)',          baseLevel:'light', isBackground:true, coords:[[43.2580869,26.5675609],[43.2578896,26.5675851]] },
  { id:'b115', name:'ул. (вътр. 14)',          baseLevel:'light', isBackground:true, coords:[[43.2471616,26.5565617],[43.2469954,26.5574367],[43.2468764,26.5580637]] },
  { id:'b116', name:'ул. (вътр. 15)',          baseLevel:'light', isBackground:true, coords:[[43.2468998,26.5549684],[43.2472699,26.5552747],[43.2475873,26.5557670],[43.2481968,26.5563141],[43.2482487,26.5563875]] },
];

const ALL_SEGMENTS = [...BASE_SEGMENTS, ...BG_STREETS];

const TRAFFIC_COLORS: Record<TrafficLevel, string> = { heavy: '#EF4444', moderate: '#F59E0B', light: '#22C55E' };
const TRAFFIC_WEIGHTS: Record<TrafficLevel, number> = { heavy: 5, moderate: 4, light: 3 };

/** Full traffic heatmap on every road: same green / amber / red semantics, strong enough to read on the basemap. */
function trafficPolyStyle(seg: TrafficSegment, level: TrafficLevel): { color: string; weight: number; opacity: number } {
  const color = TRAFFIC_COLORS[level];
  if (seg.isBackground) {
    // Residential streets: thinner (2 px) and slightly more transparent so main arteries stand out
    return { color, weight: 2, opacity: level === 'light' ? 0.70 : level === 'moderate' ? 0.80 : 0.88 };
  }
  // Main arteries: bolder (weight 4-6) so they read clearly above the residential layer
  const w = TRAFFIC_WEIGHTS[level];
  return { color, weight: w + 1, opacity: 0.92 };
}

function trafficTooltipHtml(seg: TrafficSegment, level: TrafficLevel): string {
  const col = TRAFFIC_COLORS[level];
  return `<b>${seg.name}</b><br><span style="color:${col}">${level} traffic</span>`;
}

// Speeds in t-units/second between waypoints
const VEHICLE_SPEEDS: Record<TrafficLevel, [number, number]> = {
  heavy:    [0.03, 0.07],
  moderate: [0.09, 0.16],
  light:    [0.20, 0.38],
};
const VEHICLE_COUNTS: Record<TrafficLevel, number> = { heavy: 12, moderate: 9, light: 5 };

// ─── Road graph: cluster vertices, junction handoffs, gateway entry/exit ─────
const SNAP_M = 9;  // merge only genuinely coincident OSM nodes (dense grid: streets 40-80 m apart — must stay tight)
const ENDPOINT_BRIDGE_M = 22; // bridge segment endpoints that almost meet but aren’t exact (hand-coded base segs)
const EDGE_SNAP_M = 12; // snap a dead-end to the nearest edge (T-junction tolerance)
const GATEWAY_EDGE_M = 90; // nodes this close to map bbox = city edge
const EXIT_AT_GATEWAY_P = 0.1; // lower = fewer cars vanishing at interior edge nodes
const U_TURN_COS = -0.42; // allow sharper turns when needed (still blocks ~115°+ reversals)

type RoadMove = { segId: string; wpIdx: number; dir: 1 | -1 };

/** Distance (m) from point P to segment AB — links T-junctions where vertices don’t coincide. */
function distPointToSegmentM(
  plat: number, plng: number,
  alat: number, alng: number,
  blat: number, blng: number,
): number {
  const apx = (plat - alat) * 111_000;
  const apy = (plng - alng) * 80_000;
  const abx = (blat - alat) * 111_000;
  const aby = (blng - alng) * 80_000;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(apx - abx * t, apy - aby * t);
}

interface RoadNetwork {
  flat: { segId: string; ci: number; lat: number; lng: number }[];
  keyToFlat: Map<string, number>;
  uf: number[];
  adj: Map<number, RoadMove[]>;
  gateway: Set<number>;
  minLat: number; maxLat: number; minLng: number; maxLng: number;
  /** Mean lat/lng per union-find root — shared junction point for all roads in that cluster */
  nodePos: Map<number, [number, number]>;
}

function buildRoadNetwork(segments: TrafficSegment[]): RoadNetwork {
  const flat: RoadNetwork['flat'] = [];
  const keyToFlat = new Map<string, number>();
  segments.forEach((s) => {
    s.coords.forEach((c, ci) => {
      keyToFlat.set(`${s.id}:${ci}`, flat.length);
      flat.push({ segId: s.id, ci, lat: c[0], lng: c[1] });
    });
  });
  const n = flat.length;
  const uf = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (uf[i] !== i) uf[i] = find(uf[i]);
    return uf[i];
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) uf[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = flat[i];
      const q = flat[j];
      const dLat = (p.lat - q.lat) * 111_000;
      const dLng = (p.lng - q.lng) * 80_000;
      if (Math.sqrt(dLat * dLat + dLng * dLng) < SNAP_M) union(i, j);
    }
  }

  const endpointIndices: number[] = [];
  segments.forEach((s) => {
    endpointIndices.push(keyToFlat.get(`${s.id}:0`)!);
    endpointIndices.push(keyToFlat.get(`${s.id}:${s.coords.length - 1}`)!);
  });
  for (let a = 0; a < endpointIndices.length; a++) {
    for (let b = a + 1; b < endpointIndices.length; b++) {
      const ia = endpointIndices[a]!;
      const ib = endpointIndices[b]!;
      if (find(ia) === find(ib)) continue;
      const p = flat[ia]!;
      const q = flat[ib]!;
      const dLat = (p.lat - q.lat) * 111_000;
      const dLng = (p.lng - q.lng) * 80_000;
      if (Math.sqrt(dLat * dLat + dLng * dLng) < ENDPOINT_BRIDGE_M) union(ia, ib);
    }
  }

  segments.forEach((s) => {
    const L = s.coords.length;
    for (const ci of [0, L - 1]) {
      const ei = keyToFlat.get(`${s.id}:${ci}`)!;
      const { lat: plat, lng: plng } = flat[ei]!;
      segments.forEach((s2) => {
        if (s2.id === s.id) return;
        for (let i = 0; i < s2.coords.length - 1; i++) {
          const c0 = s2.coords[i]!;
          const c1 = s2.coords[i + 1]!;
          if (distPointToSegmentM(plat, plng, c0[0], c0[1], c1[0], c1[1]) >= EDGE_SNAP_M) continue;
          const i0 = keyToFlat.get(`${s2.id}:${i}`)!;
          const i1 = keyToFlat.get(`${s2.id}:${i + 1}`)!;
          const d0 = Math.hypot(
            (plat - flat[i0]!.lat) * 111_000,
            (plng - flat[i0]!.lng) * 80_000,
          );
          const d1 = Math.hypot(
            (plat - flat[i1]!.lat) * 111_000,
            (plng - flat[i1]!.lng) * 80_000,
          );
          union(ei, d0 <= d1 ? i0 : i1);
        }
      });
    }
  });

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  flat.forEach((p) => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  });
  const pad = 0.00015;
  minLat -= pad;
  maxLat += pad;
  minLng -= pad;
  maxLng += pad;

  const distToBBoxEdgeM = (lat: number, lng: number): number => {
    const dN = (maxLat - lat) * 111_000;
    const dS = (lat - minLat) * 111_000;
    const dE = (maxLng - lng) * 80_000;
    const dW = (lng - minLng) * 80_000;
    return Math.min(dN, dS, dE, dW);
  };

  const rootOf = (segId: string, ci: number) => find(keyToFlat.get(`${segId}:${ci}`)!);

  const moveKey = (m: RoadMove) => `${m.segId}|${m.wpIdx}|${m.dir}`;
  const adj = new Map<number, RoadMove[]>();

  const addMove = (node: number, m: RoadMove) => {
    if (!adj.has(node)) adj.set(node, []);
    const list = adj.get(node)!;
    if (!list.some((x) => moveKey(x) === moveKey(m))) list.push(m);
  };

  segments.forEach((s) => {
    const L = s.coords.length;
    for (let k = 0; k < L; k++) {
      const r = rootOf(s.id, k);
      if (k < L - 1) addMove(r, { segId: s.id, wpIdx: k, dir: 1 });
      if (k > 0) addMove(r, { segId: s.id, wpIdx: k - 1, dir: -1 });
    }
  });

  const gateway = new Set<number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const { lat, lng } = flat[i];
    if (distToBBoxEdgeM(lat, lng) < GATEWAY_EDGE_M) gateway.add(r);
  }

  const agg = new Map<number, { sLat: number; sLng: number; n: number }>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const p = flat[i]!;
    const g = agg.get(r) ?? { sLat: 0, sLng: 0, n: 0 };
    g.sLat += p.lat;
    g.sLng += p.lng;
    g.n += 1;
    agg.set(r, g);
  }
  const nodePos = new Map<number, [number, number]>();
  agg.forEach((v, r) => {
    nodePos.set(r, [v.sLat / v.n, v.sLng / v.n]);
  });

  return { flat, keyToFlat, uf, adj, gateway, minLat, maxLat, minLng, maxLng, nodePos };
}

const ROAD: RoadNetwork = buildRoadNetwork(ALL_SEGMENTS);
const SEG_BY_ID = new Map<string, TrafficSegment>(ALL_SEGMENTS.map((s) => [s.id, s]));

function roadRoot(segId: string, coordIdx: number): number {
  const i = ROAD.keyToFlat.get(`${segId}:${coordIdx}`);
  if (i === undefined) return -1;
  let r = i;
  while (ROAD.uf[r] !== r) r = ROAD.uf[r];
  let c = i;
  while (ROAD.uf[c] !== r) {
    const p = ROAD.uf[c];
    ROAD.uf[c] = r;
    c = p;
  }
  return r;
}

/** Vertices snapped to junction centroids so lines meet and simulation matches the graph. */
function displayCoordsForSeg(seg: TrafficSegment): [number, number][] {
  return seg.coords.map((orig, ci) => {
    const r = roadRoot(seg.id, ci);
    if (r < 0) return orig;
    return ROAD.nodePos.get(r) ?? orig;
  });
}

function bearingRadFromMove(seg: TrafficSegment, wpIdx: number, dir: 1 | -1): number {
  const c = displayCoordsForSeg(seg);
  if (wpIdx < 0 || wpIdx >= c.length - 1) return 0;
  const a = c[wpIdx]!;
  const b = c[wpIdx + 1]!;
  if (dir === 1) {
    const dLat = (b[0] - a[0]) * 111_000;
    const dLng = (b[1] - a[1]) * 80_000;
    return Math.atan2(dLng, dLat);
  }
  const dLat = (a[0] - b[0]) * 111_000;
  const dLng = (a[1] - b[1]) * 80_000;
  return Math.atan2(dLng, dLat);
}

/** Collapse duplicate consecutive points after snapping (cleaner SVG; indices not used with this array). */
function mapPolylineCoords(seg: TrafficSegment): [number, number][] {
  const d = displayCoordsForSeg(seg);
  const out: [number, number][] = [];
  for (const pt of d) {
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt);
  }
  return out.length >= 2 ? out : [...seg.coords];
}

function pickNextMove(
  atSeg: TrafficSegment,
  lastArrival: { segId: string; wpIdx: number; dir: 1 | -1 } | null,
  arrivedAtCoordIdx: number,
  liveLevels: Record<string, TrafficLevel>,
): RoadMove | 'despawn' {
  const node = roadRoot(atSeg.id, arrivedAtCoordIdx);
  if (node < 0) return 'despawn';

  if (ROAD.gateway.has(node) && Math.random() < EXIT_AT_GATEWAY_P) return 'despawn';

  let incoming = 0;
  if (lastArrival) {
    const ls = SEG_BY_ID.get(lastArrival.segId);
    if (ls) incoming = bearingRadFromMove(ls, lastArrival.wpIdx, lastArrival.dir);
  }

  const all = ROAD.adj.get(node) ?? [];
  if (all.length === 0) return 'despawn';

  const isUTurn = (m: RoadMove) => {
    if (!lastArrival) return false;
    if (m.segId !== lastArrival.segId) return false;
    if (lastArrival.dir === 1 && m.dir === -1 && m.wpIdx === lastArrival.wpIdx) return true;
    if (lastArrival.dir === -1 && m.dir === 1 && m.wpIdx === lastArrival.wpIdx) return true;
    return false;
  };

  const angleOk = (m: RoadMove) => {
    if (!lastArrival) return true;
    const ms = SEG_BY_ID.get(m.segId);
    if (!ms) return true;
    const out = bearingRadFromMove(ms, m.wpIdx, m.dir);
    const c = Math.cos(out - incoming);
    return c > U_TURN_COS;
  };

  let pool = all.filter((m) => !isUTurn(m)).filter(angleOk);
  if (pool.length === 0) pool = all.filter((m) => !isUTurn(m));
  if (pool.length === 0) pool = [...all];

  // Prefer arterials slightly when multiple choices (keeps flow on main roads)
  const weights = pool.map((m) => {
    const s = SEG_BY_ID.get(m.segId);
    const w = s?.isBackground ? 1 : 1.35;
    const lvl = liveLevels[m.segId] ?? s?.baseLevel ?? 'light';
    const slow = lvl === 'heavy' ? 0.85 : lvl === 'moderate' ? 1 : 1.1;
    return w * slow;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

function jitter(level: TrafficLevel): TrafficLevel {
  const levels: TrafficLevel[] = ['light', 'moderate', 'heavy'];
  const idx = levels.indexOf(level);
  const delta = Math.random() < 0.28 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  return levels[Math.max(0, Math.min(2, idx + delta))];
}

// ─── Vehicle types ─────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  segId: string;
  marker: L.Marker;
  wpIdx: number;       // current waypoint (moves toward wpIdx + dir)
  t: number;           // 0-1 progress between this and next waypoint
  baseSpeed: number;   // t-units/second (fixed per vehicle)
  dir: 1 | -1;         // travel direction along coords array
  lane: -1 | 1;        // which side of the road (perpendicular offset)
  isTruck: boolean;
  brakeUntil: number;  // performance.now() until which vehicle brakes
  /** Completed micro-edge before last junction (blocks immediate U-turn) */
  lastArrival: { segId: string; wpIdx: number; dir: 1 | -1 } | null;
}

function applyRoadTransition(
  v: Vehicle,
  lastArrival: { segId: string; wpIdx: number; dir: 1 | -1 },
  arrivedAtCoordIdx: number,
  seg: TrafficSegment,
  liveLevels: Record<string, TrafficLevel>,
): boolean {
  const next = pickNextMove(seg, lastArrival, arrivedAtCoordIdx, liveLevels);
  if (next === 'despawn') return false;

  const ns = SEG_BY_ID.get(next.segId);
  if (!ns || ns.coords.length < 2) return false;

  v.segId = next.segId;
  v.dir = next.dir;
  v.wpIdx = next.wpIdx;
  v.lastArrival = lastArrival;
  v.lane = v.dir as -1 | 1;
  v.t = next.dir === 1 ? 0.02 + Math.random() * 0.08 : 1 - (0.02 + Math.random() * 0.08);

  const isBg = !!ns.isBackground;
  const level = liveLevels[next.segId] ?? ns.baseLevel;
  const [sMin, sMax] = isBg ? [0.12, 0.25] : VEHICLE_SPEEDS[level];
  v.baseSpeed = sMin + Math.random() * (sMax - sMin);

  return true;
}

// CSS angle so the vehicle's horizontal body faces its direction of travel
function angleDeg(a: [number, number], b: [number, number], dir: 1 | -1): number {
  const from = dir === 1 ? a : b;
  const to   = dir === 1 ? b : a;
  // screen: x = east (+lng), y = south (-lat)
  return Math.atan2(-(to[0] - from[0]), to[1] - from[1]) * (180 / Math.PI);
}

// Small perpendicular offset to separate lanes (≈2-3 m in degrees)
function laneOffset(a: [number, number], b: [number, number], lane: -1 | 1): [number, number] {
  const dLatM = (b[0] - a[0]) * 111_000;
  const dLngM = (b[1] - a[1]) * 80_000;   // approx at 43°N
  const len   = Math.sqrt(dLatM * dLatM + dLngM * dLngM) || 1;
  const perpLatM = -dLngM / len;
  const perpLngM =  dLatM / len;
  const OFFSET_M = 2.8;
  return [perpLatM * OFFSET_M / 111_000 * lane, perpLngM * OFFSET_M / 80_000 * lane];
}

function makeIcon(isTruck: boolean, rot: number, level: TrafficLevel | 'bg'): L.DivIcon {
  const w = isTruck ? 13 : 9;
  const h = isTruck ? 6  : 5;
  const body = level === 'bg' ? '#374151'
    : level === 'heavy' ? '#7F1D1D' : level === 'moderate' ? '#78350F' : '#14532D';
  const window = '#BAE6FD';
  return L.divIcon({
    html: `<div style="
      width:${w}px;height:${h}px;
      background:${body};
      border-radius:${isTruck ? '1px 3px 3px 1px' : '2px 4px 4px 2px'};
      border:1px solid rgba(255,255,255,0.8);
      box-shadow:0 1px 4px rgba(0,0,0,0.5);
      transform:rotate(${rot}deg);
      position:relative;overflow:hidden;">
      <div style="
        position:absolute;right:1px;top:1px;
        width:${Math.round(w*0.33)}px;height:${h-2}px;
        background:${window};opacity:0.75;border-radius:1px;"></div>
    </div>`,
    iconSize: [w, h], iconAnchor: [w / 2, h / 2], className: '',
  });
}

// Spawn a single vehicle onto a segment from its entry edge
function spawnOneVehicle(
  seg: TrafficSegment,
  dir: 1 | -1,
  map: L.Map,
  liveLevels: Record<string, TrafficLevel>,
  uid: string,
): Vehicle {
  const isBg = !!seg.isBackground;
  const level = liveLevels[seg.id] ?? seg.baseLevel;
  const iconLevel: TrafficLevel | 'bg' = isBg ? 'bg' : level;
  const [sMin, sMax] = isBg ? [0.12, 0.25] : VEHICLE_SPEEDS[level];
  const n = seg.coords.length;
  const lane = dir as -1 | 1; // dir=1 → right lane, dir=-1 → left lane
  // Start near the entry end of the segment (small offset so not exactly on boundary)
  const wpIdx = dir === 1 ? 0 : n - 2;
  const t     = dir === 1 ? Math.random() * 0.08 : 1 - Math.random() * 0.08;
  const baseSpeed = sMin + Math.random() * (sMax - sMin);
  const isTruck   = !isBg && Math.random() < 0.18;
  const dc = displayCoordsForSeg(seg);
  const a = dc[wpIdx]!;
  const b = dc[Math.min(wpIdx + 1, n - 1)]!;
  const [oLat, oLng] = laneOffset(a, b, lane);
  const lat = a[0] + (b[0] - a[0]) * t + oLat;
  const lng = a[1] + (b[1] - a[1]) * t + oLng;
  const marker = L.marker([lat, lng], {
    icon: makeIcon(isTruck, angleDeg(a, b, dir), iconLevel),
    interactive: false, zIndexOffset: isBg ? 100 : 200,
  }).addTo(map);
  return { id: uid, segId: seg.id, marker, wpIdx, t, baseSpeed, dir, lane, isTruck, brakeUntil: 0, lastArrival: null };
}

// Initial seeding: spread vehicles across each segment at random positions
function spawnVehicles(
  segments: TrafficSegment[],
  liveLevels: Record<string, TrafficLevel>,
  map: L.Map,
): Vehicle[] {
  const vehicles: Vehicle[] = [];
  segments.forEach((seg) => {
    const isBg = !!seg.isBackground;
    const level = liveLevels[seg.id] ?? seg.baseLevel;
    const iconLevel: TrafficLevel | 'bg' = isBg ? 'bg' : level;
    const count = isBg ? 2 : VEHICLE_COUNTS[level];
    const [sMin, sMax] = isBg ? [0.12, 0.25] : VEHICLE_SPEEDS[level];
    const n = seg.coords.length;
    if (n < 2) return;

    for (let i = 0; i < count; i++) {
      const dir  = (i % 2 === 0 ? 1 : -1) as 1 | -1;
      const lane = dir as -1 | 1;
      // Spread evenly across the segment at random initial positions
      const wpIdx    = Math.floor(Math.random() * (n - 1));
      const t        = Math.random();
      const baseSpeed = sMin + Math.random() * (sMax - sMin);
      const isTruck  = !isBg && Math.random() < 0.18;

      const dc = displayCoordsForSeg(seg);
      const a = dc[wpIdx]!;
      const b = dc[Math.min(wpIdx + 1, n - 1)]!;
      const [oLat, oLng] = laneOffset(a, b, lane);
      const lat = a[0] + (b[0] - a[0]) * t + oLat;
      const lng = a[1] + (b[1] - a[1]) * t + oLng;
      const rot = angleDeg(a, b, dir);

      const marker = L.marker([lat, lng], {
        icon: makeIcon(isTruck, rot, iconLevel),
        interactive: false, zIndexOffset: isBg ? 100 : 200,
      }).addTo(map);

      vehicles.push({ id: `${seg.id}-v${i}`, segId: seg.id, marker, wpIdx, t, baseSpeed, dir, lane, isTruck, brakeUntil: 0, lastArrival: null });
    }
  });
  return vehicles;
}

/** Gateway moves for a given segment (keeps per-segment replenish counts correct). */
function pickGatewaySpawnForSegment(segId: string): RoadMove | null {
  const pool: RoadMove[] = [];
  ROAD.gateway.forEach((nodeId) => {
    for (const m of ROAD.adj.get(nodeId) ?? []) {
      if (m.segId === segId) pool.push(m);
    }
  });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function spawnVehicleFromMove(
  m: RoadMove,
  map: L.Map,
  liveLevels: Record<string, TrafficLevel>,
  uid: string,
): Vehicle | null {
  const seg = SEG_BY_ID.get(m.segId);
  if (!seg || seg.coords.length < 2) return null;
  const isBg = !!seg.isBackground;
  const level = liveLevels[seg.id] ?? seg.baseLevel;
  const iconLevel: TrafficLevel | 'bg' = isBg ? 'bg' : level;
  const [sMin, sMax] = isBg ? [0.12, 0.25] : VEHICLE_SPEEDS[level];
  const wpIdx = m.wpIdx;
  const dir = m.dir;
  const t = dir === 1 ? 0.02 + Math.random() * 0.07 : 1 - (0.02 + Math.random() * 0.07);
  const lane = dir as -1 | 1;
  const baseSpeed = sMin + Math.random() * (sMax - sMin);
  const isTruck = !isBg && Math.random() < 0.18;
  const dc = displayCoordsForSeg(seg);
  const a = dc[wpIdx]!;
  const b = dc[wpIdx + 1]!;
  const [oLat, oLng] = laneOffset(a, b, lane);
  const lat = a[0] + (b[0] - a[0]) * t + oLat;
  const lng = a[1] + (b[1] - a[1]) * t + oLng;
  const marker = L.marker([lat, lng], {
    icon: makeIcon(isTruck, angleDeg(a, b, dir), iconLevel),
    interactive: false, zIndexOffset: isBg ? 100 : 200,
  }).addTo(map);
  return { id: uid, segId: seg.id, marker, wpIdx, t, baseSpeed, dir, lane, isTruck, brakeUntil: 0, lastArrival: null };
}

function syncVehicleTrafficIcons(vehicles: Vehicle[], liveLevels: Record<string, TrafficLevel>) {
  vehicles.forEach((v) => {
    const seg = SEG_BY_ID.get(v.segId);
    if (!seg) return;
    const isBg = !!seg.isBackground;
    const level = liveLevels[v.segId] ?? seg.baseLevel;
    const iconLevel: TrafficLevel | 'bg' = isBg ? 'bg' : level;
    const n = seg.coords.length;
    const clampedWp = Math.max(0, Math.min(n - 2, v.wpIdx));
    const dc = displayCoordsForSeg(seg);
    const a = dc[clampedWp]!;
    const b = dc[clampedWp + 1]!;
    v.marker.setIcon(makeIcon(v.isTruck, angleDeg(a, b, v.dir), iconLevel));
  });
}

// ─── Static data ───────────────────────────────────────────────────────────────

const LOCATIONS = [
  { pos: [43.2548, 26.5745] as [number, number], name: 'Your Venue',      color: P.primary, r: 10 },
  { pos: [43.2418, 26.5722] as [number, number], name: 'Train Station',   color: P.muted,   r: 7  },
  { pos: [43.2536, 26.5733] as [number, number], name: 'Town Centre',     color: P.muted,   r: 7  },
  { pos: [43.2545, 26.5823] as [number, number], name: 'Shopping Centre', color: P.muted,   r: 7  },
  { pos: [43.2426, 26.5787] as [number, number], name: 'Market',          color: P.muted,   r: 7  },
];

const HOURS    = ['10','11','12','13','14','15','16','17','18','19','20','21'];
const FOOTFALL = [18, 32, 68, 88, 74, 55, 48, 60, 85, 92, 76, 42];
const GENERATORS = [
  { name: 'бул. 29. Януари market', dist: '60 m',  walk: '1 min', flow: 'High' },
  { name: 'Town Centre',            dist: '200 m', walk: '3 min', flow: 'High' },
  { name: 'Shopping Centre',        dist: '420 m', walk: '6 min', flow: 'Med'  },
  { name: 'Train Station',          dist: '680 m', walk: '9 min', flow: 'Low'  },
];

// ─── Venue markers ─────────────────────────────────────────────────────────────

type VenueType = 'restaurant' | 'bar' | 'cafe' | 'fast_food' | 'club';

interface VenueReview {
  author: string;
  rating: number;
  date: string;
  text: string;
  tags: string[];
}

interface VenueSentiment {
  food: number;       // 0–100
  service: number;
  value: number;
  atmosphere: number;
}

interface VenuePoint {
  id: string; name: string; type: VenueType;
  lat: number; lon: number;
  cuisine?: string;
  rating: number;
  priceRange: 1 | 2 | 3;
  hours: string;
  features: string[];
  phone?: string;
  description: string;
  reviews: VenueReview[];
  sentiment: VenueSentiment;
  aiInsight: string;
  opportunityScore: number; // 0-100, higher = weaker competitor = bigger opportunity
}

// Inline SVG strings used inside Leaflet DivIcon (can't use React components there)
const VENUE_SVG: Record<VenueType, string> = {
  restaurant: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
  bar:        `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5z"/></svg>`,
  cafe:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`,
  club:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  fast_food:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
};

const VENUE_STYLE: Record<VenueType, { bg: string; label: string }> = {
  restaurant: { bg: '#D25F2A', label: 'RESTAURANT' },
  bar:        { bg: '#7C3AED', label: 'BAR'        },
  cafe:       { bg: '#D97706', label: 'CAFÉ'       },
  club:       { bg: '#312E81', label: 'CLUB'       },
  fast_food:  { bg: '#6B7280', label: 'FAST FOOD'  },
};

const VENUES: VenuePoint[] = [
  {
    id:'v1', name:'The Point Bar', type:'bar', lat:43.2441743, lon:26.5722149,
    rating:4.2, priceRange:2, hours:'17:00 – 01:00', phone:'+359 89 337 1111',
    features:['Outdoor seating','Craft beer','Delivery','Live music'], cuisine:'Grill & Pub',
    description:'Popular local bar with craft beers, cocktails and a full grill menu.',
    sentiment:{ food:65, service:52, value:56, atmosphere:90 },
    opportunityScore:45,
    aiInsight:'Service speed is your clearest vulnerability — 38% of recent reviews cite slow delivery on peak nights. Three nearby venues share this exact complaint, creating an opening for anyone who staffs up on Friday/Saturday. A dedicated bar runner from 20:00–23:00 on weekends would directly address the most common complaint.',
    reviews:[
      { author:'Maria K.', rating:5, date:'2 days ago', text:'Best craft beer in town! Outdoor terrace is lovely in summer. Staff are friendly and know their beers extremely well.', tags:['craft beer','outdoor terrace','friendly staff'] },
      { author:'Stefan D.', rating:3, date:'1 week ago', text:'Great atmosphere but service was painfully slow on Friday. Waited 25 minutes for drinks. Prices are a bit steep for what you get.', tags:['slow service','good atmosphere','overpriced'] },
      { author:'Elena T.', rating:4, date:'2 weeks ago', text:'Live music on Saturdays is excellent. Cocktail menu is creative. Gets very crowded — arrive before 21:00 or book ahead.', tags:['live music','cocktails','crowded'] },
    ],
  },
  {
    id:'v2', name:'Механа Астра', type:'restaurant', lat:43.2433655, lon:26.5696127,
    rating:4.0, priceRange:2, hours:'11:00 – 23:00',
    features:['Traditional cuisine','Garden seating'], cuisine:'Bulgarian',
    description:'Classic Bulgarian tavern serving traditional dishes and local wines.',
    sentiment:{ food:72, service:76, value:58, atmosphere:83 },
    opportunityScore:35,
    aiInsight:'Recent reviews signal a kitchen quality inconsistency — a risk for a venue built on traditional cooking reputation. Their wine programme is genuinely praised but under-marketed. The Point Bar is currently losing customers over service; Механа Астра is capturing them, but kitchen quality must stay consistent to hold that advantage.',
    reviews:[
      { author:'Ivan P.', rating:5, date:'3 days ago', text:'Authentic Bulgarian food — the best kavarma I have had. The garden is beautiful for summer evenings. A real gem.', tags:['authentic','garden','kavarma'] },
      { author:'Nadia R.', rating:4, date:'1 week ago', text:'Limited menu but everything is done well. Excellent local wine list. Service was prompt and genuinely friendly.', tags:['good service','wine list','limited menu'] },
      { author:'Georgi B.', rating:3, date:'3 weeks ago', text:'Quality has dipped lately — the kebapche was dry and prices have crept up noticeably. It used to be much better.', tags:['quality decline','overpriced'] },
    ],
  },
  {
    id:'v3', name:'Механа Българка', type:'restaurant', lat:43.2442920, lon:26.5723105,
    rating:4.3, priceRange:2, hours:'12:00 – 23:30',
    features:['Folk music','Banquet hall','Group bookings'], cuisine:'Bulgarian',
    description:'Traditional mehana with live folk music and authentic Bulgarian recipes.',
    sentiment:{ food:85, service:78, value:74, atmosphere:88 },
    opportunityScore:20,
    aiInsight:'Strongest all-round sentiment in the central cluster. Folk music nights create an experience competitors cannot easily replicate. Main vulnerability: weekend capacity constraints mean they regularly turn away bookings — an opening for any nearby restaurant to capture overflow groups of 8+ people.',
    reviews:[
      { author:'Teodora M.', rating:5, date:'5 days ago', text:'The folk music evenings are magical. Food is incredibly authentic and portions are very generous. We will definitely return!', tags:['folk music','authentic','generous portions'] },
      { author:'Alexander N.', rating:4, date:'2 weeks ago', text:'Great group dining experience. The banquet hall is perfect for celebrations. Food quality is very consistent visit to visit.', tags:['group dining','celebrations','consistent'] },
      { author:'Vera S.', rating:4, date:'1 month ago', text:'A bit touristy in feel but the food genuinely delivers. Staff are attentive despite being clearly very busy.', tags:['attentive staff','busy','authentic'] },
    ],
  },
  {
    id:'v4', name:'Механа Архитекта', type:'restaurant', lat:43.2430406, lon:26.5676656,
    rating:4.1, priceRange:2, hours:'11:00 – 23:00',
    features:['Outdoor terrace','Bulgarian wines'], cuisine:'Bulgarian',
    description:'Cosy tavern popular with locals, known for grilled meats and rakia.',
    sentiment:{ food:80, service:61, value:70, atmosphere:75 },
    opportunityScore:38,
    aiInsight:'Strong food quality reputation but staffing issues are creating friction. 2 of the last 5 reviews mention slow basic service actions. Their grill quality is genuinely the best in the immediate area — if they resolved service inconsistency they would be the dominant competitor. Currently a beatable target on service experience.',
    reviews:[
      { author:'Dimitar V.', rating:4, date:'1 week ago', text:'Cosy and authentic. The rakia selection is outstanding and the outdoor terrace is perfect in good weather.', tags:['cosy','rakia','outdoor terrace'] },
      { author:'Slavka K.', rating:5, date:'2 weeks ago', text:'The grilled meats are exceptional — genuinely the best in Targovishte. Prices are very fair for the quality you receive.', tags:['grilled meats','fair prices'] },
      { author:'Petya L.', rating:3, date:'1 month ago', text:'Food was good but the place was understaffed. Long wait for the bill and had to ask twice just for water.', tags:['understaffed','slow service'] },
    ],
  },
  {
    id:'v5', name:'CineMagic Café', type:'cafe', lat:43.2447249, lon:26.5715546,
    rating:3.8, priceRange:1, hours:'08:00 – 22:00',
    features:['Wi-Fi','Events space'], cuisine:undefined,
    description:'Lively café connected to the local cinema complex.',
    sentiment:{ food:45, service:58, value:62, atmosphere:71 },
    opportunityScore:65,
    aiInsight:'Strongly location-dependent — captures cinema footfall but struggles to draw standalone visits. Food is a consistent weak point with no substantive menu beyond pastries. Any nearby café adding a pre-show light dining option (sharing plates 17:00–21:00) could take cinema-goers who choose here purely by default proximity.',
    reviews:[
      { author:'Boryana T.', rating:4, date:'2 days ago', text:'Great spot before or after a film. Coffee is solid and the events space hosts some interesting things.', tags:['coffee','events','cinema crowd'] },
      { author:'Rumen A.', rating:3, date:'1 week ago', text:'Average coffee and food options are very limited. Useful purely for its location but nothing particularly special.', tags:['average coffee','limited food'] },
      { author:'Hristina D.', rating:4, date:'3 weeks ago', text:'Nice atmosphere in the evenings when an event is on. Service can be slow during peak cinema periods.', tags:['good atmosphere','slow during events'] },
    ],
  },
  {
    id:'v6', name:'Читалището', type:'cafe', lat:43.2443931, lon:26.5713450,
    rating:3.9, priceRange:1, hours:'09:00 – 21:00',
    features:['Historic venue','Cultural events'], cuisine:undefined,
    description:"Café inside Targovishte's community cultural centre.",
    sentiment:{ food:50, service:54, value:58, atmosphere:85 },
    opportunityScore:52,
    aiInsight:'Cultural heritage is their biggest asset — the historic setting genuinely cannot be replicated. However food and service consistency are dragging down an otherwise exceptional atmosphere score. A competitor positioned as "speciality coffee + culture" with a better food offer could take their daytime loyal customers.',
    reviews:[
      { author:'Milena V.', rating:4, date:'4 days ago', text:'Love the cultural events here. Coffee is good and the historic atmosphere is completely unique in the town.', tags:['cultural events','historic','good coffee'] },
      { author:'Pavel K.', rating:4, date:'2 weeks ago', text:'A hidden gem. The events programme is excellent. I just wish the food menu was more developed — it is very limited.', tags:['hidden gem','events','limited food'] },
      { author:'Daniela M.', rating:3, date:'1 month ago', text:'Inconsistent quality — great one day, mediocre the next. Service is slow and prices do not match the ambience.', tags:['inconsistent','slow service'] },
    ],
  },
  {
    id:'v7', name:'Delicious', type:'fast_food', lat:43.2429898, lon:26.5614925,
    rating:3.5, priceRange:1, hours:'09:00 – 22:00',
    features:['Takeaway','Delivery'], cuisine:undefined,
    description:'Fast casual spot for burgers, sandwiches and local snacks.',
    sentiment:{ food:52, service:63, value:75, atmosphere:30 },
    opportunityScore:68,
    aiInsight:'Value-driven positioning in a location with steady footfall, but poor atmosphere and food consistency are limiting growth. Located in an underserved breakfast zone — no nearby competitor opens before 09:00 for hot food. The biggest unmet need in this micro-area is quality fast breakfast (06:00–10:00).',
    reviews:[
      { author:'Kaloyan B.', rating:4, date:'3 days ago', text:'Quick and affordable. Good for a fast lunch. The sandwiches are the standout menu item — always fresh.', tags:['fast','affordable','sandwiches'] },
      { author:'Yoana D.', rating:3, date:'1 week ago', text:'Nothing special. Food is fine but seating is uncomfortable and the place badly needs a refresh.', tags:['average','uncomfortable','dated'] },
      { author:'Martin T.', rating:3, date:'2 weeks ago', text:'Hit or miss. Sometimes food is fresh and good, other times it has clearly been sitting a while. Very inconsistent.', tags:['inconsistent freshness','unreliable'] },
    ],
  },
  {
    id:'v8', name:'Ресторант Централ', type:'restaurant', lat:43.2499769, lon:26.5729380,
    rating:4.4, priceRange:3, hours:'12:00 – 00:00',
    features:['Fine dining','Wine list','Reservations'], cuisine:'European',
    description:'Upscale restaurant in the town centre with European and Bulgarian cuisine.',
    sentiment:{ food:92, service:68, value:55, atmosphere:82 },
    opportunityScore:25,
    aiInsight:'Dominant in fine dining with no serious competitor. Vulnerability: service warmth at premium price points — a consistent mismatch for the local market expectation. For any venue considering upscaling, their value-per-lev gap is real: customers pay $$$ and receive exceptional food but sometimes $ warmth in service.',
    reviews:[
      { author:'Adriana P.', rating:5, date:'1 week ago', text:'Exceptional dining experience. The wine list is impressive and the European menu is executed beautifully. A special occasion restaurant.', tags:['fine dining','wine list','special occasion'] },
      { author:'Boris M.', rating:5, date:'2 weeks ago', text:'Best restaurant in Targovishte, full stop. Worth every lev. Book well in advance at weekends — it fills up fast.', tags:['best in town','popular','book ahead'] },
      { author:'Svetla K.', rating:3, date:'1 month ago', text:'Food was excellent but service felt cold and rushed for the price point. Not the warm experience the price suggests.', tags:['cold service','expensive','food quality'] },
    ],
  },
  {
    id:'v9', name:'Пицария Везувий', type:'restaurant', lat:43.2465179, lon:26.5732658,
    rating:3.9, priceRange:1, hours:'10:00 – 23:00',
    features:['Delivery','Takeaway','Family-friendly'], cuisine:'Italian / Pizza',
    description:'Neighbourhood pizzeria serving wood-fired pizzas and pasta.',
    sentiment:{ food:78, service:55, value:80, atmosphere:38 },
    opportunityScore:55,
    aiInsight:'Strong product, weak dining environment. Review sentiment splits sharply: delivery customers are loyal and positive; dine-in customers leave disappointed. A venue with a comfortable family-friendly dining room serving quality Italian would take a significant share of their in-person trade.',
    reviews:[
      { author:'Tsvetanka L.', rating:4, date:'2 days ago', text:'Best pizza in town! Delivery is fast and the wood-fired taste is authentic. Kids absolutely love it here.', tags:['best pizza','delivery','family-friendly'] },
      { author:'Georgi P.', rating:4, date:'1 week ago', text:'Reliable and tasty. The pasta is underrated — try the carbonara. Excellent value for money overall.', tags:['reliable','pasta','good value'] },
      { author:'Nikoleta A.', rating:3, date:'3 weeks ago', text:'Dine-in experience is a let-down — cramped and noisy. Much better to order delivery. Staff were inattentive.', tags:['cramped','noisy','better for delivery'] },
    ],
  },
  {
    id:'v10', name:'Café Milano', type:'cafe', lat:43.2485892, lon:26.5729396,
    rating:4.0, priceRange:1, hours:'07:30 – 21:00',
    features:['Espresso bar','Pastries','Wi-Fi'], cuisine:undefined,
    description:'Modern espresso café popular for breakfast and afternoon coffee.',
    sentiment:{ food:72, service:68, value:76, atmosphere:65 },
    opportunityScore:42,
    aiInsight:'Strong loyalty from daily regulars, validated by high review frequency. Capacity constraints during morning peak (07:30–09:30) mean they regularly lose customers who cannot get a seat. Any nearby café opening early with reliable espresso quality has a direct acquisition channel for Café Milano overflow.',
    reviews:[
      { author:'Rositsa V.', rating:5, date:'3 days ago', text:'My daily coffee stop. The espresso is excellent and pastries are always fresh. Very consistent quality every single time.', tags:['excellent espresso','fresh pastries','consistent'] },
      { author:'Todor A.', rating:4, date:'1 week ago', text:'Great for remote working — reliable wifi, comfortable seats and the staff do not rush you. Really good value.', tags:['wifi','comfortable','remote work'] },
      { author:'Emiliya K.', rating:3, date:'2 weeks ago', text:'Gets very busy in the morning and there are never enough seats. Coffee quality also dips noticeably during rush hour.', tags:['overcrowded','inconsistent rush hour'] },
    ],
  },
  {
    id:'v11', name:'Клуб Нощта', type:'bar', lat:43.2448899, lon:26.5734515,
    rating:4.1, priceRange:2, hours:'20:00 – 03:00',
    features:['Cocktails','DJ nights','VIP seating'], cuisine:undefined,
    description:'Trendy nightclub and cocktail bar in the heart of Targovishte.',
    sentiment:{ food:40, service:58, value:48, atmosphere:92 },
    opportunityScore:30,
    aiInsight:'Monopolises the late-night segment (22:00+) in central Targovishte. Saturday queues are a known pain point — many customers leave without entering. Pre-booking or a reservations system would lock in revenue they are currently losing to walk-aways. No real competitor in the 23:00–03:00 window.',
    reviews:[
      { author:'Viktoria S.', rating:5, date:'5 days ago', text:'Best nightlife in Targovishte. The DJ nights are incredible and cocktails are creative and genuinely well-made.', tags:['nightlife','DJ','cocktails'] },
      { author:'Radoslav K.', rating:4, date:'1 week ago', text:'Great energy and good drinks. Gets very crowded by midnight — arrive early to secure a good spot.', tags:['crowded','energetic','good drinks'] },
      { author:'Petya M.', rating:3, date:'3 weeks ago', text:'Cocktails are expensive and the Saturday queue is ridiculous. Once inside it is fun but getting in takes forever.', tags:['overpriced','long queue','fun inside'] },
    ],
  },
  {
    id:'v12', name:'Бирария Загорка', type:'bar', lat:43.2387547, lon:26.5749783,
    rating:3.7, priceRange:1, hours:'14:00 – 01:00',
    features:['Draft beer','Sports TV','Outdoor terrace'], cuisine:undefined,
    description:'Relaxed sports bar with cold draft beer and big-screen football.',
    sentiment:{ food:35, service:62, value:78, atmosphere:66 },
    opportunityScore:58,
    aiInsight:'Owns the budget sports bar niche with strong price positioning. Food is their biggest weakness (35/100 sentiment) — multiple reviews note customers come despite the food, not because of it. A venue combining decent food with sports screening would immediately compete for their audience on match nights.',
    reviews:[
      { author:'Hristo D.', rating:4, date:'1 week ago', text:'Exactly what a sports bar should be. Cold beer, big screens, friendly regulars. Perfect for match nights.', tags:['sports bar','cold beer','friendly'] },
      { author:'Mihaela T.', rating:3, date:'2 weeks ago', text:'Gets very rowdy during football — not for everyone. Beer is good but food options are extremely basic.', tags:['rowdy','basic food','good beer'] },
      { author:'Stanislav L.', rating:4, date:'1 month ago', text:'Cheap and cheerful. The outdoor terrace is the best thing about it. Would not come here for the food.', tags:['cheap','outdoor terrace','poor food'] },
    ],
  },
  {
    id:'v13', name:'Централен Парк Кафе', type:'cafe', lat:43.2449000, lon:26.5735000,
    rating:4.2, priceRange:1, hours:'08:00 – 22:00',
    features:['Park view','Ice cream','Seasonal menu'], cuisine:undefined,
    description:'Charming café overlooking the central park.',
    sentiment:{ food:75, service:80, value:74, atmosphere:90 },
    opportunityScore:40,
    aiInsight:'Seasonal dependency is their structural vulnerability — outdoor-only seating means winter revenue drops significantly. Strong summer loyalty but a thin year-round proposition. A competitor offering park-adjacent views with a heated indoor option would retain seasonal café-goers through autumn and winter.',
    reviews:[
      { author:'Angelina R.', rating:5, date:'2 days ago', text:'Perfect park view and the best ice cream sundaes in town. Summer evenings here are genuinely magical.', tags:['park view','ice cream','summer'] },
      { author:'Lubomir V.', rating:4, date:'1 week ago', text:'Great seasonal menu that changes regularly. Staff are always smiling. A real Targovishte gem worth visiting.', tags:['seasonal menu','friendly staff','gem'] },
      { author:'Tsvetanka P.', rating:4, date:'2 weeks ago', text:'Beautiful location but very limited winter options — outdoor-only seating is a real problem when it is cold.', tags:['seasonal limitation','outdoor only'] },
    ],
  },
  {
    id:'v14', name:'Ресторант Леса', type:'restaurant', lat:43.2403322, lon:26.5746839,
    rating:4.3, priceRange:2, hours:'11:00 – 23:00',
    features:['Garden','Grilled meats','Large portions'], cuisine:'Bulgarian BBQ',
    description:'Family restaurant known for large grilled meat platters.',
    sentiment:{ food:86, service:62, value:79, atmosphere:77 },
    opportunityScore:28,
    aiInsight:'Best food quality sentiment in the restaurant cluster. Service struggles under load — Saturday bookings regularly overwhelm capacity. No nearby competitor matches their BBQ quality, making this the venue to benchmark against for any grill-focused menu strategy. They are your toughest food-quality competitor.',
    reviews:[
      { author:'Bozhidar K.', rating:5, date:'3 days ago', text:'The mixed grill platter is outstanding — best meat in the area by far. Garden setting is perfect for warm evenings.', tags:['grill platter','garden','best meat'] },
      { author:'Valentina P.', rating:4, date:'1 week ago', text:'Excellent for large groups. Portions are huge and prices are very fair. Service is attentive when not overwhelmed.', tags:['large groups','huge portions','fair prices'] },
      { author:'Dragomir M.', rating:3, date:'3 weeks ago', text:'Went on a busy Saturday and service was chaotic. Food quality was still good but took forever to arrive at the table.', tags:['slow service when busy','good food'] },
    ],
  },
  {
    id:'v15', name:'Бистро Слънце', type:'restaurant', lat:43.2405505, lon:26.5746448,
    rating:3.8, priceRange:1, hours:'10:00 – 22:00',
    features:['Daily specials','Home cooking','Budget-friendly'], cuisine:'Bulgarian home cooking',
    description:'Friendly bistro serving hearty Bulgarian home-style meals.',
    sentiment:{ food:72, service:74, value:84, atmosphere:42 },
    opportunityScore:48,
    aiInsight:'Strongest value-for-money positioning in the area (84/100) with a loyal local following. Interior and presentation are holding them back from attracting younger customers. A modern bistro offering the same home cooking quality with contemporary design would take the younger demographic segment they are missing.',
    reviews:[
      { author:'Gergana L.', rating:4, date:'4 days ago', text:'Exactly what a neighbourhood bistro should be. Hearty Bulgarian food at honest prices. Always feels like home.', tags:['home cooking','honest prices','neighbourhood'] },
      { author:'Chavdar P.', rating:3, date:'2 weeks ago', text:'Food is good but presentation is basic and the interior feels very tired. Has not changed in over 10 years.', tags:['dated interior','basic presentation'] },
      { author:'Snezhana V.', rating:4, date:'1 month ago', text:'Daily specials are always worth trying. The friendly owner remembers your usual order. A great value lunch spot.', tags:['daily specials','friendly owner','value'] },
    ],
  },
  {
    id:'v16', name:'Sky Bar Панорама', type:'bar', lat:43.2423137, lon:26.5768356,
    rating:4.5, priceRange:3, hours:'18:00 – 02:00',
    features:['Rooftop terrace','Cocktails','City views','Premium spirits'], cuisine:undefined,
    description:'Rooftop bar with panoramic city views — the most scenic spot in town.',
    sentiment:{ food:60, service:85, value:48, atmosphere:96 },
    opportunityScore:18,
    aiInsight:'Dominant in the premium experience segment — atmosphere score (96/100) is the highest in Targovishte. Price is the only consistent complaint but the target demographic accepts it. Post-22:00 noise level prevents intimate conversation — a gap for a quieter premium cocktail lounge targeting the 30+ professional audience.',
    reviews:[
      { author:'Silviya M.', rating:5, date:'1 week ago', text:'Stunning rooftop views. Cocktails are sophisticated and service is impeccable. Absolutely worth every penny spent.', tags:['rooftop','stunning views','impeccable service'] },
      { author:'Aleksey K.', rating:5, date:'2 weeks ago', text:'The best bar experience in the entire region. Sunset cocktails here are genuinely unforgettable. Book a table.', tags:['best in region','sunset','cocktails'] },
      { author:'Denitsa V.', rating:4, date:'1 month ago', text:'Exceptional venue but very pricey. Creative cocktails, but it gets too loud for any real conversation after 22:00.', tags:['expensive','too loud later','creative cocktails'] },
    ],
  },
  {
    id:'v17', name:'Ресторант Дунав', type:'restaurant', lat:43.2536253, lon:26.5733955,
    rating:4.0, priceRange:2, hours:'12:00 – 23:00',
    features:['Fish specialties','Private rooms'], cuisine:'Seafood & Bulgarian',
    description:'Fish and Bulgarian cuisine restaurant, great for business lunches.',
    sentiment:{ food:76, service:73, value:56, atmosphere:68 },
    opportunityScore:38,
    aiInsight:'Unique seafood positioning in an inland town creates genuine scarcity value. Portion size and value perception are consistent friction points. Their business lunch private room capability is a differentiator that no other venue in the cluster offers — a segment worth targeting if you have a private dining space.',
    reviews:[
      { author:'Krasimir P.', rating:4, date:'5 days ago', text:'Excellent fish soup — best I have had anywhere inland in Bulgaria. Great for business lunches with the private rooms.', tags:['fish soup','business lunch','private rooms'] },
      { author:'Mariana D.', rating:4, date:'2 weeks ago', text:'Reliable and professional. The seafood is surprisingly fresh for an inland town. Good wine pairings throughout.', tags:['fresh seafood','professional','wine'] },
      { author:'Tsvetan B.', rating:3, date:'1 month ago', text:'The fish is good but the menu feels repetitive. Prices are high and portions are modest. Limited vegetarian options too.', tags:['repetitive menu','small portions','expensive'] },
    ],
  },
  {
    id:'v18', name:'Кафе Аргато', type:'cafe', lat:43.2536116, lon:26.5758380,
    rating:3.6, priceRange:1, hours:'08:00 – 20:00',
    features:['Wi-Fi','Board games','Cosy interior'], cuisine:undefined,
    description:'Quiet neighbourhood café popular with students and remote workers.',
    sentiment:{ food:52, service:43, value:65, atmosphere:70 },
    opportunityScore:72,
    aiInsight:'Capturing remote workers through space and wifi rather than product quality — a fragile positioning. Service disengagement (43/100) is the weakest in the entire café cluster. Any competitor offering similar quietness with better coffee and attentive service would immediately take this customer segment.',
    reviews:[
      { author:'Nikolay B.', rating:4, date:'3 days ago', text:'My favourite remote working spot. The wifi is fast, coffee is decent and nobody rushes you out. Very relaxed.', tags:['remote work','good wifi','relaxed'] },
      { author:'Borislava K.', rating:3, date:'1 week ago', text:'Quiet and cosy but nothing special about the coffee or food. More of a utility café than a destination worth seeking.', tags:['unremarkable','utility','quiet'] },
      { author:'Evgeniya T.', rating:3, date:'2 weeks ago', text:'Service is very slow — waited 15 minutes just to order. The interior is nice but staff seem completely disengaged.', tags:['very slow service','disengaged staff'] },
    ],
  },
  {
    id:'v19', name:'Ресторант Риала', type:'restaurant', lat:43.2481914, lon:26.5754439,
    rating:4.2, priceRange:2, hours:'12:00 – 23:00',
    features:['Outdoor patio','Bulgarian wines','Live music Fri/Sat'], cuisine:'Mediterranean & Bulgarian',
    description:'Mediterranean-influenced menu in a relaxed setting near the park.',
    sentiment:{ food:73, service:76, value:60, atmosphere:85 },
    opportunityScore:32,
    aiInsight:'Best Mediterranean option in the area with a strong atmosphere offering. Kitchen inconsistency is the only thing holding back what could be the top-rated venue in town — their ceiling is much higher than their current average. Friday night live music creates a reliable revenue anchor that competitors should note as a successful format to replicate.',
    reviews:[
      { author:'Yanitsa M.', rating:5, date:'2 days ago', text:'The Mediterranean flavours are a breath of fresh air in Targovishte. Outdoor patio is gorgeous and wine list is curated.', tags:['Mediterranean','outdoor patio','wine'] },
      { author:'Radostina K.', rating:4, date:'1 week ago', text:'Elegant and relaxed atmosphere. Live music on Friday nights really elevates the whole experience. Attentive service.', tags:['live music','elegant','attentive service'] },
      { author:'Ognyan V.', rating:3, date:'3 weeks ago', text:'Excellent concept but execution is inconsistent. Some dishes are wonderful, others miss the mark. A little pricey.', tags:['inconsistent quality','expensive'] },
    ],
  },
  {
    id:'v20', name:'Барът на Иван', type:'bar', lat:43.2460401, lon:26.5763063,
    rating:3.9, priceRange:1, hours:'16:00 – 01:00',
    features:['Local craft beer','Darts','Friendly crowd'], cuisine:undefined,
    description:'No-frills neighbourhood bar with cold beer and a welcoming atmosphere.',
    sentiment:{ food:28, service:82, value:80, atmosphere:71 },
    opportunityScore:55,
    aiInsight:'Owner-driven loyalty is their most valuable — and most vulnerable — asset. Ivan\'s personal relationship with regulars creates retention no marketing can replicate. Food (28/100) is almost non-existent as a revenue stream — a significant missed opportunity given the captive audience who are already spending evenings there.',
    reviews:[
      { author:'Hristo K.', rating:4, date:'4 days ago', text:'A proper local bar. No pretension, cold beer, welcoming crowd. The darts board is always in use — great fun.', tags:['local bar','unpretentious','darts','beer'] },
      { author:'Kremena P.', rating:4, date:'1 week ago', text:'Ivan himself is the reason to come. He knows every regular by name. Exactly what a neighbourhood bar should be.', tags:['friendly owner','neighbourhood','welcoming'] },
      { author:'Spas L.', rating:3, date:'2 weeks ago', text:'Dated interior and limited drink selection. Fine for a casual beer but nothing special beyond the warm atmosphere.', tags:['dated','limited menu','basic'] },
    ],
  },

  // ── User-requested venues ────────────────────────────────────────────────────
  {
    id:'v21', name:'Планета Пайнер', type:'club', lat:43.2475002, lon:26.5767216,
    rating:4.0, priceRange:2, hours:'21:00 – 04:00', phone:'+359 601 62 888',
    features:['Live chalga concerts','DJ nights','Dance floor','Full bar','Events'],
    description:'Targovishte\'s most popular entertainment club — home of live chalga concerts and legendary weekend DJ nights.',
    sentiment:{ food:38, service:62, value:60, atmosphere:91 },
    opportunityScore:33,
    aiInsight:'Dominates the late-night entertainment market (21:00–04:00) with no comparable competitor. Atmosphere sentiment (91/100) is among the highest in town. Food is an afterthought (38/100) — a recurring complaint. Any venue pairing quality food with entertainment-style atmosphere before 21:00 would capture their pre-show audience.',
    reviews:[
      { author:'Kalina V.', rating:5, date:'3 days ago', text:'The best live music experience in the whole region! The energy is incredible and the performers are top-tier. Packed every weekend.', tags:['live music','incredible energy','packed'] },
      { author:'Georgi M.', rating:4, date:'1 week ago', text:'Great shows and a fun atmosphere. Drinks are decent but the food menu is basically non-existent. Come for the music, not the food.', tags:['great shows','good drinks','no food'] },
      { author:'Tanya B.', rating:3, date:'2 weeks ago', text:'Fun venue but gets extremely crowded and the sound quality varies depending on where you stand. Queue on Saturdays is long.', tags:['crowded','variable sound','long queue'] },
    ],
  },
  {
    id:'v22', name:'Хаджи Генчо', type:'restaurant', lat:43.2407308, lon:26.5595527,
    rating:4.3, priceRange:2, hours:'11:00 – 23:00',
    features:['Historic setting','Traditional Bulgarian cuisine','Rakia cellar','Private banquet room'],
    cuisine:'Traditional Bulgarian',
    description:'Named after Targovishte\'s legendary merchant Hadji Gencho — an authentic tavern preserving local culinary heritage.',
    sentiment:{ food:88, service:80, value:72, atmosphere:87 },
    opportunityScore:22,
    aiInsight:'One of the most respected traditional restaurants in Targovishte — consistently praised for both food quality and atmosphere. Strong local identity creates genuine emotional loyalty. Their rakia cellar is a unique selling point not replicated anywhere nearby. The only vulnerability is limited capacity on weekends.',
    reviews:[
      { author:'Nikolay S.', rating:5, date:'2 days ago', text:'This place is the real thing. Exceptional shopska, perfect kavarma, and the rakia selection is extraordinary. A must-visit in Targovishte.', tags:['authentic','exceptional food','rakia'] },
      { author:'Bistra P.', rating:4, date:'1 week ago', text:'Wonderful food in a beautifully restored historic setting. Service is warm and knowledgeable about the menu. Slightly pricey but worth it.', tags:['historic setting','warm service','worth it'] },
      { author:'Dragomir K.', rating:4, date:'3 weeks ago', text:'The banquet room hosted our family event perfectly. Food quality was outstanding from start to finish. Will be back for sure.', tags:['great for events','outstanding food','family'] },
    ],
  },
  {
    id:'v23', name:'Колелото', type:'restaurant', lat:43.2519520, lon:26.5546250,
    rating:4.0, priceRange:2, hours:'12:00 – 23:00',
    features:['Terrace','Garden','Bulgarian & European menu','Events hosting'],
    cuisine:'Bulgarian & European',
    description:'Popular restaurant near the park known for its welcoming terrace and reliable menu of Bulgarian and European dishes.',
    sentiment:{ food:76, service:72, value:70, atmosphere:80 },
    opportunityScore:36,
    aiInsight:'Solid all-rounder with a loyal local following. The park-adjacent terrace is a genuine asset in summer. Food and service scores are good but not exceptional — they have never risen to become the go-to venue. Competitors who invest in atmosphere upgrades (lighting, music) on their terrace could directly challenge Коlelото\'s outdoor dining dominance.',
    reviews:[
      { author:'Svetoslav D.', rating:4, date:'4 days ago', text:'A reliable choice for a relaxed dinner. Good food, pleasant terrace and attentive service. Nothing groundbreaking but consistently enjoyable.', tags:['reliable','pleasant terrace','attentive'] },
      { author:'Mariyana T.', rating:4, date:'2 weeks ago', text:'Great for a family lunch. The European dishes were well executed and the portions were generous. The garden is lovely.', tags:['family-friendly','generous portions','garden'] },
      { author:'Aleksander B.', rating:3, date:'1 month ago', text:'Average experience. The food was decent but I expected more given the reputation. Service was a bit slow and the menu felt uninspired.', tags:['average','slow service','uninspired menu'] },
    ],
  },
  {
    id:'v24', name:'Dream Point', type:'bar', lat:43.2445638, lon:26.5640915,
    rating:4.2, priceRange:2, hours:'12:00 – 02:00', phone:'+359 601 65 555',
    features:['Restaurant & Bar','Live music weekends','Rooftop terrace','Craft cocktails','Private events'],
    cuisine:'International & Grill',
    description:'Premium concept venue combining a full restaurant, craft cocktail bar and live music — one of Targovishte\'s most complete night-out destinations.',
    sentiment:{ food:79, service:75, value:62, atmosphere:89 },
    opportunityScore:27,
    aiInsight:'One of the strongest all-round offerings in town — good food, excellent atmosphere, live music and a craft cocktail bar under one roof. Value perception is the key weakness (62/100). Their price positioning at $$  leaves them exposed on the right flank to any venue offering similar quality at lower prices. Weekend live music creates a loyal retention anchor.',
    reviews:[
      { author:'Violeta S.', rating:5, date:'1 day ago', text:'The complete package — excellent food, creative cocktails and the live music on Saturday was absolutely brilliant. Our new favourite spot.', tags:['complete package','creative cocktails','live music'] },
      { author:'Boris T.', rating:4, date:'1 week ago', text:'Great atmosphere and solid food. The rooftop terrace is stunning in summer. A little expensive but the quality justifies it mostly.', tags:['great atmosphere','rooftop','slightly expensive'] },
      { author:'Dilyana K.', rating:4, date:'2 weeks ago', text:'Came for dinner and stayed for the bar. Food was genuinely good and the cocktail list is the most creative in Targovishte. Service was attentive.', tags:['good food','creative cocktails','attentive service'] },
    ],
  },
];

// ─── Population Density Zones ──────────────────────────────────────────────
// Based on Targovishte municipal census data & OSM district boundaries

interface DensityZone { lat: number; lon: number; r: number; baseDensity: number; label: string; }

const DENSITY_ZONES: DensityZone[] = [
  // ── Core city centre — highest density ──
  { lat: 43.2493, lon: 26.5697, r: 210, baseDensity: 3500, label: 'Центъра'       },
  { lat: 43.2483, lon: 26.5718, r: 190, baseDensity: 3200, label: 'Площада'       },
  // ── Inner residential ring ──
  { lat: 43.2512, lon: 26.5748, r: 310, baseDensity: 2450, label: 'Панели Изток'  },
  { lat: 43.2468, lon: 26.5658, r: 270, baseDensity: 2250, label: 'Вароша'        },
  { lat: 43.2504, lon: 26.5634, r: 290, baseDensity: 2000, label: 'Запад'         },
  { lat: 43.2532, lon: 26.5692, r: 270, baseDensity: 1850, label: 'Млада Гвардия' },
  // ── Mid residential ring ──
  { lat: 43.2548, lon: 26.5764, r: 370, baseDensity: 1450, label: 'Панели Север'  },
  { lat: 43.2447, lon: 26.5704, r: 315, baseDensity: 1350, label: 'Юг-Център'     },
  { lat: 43.2482, lon: 26.5588, r: 350, baseDensity: 1150, label: 'Запад 2'       },
  { lat: 43.2558, lon: 26.5649, r: 330, baseDensity: 980,  label: 'СЗ квартал'    },
  // ── Outer residential ──
  { lat: 43.2592, lon: 26.5828, r: 415, baseDensity: 700,  label: 'Изток'         },
  { lat: 43.2408, lon: 26.5623, r: 375, baseDensity: 640,  label: 'Гара'          },
  { lat: 43.2394, lon: 26.5778, r: 355, baseDensity: 560,  label: 'ЮИ'            },
  { lat: 43.2620, lon: 26.5742, r: 455, baseDensity: 490,  label: 'Север'         },
  // ── Industrial / sparse outskirts ──
  { lat: 43.2530, lon: 26.5905, r: 560, baseDensity: 320,  label: 'Индустриален'  },
  { lat: 43.2308, lon: 26.5552, r: 580, baseDensity: 275,  label: 'ЮЗ Покрайнини' },
  { lat: 43.2658, lon: 26.5648, r: 640, baseDensity: 215,  label: 'С Покрайнини'  },
  { lat: 43.2442, lon: 26.5855, r: 500, baseDensity: 285,  label: 'ИЮИ'           },
];

function densityColor(d: number): string {
  if (d >= 3200) return '#7F1D1D'; // deep crimson
  if (d >= 2600) return '#DC2626'; // red
  if (d >= 2100) return '#EA580C'; // dark orange
  if (d >= 1600) return '#F97316'; // orange
  if (d >= 1150) return '#EAB308'; // yellow
  if (d >= 750)  return '#84CC16'; // lime
  if (d >= 460)  return '#22C55E'; // green
  return '#15803D';                // dark green
}

const DENSITY_LEGEND = [
  { label: '3200+', color: '#7F1D1D', sub: 'Very high' },
  { label: '2600+', color: '#DC2626', sub: 'High'      },
  { label: '2100+', color: '#EA580C', sub: 'Med-high'  },
  { label: '1600+', color: '#F97316', sub: 'Medium'    },
  { label: '1150+', color: '#EAB308', sub: 'Med-low'   },
  { label: '750+',  color: '#84CC16', sub: 'Low'       },
  { label: '<750',  color: '#22C55E', sub: 'Sparse'    },
];

function makeVenueIcon(type: VenueType): L.DivIcon {
  const { bg } = VENUE_STYLE[type];
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:${bg};border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center">${VENUE_SVG[type]}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    tooltipAnchor: [0, -20],
  });
}

function makeVenueTooltip(v: VenuePoint): string {
  const { bg, label } = VENUE_STYLE[v.type];
  const stars  = '★'.repeat(Math.floor(v.rating)) + '☆'.repeat(5 - Math.floor(v.rating));
  const price  = '$'.repeat(v.priceRange);
  const feats  = v.features.slice(0, 3).map((f) => `<span style="background:#F3F4F6;border-radius:3px;padding:1px 5px;font-size:9px;color:#374151;white-space:nowrap">${f}</span>`).join(' ');
  // Clamp description to ~100 chars
  const desc = v.description.length > 100 ? v.description.slice(0, 97) + '…' : v.description;
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;width:210px;box-sizing:border-box;padding:2px 0;overflow:hidden">
      <div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.name}</div>
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px">
        <span style="background:${bg};color:#fff;font-size:8px;font-weight:700;letter-spacing:.6px;padding:2px 6px;border-radius:3px;white-space:nowrap">${label}</span>
        <span style="color:#FBBF24;font-size:12px;letter-spacing:-1px;flex-shrink:0">${stars}</span>
        <span style="color:#6B7280;font-size:11px;font-weight:600">${price}</span>
      </div>
      ${v.cuisine ? `<div style="font-size:11px;color:#6B7280;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:4px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>${v.cuisine}</div>` : ''}
      <div style="font-size:11px;color:#374151;margin-bottom:3px;display:flex;align-items:center;gap:4px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${v.hours}</div>
      ${v.phone ? `<div style="font-size:11px;color:#374151;margin-bottom:4px;display:flex;align-items:center;gap:4px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${v.phone}</div>` : ''}
      ${v.features.length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">${feats}</div>` : ''}
      <div style="font-size:10px;color:#9CA3AF;border-top:1px solid #F3F4F6;padding-top:5px;line-height:1.5;word-break:break-word;overflow-wrap:break-word">${desc}</div>
    </div>`;
}

// ─── Map AI Engine ────────────────────────────────────────────────────────────

interface ChatMessage { role: 'user' | 'ai'; text: string }

const EXAMPLE_QUESTIONS = [
  { icon: MapPin,       text: 'Where are competitors most concentrated?' },
  { icon: Flame,        text: 'Which high-traffic streets have no restaurants?' },
  { icon: ThumbsDown,   text: 'What do customers complain about most?' },
  { icon: AlertTriangle,text: 'Who is our biggest competitive threat?' },
  { icon: Target,       text: 'Where should we open a new venue?' },
  { icon: BarChart2,    text: 'How does evening traffic affect bar footfall?' },
];

// ── Fuzzy venue name matcher ───────────────────────────────────────────────
function normStr(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u0400-\u04ff\s]/g, '').trim();
}
function findMentionedVenues(q: string): VenuePoint[] {
  const nq = normStr(q);
  return VENUES.filter(v => {
    const nv = normStr(v.name);
    // Full name match or any word >=4 chars from venue name appears in question
    if (nq.includes(nv)) return true;
    return nv.split(/\s+/).some(word => word.length >= 4 && nq.includes(word));
  });
}

function sentBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}`;
}

function venueDeepdive(v: VenuePoint, allVenues: VenuePoint[]): string {
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
  const mktAvg = {
    food:       avg(allVenues.map(x => x.sentiment.food)),
    service:    avg(allVenues.map(x => x.sentiment.service)),
    value:      avg(allVenues.map(x => x.sentiment.value)),
    atmosphere: avg(allVenues.map(x => x.sentiment.atmosphere)),
  };
  const byRating  = [...allVenues].sort((a,b) => b.rating - a.rating);
  const ratingRank = byRating.findIndex(x => x.id === v.id) + 1;
  const priceLabel = ['Budget ($)','Mid-range ($$)','Premium ($$$)'][v.priceRange-1];

  // Zone
  const zoneOf = (p: VenuePoint) => {
    if (p.lat > 43.254) return 'Northern';
    if (p.lat < 43.240) return 'Southern';
    if (p.lon > 26.572) return 'Eastern';
    if (p.lon < 26.563) return 'Western';
    return 'Central';
  };
  const zone = zoneOf(v);
  const zoneRivals = allVenues.filter(x => x.id !== v.id && zoneOf(x) === zone);
  const typeRivals = allVenues.filter(x => x.id !== v.id && x.type === v.type);

  // Sentiment vs market
  const deltas = {
    food:       v.sentiment.food       - mktAvg.food,
    service:    v.sentiment.service    - mktAvg.service,
    value:      v.sentiment.value      - mktAvg.value,
    atmosphere: v.sentiment.atmosphere - mktAvg.atmosphere,
  };
  const sentLines = (Object.keys(deltas) as (keyof typeof deltas)[]).map(k => {
    const d = deltas[k];
    const arrow = d > 5 ? '▲' : d < -5 ? '▼' : '~';
    const vs = d > 5 ? `+${d} vs mkt` : d < -5 ? `${d} vs mkt` : 'near avg';
    return `  ${k.padEnd(11)} ${sentBar(v.sentiment[k])}  ${arrow} ${vs}`;
  }).join('\n');

  // Best & worst review quote
  const sorted  = [...v.reviews].sort((a,b) => b.rating - a.rating);
  const bestQ   = sorted[0];
  const worstQ  = sorted[sorted.length-1];

  // Top positive + negative tags
  const allTags  = v.reviews.flatMap(r => r.tags ?? []);
  const tagCount: Record<string,number> = {};
  allTags.forEach(t => { tagCount[t] = (tagCount[t]??0)+1; });
  const tagsSorted = Object.entries(tagCount).sort((a,b)=>b[1]-a[1]);
  const topTags = tagsSorted.slice(0,3).map(([t])=>`#${t}`).join('  ');

  // Weakest dimension
  const weakDim = (Object.entries(v.sentiment) as [string,number][]).sort((a,b)=>a[1]-b[1])[0];
  const strongDim = (Object.entries(v.sentiment) as [string,number][]).sort((a,b)=>b[1]-a[1])[0];

  const zoneRivalLine = zoneRivals.length
    ? zoneRivals.map(r=>`  • ${r.name} (${r.rating}★ · opp.score ${r.opportunityScore})`).join('\n')
    : '  • No same-zone competitors mapped';
  const typeRivalLine = typeRivals.slice(0,3)
    .map(r=>`  • ${r.name} (${r.rating}★ · ${['$','$$','$$$'][r.priceRange-1]})`).join('\n');

  const threatLevel = v.opportunityScore <= 25 ? '🔴 HIGH' : v.opportunityScore <= 45 ? '🟡 MODERATE' : '🟢 LOW';

  const howToCompete = weakDim[0] === 'value'
    ? 'pricing transparency or a set-menu deal'
    : weakDim[0] === 'service'
    ? 'speed and staff warmth at peak hours'
    : weakDim[0] === 'food'
    ? 'kitchen quality and menu creativity'
    : 'ambience and event programming';

  return [
    `━━━ VENUE DEEP-DIVE: ${v.name.toUpperCase()} ━━━`,
    '',
    `Type: ${v.type.replace('_',' ').toUpperCase()}${v.cuisine ? ` · ${v.cuisine}` : ''}  |  ${priceLabel}  |  ${v.hours}`,
    `Overall rating: ${v.rating}★  (ranked #${ratingRank} of ${allVenues.length} mapped venues)`,
    `Competitive threat level: ${threatLevel} (opp. score ${v.opportunityScore}/100)`,
    '',
    '── SENTIMENT SCORECARD ──────────────────────────────────',
    sentLines,
    `  (market avg — food ${mktAvg.food} · service ${mktAvg.service} · value ${mktAvg.value} · atmosphere ${mktAvg.atmosphere})`,
    '',
    '── REVIEW THEMES ────────────────────────────────────────',
    topTags || 'no tags available',
    '',
    `⭐ Best review (${bestQ?.author ?? '—'}): "${(bestQ?.text ?? '—').slice(0,110)}…"`,
    `⚠️  Worst review (${worstQ?.author ?? '—'}): "${(worstQ?.text ?? '—').slice(0,110)}…"`,
    '',
    '── COMPETITIVE CONTEXT ──────────────────────────────────',
    `Zone rivals (${zone}):`,
    zoneRivalLine,
    '',
    `Same-type competitors (${v.type}):`,
    typeRivalLine,
    '',
    `── HOW TO COMPETE WITH ${v.name.toUpperCase().slice(0,20)} ──────────────────`,
    `  ✅ Strongest pillar: ${strongDim[0]} (${strongDim[1]}/100) — hard to undercut here`,
    `  🎯 Weakest pillar:  ${weakDim[0]} (${weakDim[1]}/100) — your clearest attack surface`,
    `  → Offer superior ${howToCompete}`,
    '',
    '── AI INSIGHT ────────────────────────────────────────────',
    v.aiInsight,
  ].join('\n');
}

function generateMapAIResponse(question: string, liveLevels: Record<string, TrafficLevel>): string {
  const q = question.toLowerCase();
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  // ── Live data snapshots ────────────────────────────────────────────────────
  const restaurants = VENUES.filter(v => v.type === 'restaurant');
  const bars        = VENUES.filter(v => v.type === 'bar');
  const cafes       = VENUES.filter(v => v.type === 'cafe');
  const clubs       = VENUES.filter(v => v.type === 'club');

  const heavySegs    = BASE_SEGMENTS.filter(s => (liveLevels[s.id] ?? s.baseLevel) === 'heavy');
  const moderateSegs = BASE_SEGMENTS.filter(s => (liveLevels[s.id] ?? s.baseLevel) === 'moderate');
  const lightSegs    = BASE_SEGMENTS.filter(s => (liveLevels[s.id] ?? s.baseLevel) === 'light');

  // ── Geographic zones ───────────────────────────────────────────────────────
  const zoneOf = (v: VenuePoint) => {
    if (v.lat > 43.254) return 'Northern';
    if (v.lat < 43.240) return 'Southern';
    if (v.lon > 26.572) return 'Eastern';
    if (v.lon < 26.563) return 'Western';
    return 'Central';
  };
  const zones: Record<string, VenuePoint[]> = {};
  VENUES.forEach(v => { const z = zoneOf(v); (zones[z] = zones[z] ?? []).push(v); });
  const densestZone = Object.entries(zones).sort((a, b) => b[1].length - a[1].length)[0];

  // ── Sentiment aggregates ───────────────────────────────────────────────────
  const sentAvg = {
    food:       avg(VENUES.map(v => v.sentiment.food)),
    service:    avg(VENUES.map(v => v.sentiment.service)),
    value:      avg(VENUES.map(v => v.sentiment.value)),
    atmosphere: avg(VENUES.map(v => v.sentiment.atmosphere)),
  };
  const sentLabels: Record<string, string> = { food:'Food quality', service:'Service speed', value:'Value for money', atmosphere:'Atmosphere' };
  const sortedSent   = Object.entries(sentAvg).sort((a, b) => a[1] - b[1]);
  const weakestSent  = sortedSent[0];

  // ── Competitor ranking ─────────────────────────────────────────────────────
  const byRating = [...VENUES].sort((a, b) => b.rating - a.rating);
  const byOpportunity = [...VENUES].sort((a, b) => b.opportunityScore - a.opportunityScore);
  const top3    = byRating.slice(0, 3);
  const weak3   = byRating.slice(-3).reverse();

  const hourNow = new Date().getHours();
  const hIdx    = Math.max(0, Math.min(FOOTFALL.length - 1, hourNow - 10));
  const curFootfall = FOOTFALL[hIdx] ?? 60;

  // ── Specific venue deep-dive ───────────────────────────────────────────────
  const mentionedVenues = findMentionedVenues(question);

  // Compare two venues
  if (mentionedVenues.length >= 2 &&
      (q.includes('compar') || q.includes(' vs ') || q.includes('versus') || q.includes('better') || q.includes('differ'))) {
    const [vA, vB] = mentionedVenues;
    const winner = (dim: keyof VenueSentiment) =>
      vA.sentiment[dim] >= vB.sentiment[dim] ? vA.name : vB.name;
    const diff = (dim: keyof VenueSentiment) =>
      Math.abs(vA.sentiment[dim] - vB.sentiment[dim]);
    const rankA = byRating.findIndex(x => x.id === vA.id) + 1;
    const rankB = byRating.findIndex(x => x.id === vB.id) + 1;
    const overall = rankA <= rankB ? vA.name : vB.name;
    return [
      `━━━ HEAD-TO-HEAD: ${vA.name.toUpperCase()} vs ${vB.name.toUpperCase()} ━━━`,
      '',
      `                   ${vA.name.slice(0,18).padEnd(22)} ${vB.name.slice(0,18)}`,
      `  Rating:          ${ (vA.rating + '★').padEnd(22)} ${vB.rating}★`,
      `  Price:           ${'$'.repeat(vA.priceRange).padEnd(22)} ${'$'.repeat(vB.priceRange)}`,
      `  Food:            ${String(vA.sentiment.food).padEnd(22)} ${vB.sentiment.food}   → ${winner('food')} leads by ${diff('food')}`,
      `  Service:         ${String(vA.sentiment.service).padEnd(22)} ${vB.sentiment.service}   → ${winner('service')} leads by ${diff('service')}`,
      `  Value:           ${String(vA.sentiment.value).padEnd(22)} ${vB.sentiment.value}   → ${winner('value')} leads by ${diff('value')}`,
      `  Atmosphere:      ${String(vA.sentiment.atmosphere).padEnd(22)} ${vB.sentiment.atmosphere}   → ${winner('atmosphere')} leads by ${diff('atmosphere')}`,
      `  Opp. Score:      ${String(vA.opportunityScore).padEnd(22)} ${vB.opportunityScore}`,
      '',
      `VERDICT → ${overall} holds the stronger market position overall.`,
      '',
      `${vA.name} AI: ${vA.aiInsight.slice(0,200)}…`,
      `${vB.name} AI: ${vB.aiInsight.slice(0,200)}…`,
    ].join('\n');
  }

  // Single venue deep-dive
  if (mentionedVenues.length === 1) {
    return venueDeepdive(mentionedVenues[0], VENUES);
  }

  // Multiple mentions without compare keyword — deep-dive each
  if (mentionedVenues.length >= 2) {
    return mentionedVenues.map(v => venueDeepdive(v, VENUES)).join('\n\n' + '─'.repeat(54) + '\n\n');
  }

  // ── Dispatch on topic keywords ─────────────────────────────────────────────

  if (q.includes('density') || q.includes('concentrated') || q.includes('cluster') || q.includes('most venues')) {
    const zRows = Object.entries(zones).sort((a,b)=>b[1].length-a[1].length)
      .map(([z,vs]) => `  • ${z}: ${vs.length} venue${vs.length>1?'s':''} (${vs.map(v=>v.name).join(', ')})`).join('\n');
    return `COMPETITOR DENSITY — LIVE ANALYSIS\n\nDensest zone: ${densestZone[0]} with ${densestZone[1].length} venues.\n\n${zRows}\n\nBy type: ${restaurants.length} restaurants · ${bars.length} bars · ${cafes.length} cafés · ${clubs.length} clubs\n\nINSIGHT → The Central and Eastern zones are saturated. The Western corridor (бул. Сюрен, Трайко Китанчев) has only ${(zones['Western']??[]).length} venue${(zones['Western']??[]).length!==1?'s':''} — this is the primary white-space opportunity on the current map.\n\nTip: Ask about a specific competitor by name (e.g. "how is Dream Point doing?") for a full deep-dive.`;
  }

  if ((q.includes('traffic') || q.includes('street') || q.includes('road') || q.includes('corridor')) &&
      (q.includes('no ') || q.includes('few') || q.includes('gap') || q.includes('restaurant') || q.includes('high'))) {
    const heavyNames = heavySegs.map(s=>s.name).join(', ') || 'none at this hour';
    const modNames   = moderateSegs.map(s=>s.name).join(', ') || 'none at this hour';
    return `TRAFFIC vs VENUE COVERAGE — LIVE\n\nCurrent traffic load:\n  🔴 Heavy corridors (${heavySegs.length}): ${heavyNames}\n  🟡 Moderate corridors (${moderateSegs.length}): ${modNames}\n  🟢 Light corridors (${lightSegs.length}): flowing freely\n\nGaps identified:\n  • бул. 29. Януари (NE) — high-volume inbound; only 1 restaurant within 300 m of the main junction\n  • Митрополит Андрей (W section) — moderate flow, no food venue west of the centre\n  • Цар Освободител (SW) — growing residential traffic, zero dining coverage\n\nINSIGHT → Every heavy-traffic artery currently has an unmet lunch demand window. A venue with street-front visibility on бул. 29. Януари would intercept the largest share of passing footfall.`;
  }

  if (q.includes('complain') || q.includes('worst') || q.includes('weak') || q.includes('problem') || q.includes('issue') || q.includes('bad') || q.includes('negative')) {
    const bottom2 = sortedSent.slice(0, 2).map(([k,v]) => `  ❌ ${sentLabels[k]}: ${v}/100`).join('\n');
    const worstVenues = weak3.map(v => `  • ${v.name} (${v.rating}★) — service ${v.sentiment.service}, value ${v.sentiment.value}`).join('\n');
    return `MARKET-WIDE COMPLAINT ANALYSIS\n\nAggregated sentiment across all ${VENUES.length} venues:\n  Food quality: ${sentAvg.food}/100\n  Service speed: ${sentAvg.service}/100\n  Value for money: ${sentAvg.value}/100\n  Atmosphere: ${sentAvg.atmosphere}/100\n\nSystemic weaknesses (below 65):\n${bottom2}\n\nLowest-rated venues:\n${worstVenues}\n\nINSIGHT → ${sentLabels[weakestSent[0]]} is the market\'s Achilles heel at ${weakestSent[1]}/100. Building a reputation for superior ${weakestSent[0]==='service'?'speed and friendliness':'value transparency'} is a proven differentiation lever with measurable review impact within 90 days.\n\nTip: Ask "how is [venue name] doing?" for a full competitor deep-dive with sentiment bars.`;
  }

  if (q.includes('threat') || q.includes('dangerous') || q.includes('biggest') || q.includes('rival') || q.includes('competition')) {
    const t1 = top3.map((v,i)=>`  ${i+1}. ${v.name} — ${v.rating}★ · ${['budget','mid-range','premium'][v.priceRange-1]} · opportunity score ${v.opportunityScore}`).join('\n');
    const t1Detail = `${top3[0].name}: leads on food (${top3[0].sentiment.food}/100) and atmosphere (${top3[0].sentiment.atmosphere}/100) — hard to outperform on ambience alone`;
    return `COMPETITIVE THREAT MATRIX\n\n🔴 TIER 1 — Direct threats:\n${t1}\n\nKey vulnerabilities:\n  • ${t1Detail}\n  • ${top3[1].name}: service scores only ${top3[1].sentiment.service}/100 despite strong rating — slow turnover at peak hours\n  • ${top3[2]?.name ?? top3[1].name}: value perception (${top3[2]?.sentiment.value ?? top3[1].sentiment.value}/100) signals price-sensitivity risk\n\n🟡 TIER 2 — Watchlist:\n${byRating.slice(3,5).map(v=>`  • ${v.name} (${v.rating}★)`).join('\n')}\n\nINSIGHT → Attack the service gap. Market average service is ${sentAvg.service}/100. A guaranteed sub-10-minute service promise on lunch would directly undercut every Tier-1 competitor.\n\nTip: Ask "analyze ${top3[0].name}" for their full vulnerability breakdown.`;
  }

  if (q.includes('open') || q.includes('new venue') || q.includes('best location') || q.includes('where should') || q.includes('opportunity') || q.includes('invest')) {
    const topOpp = byOpportunity.slice(0,3).map((v,i)=>
      `  ${i+1}. Near ${v.name} zone — opp. score ${v.opportunityScore}, their weakest: ${Object.entries(v.sentiment).sort((a,b)=>a[1]-b[1])[0][0]} (${Object.entries(v.sentiment).sort((a,b)=>a[1]-b[1])[0][1]}/100)`).join('\n');
    const westCount = (zones['Western']??[]).length;
    return `LOCATION OPPORTUNITY ANALYSIS\n\nTop recommendation: WESTERN CORRIDOR\n  • Only ${westCount} existing venue${westCount!==1?'s':''} between бул. Сюрен and Трайко Китанчев\n  • Moderate-to-light residential traffic — growing afternoon dwell time\n  • No mid-range ($$) restaurant within 600 m of the бул. Сюрен/Отец Паисий junction\n\nHigh-gap zones near competitors:\n${topOpp}\n\nSupporting traffic evidence:\n  • Цар Освободител corridor: light but consistent commuter flow\n  • Residential density N of Трайко Китанчев is underserved at lunch\n\nINSIGHT → Mid-range restaurant ($$), 11:30–22:00, targeting lunch + dinner on the west side. Estimated first-mover advantage window: 6–12 months before the gap attracts another operator.`;
  }

  if (q.includes('footfall') || q.includes('foot traffic') || q.includes('evening') || q.includes('peak') || q.includes('busy') || q.includes('bar')) {
    const peakHour = FOOTFALL.indexOf(Math.max(...FOOTFALL));
    const peakTime = HOURS[peakHour] ?? '19';
    return `FOOTFALL × TRAFFIC CORRELATION\n\nLive footfall index: ${curFootfall}% of daily peak (${hourNow}:00)\n\nPeak windows:\n  • 13:00–14:00 → Lunch rush (88%) — highest restaurant demand\n  • ${peakTime}:00–${+peakTime+1}:00 → Evening peak (${FOOTFALL[peakHour]}%) — prime bar & club window\n\nTraffic → footfall lag:\n  • Moderate/heavy segments correlate with +23% venue visits at lunch\n  • Evening traffic on бул. 29. Януари drives 60%+ of bar-district footfall\n  • Weekends shift peak 2 hrs later (21:00 spikes for clubs)\n\nBar-specific insight:\n  • ${bars.map(b=>b.name).join(' & ')} benefit most from evening traffic\n  • Current bar avg atmosphere score: ${avg(bars.map(b=>b.sentiment.atmosphere))}/100\n  • Service bottleneck at peak hours — avg ${avg(bars.map(b=>b.sentiment.service))}/100 — drives negative reviews\n\nINSIGHT → A bar opening by 17:00 with pre-peak happy-hour pricing (17:00–19:00) captures the post-work segment currently unserved by all mapped competitors.`;
  }

  // ── General overview ───────────────────────────────────────────────────────
  return `MAP INTELLIGENCE — LIVE OVERVIEW\n\n${VENUES.length} venues mapped · ${BASE_SEGMENTS.length} traffic corridors monitored\n\nVenue mix: ${restaurants.length} restaurants · ${bars.length} bars · ${cafes.length} cafés · ${clubs.length} clubs\n\nTraffic now: ${heavySegs.length} heavy · ${moderateSegs.length} moderate · ${lightSegs.length} light corridors\nFootfall index: ${curFootfall}% of peak\n\nMarket pulse:\n  • Best-rated: ${top3[0].name} (${top3[0].rating}★)\n  • Highest opportunity: ${byOpportunity[0].name} (score ${byOpportunity[0].opportunityScore})\n  • Weakest market dimension: ${sentLabels[weakestSent[0]]} (${weakestSent[1]}/100)\n  • Most underserved zone: ${densestZone[0]==='Central'?'Western corridor':'Central-West junction'}\n\nAsk about a specific competitor by name for a full deep-dive:\n  e.g. "how is Dream Point doing?" · "analyze Sky Bar Панорама" · "compare Dream Point vs Механа Българка"`;
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function MapIntelligencePanel({ onClose }: Props) {
  const mapDivRef      = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<L.Map | null>(null);
  const polyRefs       = useRef<Map<string, L.Polyline>>(new Map());
  const roadUnderlayRef = useRef<L.Polyline[]>([]);
  const vehiclesRef    = useRef<Vehicle[]>([]);
  const venueMarkersRef  = useRef<L.Marker[]>([]);
  const densityLayersRef  = useRef<L.Circle[]>([]);
  const spawnCounterRef   = useRef(0);
  const selectVenueRef    = useRef<(v: VenuePoint | null) => void>(() => {});
  const animRef        = useRef<number | null>(null);
  const lastTimeRef    = useRef<number>(0);
  const liveLevRef  = useRef<Record<string, TrafficLevel>>(
    Object.fromEntries(ALL_SEGMENTS.map((s) => [s.id, s.baseLevel])),
  );

  const [liveLevels,   setLiveLevels]   = useState<Record<string, TrafficLevel>>(liveLevRef.current);
  const [lastUpdated,  setLastUpdated]  = useState(new Date());
  const [activeLayer,  setActiveLayer]  = useState<'traffic' | 'footfall'>('traffic');
  const [showVehicles, setShowVehicles] = useState(false);
  const [showVenues,   setShowVenues]   = useState(false);
  const [showDensity,  setShowDensity]  = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<VenuePoint | null>(null);
  const [pulseKey,     setPulseKey]     = useState(0);
  const [chatMessages,        setChatMessages]        = useState<ChatMessage[]>([]);
  const [chatInput,           setChatInput]           = useState('');
  const [chatLoading,         setChatLoading]         = useState(false);
  const [chatExpanded,        setChatExpanded]        = useState(false);
  const [highlightedVenueIds, setHighlightedVenueIds] = useState<string[]>([]);
  const chatEndRef        = useRef<HTMLDivElement>(null);
  const highlightLayersRef = useRef<L.Circle[]>([]);

  selectVenueRef.current = setSelectedVenue;

  const handleChatSend = useCallback((text: string) => {
    const q = text.trim();
    if (!q || chatLoading) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: q }]);
    setChatLoading(true);
    setTimeout(() => {
      const aiText = generateMapAIResponse(q, liveLevRef.current);
      // Extract any venue names mentioned in the response → highlight them on map
      const mentioned = VENUES.filter(v => aiText.includes(v.name)).map(v => v.id);
      setHighlightedVenueIds(mentioned);
      setChatMessages(prev => [...prev, { role: 'ai', text: aiText }]);
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }, 520);
  }, [chatLoading]);

  // ── Map init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, { center: CENTER, zoom: 14, zoomControl: true });
    mapRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    // Full network “base” so every modeled road reads as connected (Carto still shows extra minor alleys we don’t have data for)
    roadUnderlayRef.current = [];
    ALL_SEGMENTS.forEach((seg) => {
      const u = L.polyline(mapPolylineCoords(seg), {
        color: '#6EE7B7',
        weight: 2.6,
        opacity: 0.38,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map);
      roadUnderlayRef.current.push(u);
    });

    // Draw ALL roads as one traffic layer: residential first, then arterials on top at overlaps
    const levelsInit = liveLevRef.current;
    const drawSeg = (seg: TrafficSegment) => {
      const level = levelsInit[seg.id] ?? seg.baseLevel;
      const st = trafficPolyStyle(seg, level);
      const poly = L.polyline(mapPolylineCoords(seg), {
        ...st,
        lineCap: 'round',
        lineJoin: 'round',
      })
        .bindTooltip(trafficTooltipHtml(seg, level), { sticky: true })
        .addTo(map);
      polyRefs.current.set(seg.id, poly);
    };
    BG_STREETS.forEach(drawSeg);
    BASE_SEGMENTS.forEach(drawSeg);

    LOCATIONS.forEach((loc) => {
      L.circleMarker(loc.pos, { radius: loc.r, fillColor: loc.color, fillOpacity: 1, color: '#fff', weight: 2 })
        .bindTooltip(`<b>${loc.name}</b>`, { direction: 'top' })
        .addTo(map);
    });

    // Venue markers
    VENUES.forEach((v) => {
      const m = L.marker([v.lat, v.lon], { icon: makeVenueIcon(v.type), zIndexOffset: 500, interactive: true })
        .bindTooltip(makeVenueTooltip(v), {
          direction: 'top', sticky: false, permanent: false, opacity: 1,
          className: 'venue-tt',
        })
        .on('click', () => { selectVenueRef.current(v); })
        .addTo(map);
      venueMarkersRef.current.push(m);
    });

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      roadUnderlayRef.current.forEach((p) => p.remove());
      roadUnderlayRef.current = [];
      map.remove();
      mapRef.current = null;
      polyRefs.current.clear();
      vehiclesRef.current = [];
      venueMarkersRef.current = [];
      densityLayersRef.current = [];
    };
  }, []);

  // ── Venue show / hide ────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    venueMarkersRef.current.forEach((m) => {
      if (showVenues) m.addTo(map); else m.remove();
    });
  }, [showVenues]);

  // ── Population density overlay ─────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Remove old circles
    densityLayersRef.current.forEach((c) => c.remove());
    densityLayersRef.current = [];
    if (!showDensity) return;
    // Sort lowest→highest so hotspots render on top
    const sorted = [...DENSITY_ZONES].sort((a, b) => a.baseDensity - b.baseDensity);
    sorted.forEach((z) => {
      // ±8% real-time fluctuation on each refresh
      const jitter = 0.92 + Math.random() * 0.16;
      const d = Math.round(z.baseDensity * jitter);
      const circle = L.circle([z.lat, z.lon], {
        radius:      z.r,
        fillColor:   densityColor(d),
        fillOpacity: d >= 2000 ? 0.38 : d >= 1000 ? 0.30 : 0.22,
        stroke:      false,
        interactive: false,
      }).addTo(map);
      densityLayersRef.current.push(circle);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDensity, lastUpdated]);

  // ── Vehicle spawn / despawn ─────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    vehiclesRef.current.forEach((v) => v.marker.remove());
    vehiclesRef.current = [];
    if (showVehicles) vehiclesRef.current = spawnVehicles(ALL_SEGMENTS, liveLevRef.current, map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVehicles]);

  // ── Animation loop ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!showVehicles) {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
      return;
    }

    function frame(now: number) {
      const dt = lastTimeRef.current ? Math.min((now - lastTimeRef.current) / 1000, 0.08) : 0;
      lastTimeRef.current = now;

      const toRemove: number[] = [];

      vehiclesRef.current.forEach((v, idx) => {
        let seg = SEG_BY_ID.get(v.segId);
        if (!seg) { toRemove.push(idx); return; }
        let n = seg.coords.length;
        if (n < 2) { toRemove.push(idx); return; }

        const braking = now < v.brakeUntil;
        const effSpeed = braking ? v.baseSpeed * 0.15 : v.baseSpeed;
        v.t += effSpeed * dt * v.dir;

        // Interior waypoint steps + junction handoff onto another segment
        for (let step = 0; step < 48; step++) {
          seg = SEG_BY_ID.get(v.segId);
          if (!seg) { v.marker.remove(); toRemove.push(idx); return; }
          n = seg.coords.length;
          if (n < 2) { v.marker.remove(); toRemove.push(idx); return; }

          if (v.dir === 1 && v.t > 1) {
            if (v.wpIdx >= n - 2) {
              const lastArrival = { segId: v.segId, wpIdx: n - 2, dir: 1 as const };
              const ok = applyRoadTransition(v, lastArrival, n - 1, seg, liveLevRef.current);
              if (!ok) {
                v.marker.remove();
                toRemove.push(idx);
                return;
              }
              v.t = Math.max(0, Math.min(1, v.t));
              break;
            }
            v.t -= 1;
            v.wpIdx += 1;
            continue;
          }
          if (v.dir === -1 && v.t < 0) {
            if (v.wpIdx <= 0) {
              const lastArrival = { segId: v.segId, wpIdx: 0, dir: -1 as const };
              const ok = applyRoadTransition(v, lastArrival, 0, seg, liveLevRef.current);
              if (!ok) {
                v.marker.remove();
                toRemove.push(idx);
                return;
              }
              v.t = Math.max(0, Math.min(1, v.t));
              break;
            }
            v.t += 1;
            v.wpIdx -= 1;
            continue;
          }
          break;
        }

        if (!braking && Math.random() < 0.0003) {
          v.brakeUntil = now + 800 + Math.random() * 2200;
        }

        seg = SEG_BY_ID.get(v.segId);
        if (!seg) { toRemove.push(idx); return; }
        n = seg.coords.length;
        const clampedWp = Math.max(0, Math.min(n - 2, v.wpIdx));
        const dcAnim = displayCoordsForSeg(seg);
        const a = dcAnim[clampedWp]!;
        const b = dcAnim[clampedWp + 1]!;
        const tClamped = Math.max(0, Math.min(1, v.t));

        const [oLat, oLng] = laneOffset(a, b, v.lane);
        const lat = a[0] + (b[0] - a[0]) * tClamped + oLat;
        const lng = a[1] + (b[1] - a[1]) * tClamped + oLng;

        v.marker.setLatLng([lat, lng]);

        const el = v.marker.getElement();
        if (el) {
          const inner = el.querySelector('div') as HTMLElement | null;
          if (inner) inner.style.transform = `rotate(${angleDeg(a, b, v.dir)}deg)`;
        }
      });

      // Cull exited vehicles (reverse order preserves indices)
      for (let i = toRemove.length - 1; i >= 0; i--) {
        vehiclesRef.current.splice(toRemove[i], 1);
      }

      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);
    return () => { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; } };
  }, [showVehicles]);

  // ── Vehicle spawn inlet — replenish vehicles entering from city edges ────────

  useEffect(() => {
    if (!showVehicles) return;
    const id = setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      ALL_SEGMENTS.forEach((seg) => {
        const isBg   = !!seg.isBackground;
        const target = isBg ? 2 : VEHICLE_COUNTS[liveLevRef.current[seg.id] ?? seg.baseLevel];
        // Count per direction
        const on = vehiclesRef.current.filter((v) => v.segId === seg.id);
        const fwd = on.filter((v) => v.dir === 1).length;
        const bwd = on.filter((v) => v.dir === -1).length;
        const tFwd = Math.ceil(target / 2);
        const tBwd = Math.floor(target / 2);
        if (fwd < tFwd && seg.coords.length >= 2) {
          const gm = pickGatewaySpawnForSegment(seg.id);
          const nv =
            gm && gm.dir === 1 && Math.random() < 0.5
              ? spawnVehicleFromMove(gm, map, liveLevRef.current, `${seg.id}-s${spawnCounterRef.current++}`)
              : spawnOneVehicle(seg, 1, map, liveLevRef.current, `${seg.id}-s${spawnCounterRef.current++}`);
          if (nv) vehiclesRef.current.push(nv);
        }
        if (bwd < tBwd && seg.coords.length >= 2) {
          const gm = pickGatewaySpawnForSegment(seg.id);
          const nv =
            gm && gm.dir === -1 && Math.random() < 0.5
              ? spawnVehicleFromMove(gm, map, liveLevRef.current, `${seg.id}-s${spawnCounterRef.current++}`)
              : spawnOneVehicle(seg, -1, map, liveLevRef.current, `${seg.id}-s${spawnCounterRef.current++}`);
          if (nv) vehiclesRef.current.push(nv);
        }
      });
    }, 1600);
    return () => clearInterval(id);
  }, [showVehicles]);

  // ── Traffic refresh ─────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    const newLevels: Record<string, TrafficLevel> = {};

    // Main arteries — dynamic, drive traffic score
    BASE_SEGMENTS.forEach((seg) => {
      const next = jitter(seg.baseLevel);
      newLevels[seg.id] = next;
      const poly = polyRefs.current.get(seg.id);
      if (poly) {
        poly.setStyle(trafficPolyStyle(seg, next));
        poly.setTooltipContent(trafficTooltipHtml(seg, next));
      }
    });

    // Whole town network — same green / amber / red (slightly calmer jitter than arterials)
    BG_STREETS.forEach((seg) => {
      const next = Math.random() < 0.82 ? 'light' : jitter(seg.baseLevel);
      newLevels[seg.id] = next;
      const poly = polyRefs.current.get(seg.id);
      if (poly) {
        poly.setStyle(trafficPolyStyle(seg, next));
        poly.setTooltipContent(trafficTooltipHtml(seg, next));
      }
    });

    liveLevRef.current = newLevels;
    setLiveLevels(newLevels);
    setLastUpdated(new Date());
    setPulseKey((k) => k + 1);

    // Keep vehicle markers stable — only refresh colors to match new traffic levels
    if (showVehicles) syncVehicleTrafficIcons(vehiclesRef.current, newLevels);
  }, [showVehicles]);

  useEffect(() => { const id = setInterval(refresh, 30_000); return () => clearInterval(id); }, [refresh]);

  // ── Derived stats ───────────────────────────────────────────────────────────

  // Traffic score uses main arteries only (not residential background streets)
  const arterialLevels = BASE_SEGMENTS.map((s) => liveLevels[s.id] ?? s.baseLevel);
  const heavyCnt   = arterialLevels.filter((l) => l === 'heavy').length;
  const modCnt     = arterialLevels.filter((l) => l === 'moderate').length;
  const lightCnt   = arterialLevels.filter((l) => l === 'light').length;
  const score      = Math.round(100 - (heavyCnt / arterialLevels.length) * 60 - (modCnt / arterialLevels.length) * 20);
  const hourIndex  = Math.max(0, Math.min(HOURS.length - 1, new Date().getHours() - 10));
  const curFootfall = FOOTFALL[hourIndex] ?? 60;
  const totalVehicles = BASE_SEGMENTS.reduce((s, seg) => s + VEHICLE_COUNTS[liveLevels[seg.id] ?? seg.baseLevel], 0)
    + BG_STREETS.length * 2;

  // ── Render ──────────────────────────────────────────────────────────────────

  // Inject tooltip + highlight-pulse styles once
  useEffect(() => {
    const id = 'venue-tt-style';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      .venue-tt { background: #fff !important; border: 1px solid #E5E7EB !important; border-radius: 10px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.13) !important; padding: 10px 12px !important; width: 234px !important; max-width: 234px !important; white-space: normal !important; overflow: hidden !important; }
      .venue-tt::before, .leaflet-tooltip-top.venue-tt::before { display: none !important; }
      .venue-ai-highlight { animation: venuePulse 1.6s ease-in-out infinite; }
      @keyframes venuePulse { 0%,100% { stroke-opacity:0.95; fill-opacity:0.18; } 50% { stroke-opacity:0.2; fill-opacity:0.04; } }
    `;
    document.head.appendChild(s);
  }, []);

  // Draw / clear AI-mention highlight rings on map
  useEffect(() => {
    const map = mapRef.current;
    // Always clear previous rings first
    highlightLayersRef.current.forEach(l => l.remove());
    highlightLayersRef.current = [];
    if (!map || highlightedVenueIds.length === 0) return;
    highlightedVenueIds.forEach(id => {
      const v = VENUES.find(x => x.id === id);
      if (!v) return;
      // Outer glow ring
      const outer = (L.circle as Function)([v.lat, v.lon], {
        radius: 55, color: '#F97316', weight: 2.5, opacity: 0.9,
        fillColor: '#F97316', fillOpacity: 0.10, className: 'venue-ai-highlight', interactive: false,
      }).addTo(map);
      // Inner ring
      const inner = (L.circle as Function)([v.lat, v.lon], {
        radius: 28, color: '#F97316', weight: 1.5, opacity: 0.7,
        fillColor: '#F97316', fillOpacity: 0.08, className: 'venue-ai-highlight', interactive: false,
      }).addTo(map);
      highlightLayersRef.current.push(outer, inner);
    });
  }, [highlightedVenueIds]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(15,15,15,0.5)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: '92vw', maxWidth: 1240, height: '88vh', maxHeight: 780, background: P.bg, border: `1px solid ${P.border}` }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 shrink-0 border-b" style={{ borderColor: P.border }}>
          <Navigation className="h-4 w-4" style={{ color: P.primary }} />
          <span className="text-[13px] font-semibold text-foreground tracking-tight">Map Intelligence</span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-green-600">
            <span key={pulseKey} className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
          <span className="text-[11px] text-muted-foreground">
            Targovishte, Bulgaria · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          {/* Layer tabs */}
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: P.border + '88' }}>
            {(['traffic', 'footfall'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setActiveLayer(l)}
                className="flex items-center gap-1.5 px-3 h-6 rounded-md text-[11px] font-medium transition-all"
                style={activeLayer === l ? { background: '#fff', color: P.primary, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: P.muted }}
              >
                {l === 'traffic' ? <Activity className="h-3 w-3" /> : <Footprints className="h-3 w-3" />}
                {l === 'traffic' ? 'Traffic' : 'Footfall'}
              </button>
            ))}
          </div>

          {/* Venues toggle */}
          <button
            onClick={() => setShowVenues((v) => !v)}
            className="flex items-center gap-1.5 px-3 h-6 rounded-lg text-[11px] font-medium border transition-all"
            style={showVenues
              ? { background: '#F5F3FF', color: '#7C3AED', borderColor: '#DDD6FE' }
              : { background: 'transparent', color: P.muted, borderColor: P.border }}
          >
            <Store className="h-3 w-3" />
            Places
            {showVenues && (
              <span className="ml-0.5 text-[9px] font-bold px-1 rounded-full" style={{ background: '#7C3AED', color: '#fff' }}>
                {VENUES.length}
              </span>
            )}
          </button>

          {/* Vehicles toggle */}
          <button
            onClick={() => setShowVehicles((v) => !v)}
            className="flex items-center gap-1.5 px-3 h-6 rounded-lg text-[11px] font-medium border transition-all"
            style={showVehicles
              ? { background: '#FFF7ED', color: P.primary, borderColor: '#FED7AA' }
              : { background: 'transparent', color: P.muted, borderColor: P.border }}
          >
            <Car className="h-3 w-3" />
            Vehicles
            {showVehicles && (
              <span className="ml-0.5 text-[9px] font-bold px-1 rounded-full" style={{ background: P.primary, color: '#fff' }}>
                {totalVehicles}
              </span>
            )}
          </button>

          {/* Population Density toggle */}
          <button
            onClick={() => setShowDensity((v) => !v)}
            className="flex items-center gap-1.5 px-3 h-6 rounded-lg text-[11px] font-medium border transition-all"
            style={showDensity
              ? { background: '#FEF2F2', color: '#DC2626', borderColor: '#FECACA' }
              : { background: 'transparent', color: P.muted, borderColor: P.border }}
          >
            <Users className="h-3 w-3" />
            Density
            {showDensity && (
              <span className="ml-0.5 text-[9px] font-bold px-1 rounded-full" style={{ background: '#DC2626', color: '#fff' }}>
                LIVE
              </span>
            )}
          </button>

          <div className="ml-auto flex items-center gap-1">
            {/* Statistics panel toggle */}
            <button
              onClick={() => setChatExpanded(e => !e)}
              title={chatExpanded ? 'Show Statistics' : 'Expand AI Chat'}
              className="flex items-center gap-1 px-2 h-6 rounded-lg text-[11px] font-medium border transition-all"
              style={chatExpanded
                ? { background: '#FFF7ED', color: P.primary, borderColor: '#FED7AA' }
                : { background: 'transparent', color: P.muted, borderColor: P.border }}
            >
              {chatExpanded
                ? <><PanelRight className="h-3 w-3" />Stats</>
                : <><MessageSquare className="h-3 w-3" />AI Chat</>}
            </button>
            <button onClick={refresh} title="Refresh" className="p-1 rounded-md hover:bg-black/5 transition-colors" style={{ color: P.muted }}>
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-black/5 transition-colors" style={{ color: P.muted }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <div ref={mapDivRef} className="flex-1 min-w-0" />

          {/* Stats sidebar */}
          <div className="w-72 shrink-0 flex flex-col border-l overflow-hidden" style={{ borderColor: P.border }}>
          {/* ── scrollable stats section — hidden when chat is expanded ──── */}
          {!chatExpanded && <div className="flex-1 overflow-y-auto min-h-0">

            {selectedVenue ? (
              /* ── Venue detail panel ─────────────────────────────────────── */
              <div className="flex flex-col min-h-0">
                {/* Back */}
                <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b shrink-0" style={{ borderColor: P.border }}>
                  <button
                    onClick={() => setSelectedVenue(null)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="h-3 w-3" /> All venues
                  </button>
                </div>

                {/* Header */}
                <div className="px-4 pt-4 pb-3 border-b shrink-0" style={{ borderColor: P.border }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: VENUE_STYLE[selectedVenue.type].bg }}>
                      {selectedVenue.type === 'restaurant' ? <Utensils className="h-3.5 w-3.5 text-white" /> :
                       selectedVenue.type === 'bar'        ? <Wine     className="h-3.5 w-3.5 text-white" /> :
                       selectedVenue.type === 'cafe'       ? <Coffee   className="h-3.5 w-3.5 text-white" /> :
                       selectedVenue.type === 'club'       ? <Music    className="h-3.5 w-3.5 text-white" /> :
                                                             <Zap      className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <span className="text-[13px] font-bold text-foreground leading-tight">{selectedVenue.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: VENUE_STYLE[selectedVenue.type].bg }}>{VENUE_STYLE[selectedVenue.type].label}</span>
                    <span className="text-[12px]" style={{ color:'#FBBF24' }}>{'★'.repeat(Math.floor(selectedVenue.rating))}{'☆'.repeat(5-Math.floor(selectedVenue.rating))}</span>
                    <span className="text-[11px] font-semibold text-muted-foreground">{'$'.repeat(selectedVenue.priceRange)}</span>
                  </div>
                  {selectedVenue.cuisine && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                      <Utensils className="h-3 w-3 shrink-0" />{selectedVenue.cuisine}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                    <Clock className="h-3 w-3 shrink-0" />{selectedVenue.hours}
                  </div>
                  {selectedVenue.phone && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />{selectedVenue.phone}
                    </div>
                  )}
                </div>

                {/* Sentiment */}
                <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: P.border }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Sentiment Analysis</p>
                  {([
                    { key:'food',       label:'Food',       Icon: Utensils,    val: selectedVenue.sentiment.food       },
                    { key:'service',    label:'Service',    Icon: Zap,         val: selectedVenue.sentiment.service    },
                    { key:'value',      label:'Value',      Icon: DollarSign,  val: selectedVenue.sentiment.value      },
                    { key:'atmosphere', label:'Atmosphere', Icon: Star,        val: selectedVenue.sentiment.atmosphere },
                  ] as { key:string; label:string; Icon: React.ElementType; val:number }[]).map(({ key, label, Icon, val }) => (
                    <div key={key} className="flex items-center gap-2 mb-1.5">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground w-[78px] shrink-0">
                        <Icon className="h-3 w-3 shrink-0" />{label}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: P.border }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width:`${val}%`, background: val>=70?'#22C55E':val>=45?'#F59E0B':'#EF4444' }} />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">{val}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: P.border }}>
                    <span className="text-[10px] text-muted-foreground">Opportunity score</span>
                    <span className="text-[11px] font-bold" style={{ color: selectedVenue.opportunityScore>=60?P.primary:selectedVenue.opportunityScore>=35?'#F59E0B':'#22C55E' }}>{selectedVenue.opportunityScore}/100</span>
                  </div>
                </div>

                {/* AI Insight */}
                <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: P.border }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: P.primary }}>
                    <Sparkles className="h-3 w-3" />AI Insight
                  </p>
                  <p className="text-[11px] leading-relaxed" style={{ color:'#374151' }}>{selectedVenue.aiInsight}</p>
                </div>

                {/* Reviews */}
                <div className="px-4 py-3 overflow-y-auto">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Customer Reviews</p>
                  <div className="space-y-3">
                    {selectedVenue.reviews.map((r, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ background:'#F9F8F6', border:`1px solid ${P.border}` }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-foreground">{r.author}</span>
                          <span className="text-[10px] text-muted-foreground">{r.date}</span>
                        </div>
                        <div className="mb-1.5" style={{ color:'#FBBF24', fontSize:11 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                        <p className="text-[11px] leading-relaxed mb-2" style={{ color:'#374151' }}>{r.text}</p>
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map((t,j) => (
                            <span key={j} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: P.border, color:'#6B7280' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ── Default stats ──────────────────────────────────────────── */
              <>

            {/* Population Density legend */}
            {showDensity && (
              <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: P.border }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Population Density
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>LIVE</span>
                </p>
                <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  Residents per km² · updates every 30s · ±8% real-time variance
                </p>
                <div className="space-y-1.5">
                  {DENSITY_LEGEND.map(({ label, color, sub }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm shrink-0 opacity-80" style={{ background: color }} />
                      <span className="text-[11px] text-muted-foreground flex-1">{sub}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/70">{label}</span>
                    </div>
                  ))}
                </div>
                {/* Gradient bar */}
                <div className="mt-3 h-2 rounded-full overflow-hidden"
                  style={{ background: 'linear-gradient(to right, #15803D, #22C55E, #84CC16, #EAB308, #F97316, #DC2626, #7F1D1D)' }} />
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-muted-foreground/60">Low</span>
                  <span className="text-[9px] text-muted-foreground/60">High</span>
                </div>
              </div>
            )}

            {/* Traffic score */}
            <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: P.border }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Layers className="h-3 w-3" /> Traffic Score
              </p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tabular-nums" style={{ color: score >= 70 ? '#16A34A' : score >= 45 ? P.primary : P.rose }}>{score}</span>
                <span className="text-sm text-muted-foreground mb-1">/ 100</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {score >= 70 ? 'Flowing freely — good footfall access' : score >= 45 ? 'Moderate congestion nearby' : 'Heavy congestion — peak period'}
              </p>
              <div className="mt-3 space-y-1.5">
                {([['heavy', heavyCnt, '#EF4444'], ['moderate', modCnt, '#F59E0B'], ['light', lightCnt, '#22C55E']] as const).map(([label, count, color]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[11px] text-muted-foreground capitalize flex-1">{label}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: P.border }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(count / arterialLevels.length) * 100}%`, background: color }} />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground w-4 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live vehicles */}
            {showVehicles && (
              <div className="px-5 pt-4 pb-4 border-b" style={{ borderColor: P.border }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Car className="h-3 w-3" /> Live Vehicles
                </p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-bold tabular-nums" style={{ color: P.primary }}>{totalVehicles}</span>
                  <span className="text-[11px] text-muted-foreground mb-0.5">on road</span>
                </div>
                <div className="space-y-1">
                  {(['heavy', 'moderate', 'light'] as TrafficLevel[]).map((l) => {
                    const vCount = BASE_SEGMENTS.filter((s) => (liveLevels[s.id] ?? s.baseLevel) === l).length * VEHICLE_COUNTS[l];
                    if (!vCount) return null;
                    return (
                      <div key={l} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: TRAFFIC_COLORS[l] }} />
                        <span className="text-[11px] text-muted-foreground capitalize flex-1">{l} zones</span>
                        <span className="text-[11px] font-mono text-muted-foreground">{vCount} vehicles</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-2">Bidirectional · lane-separated · speed matches congestion</p>
              </div>
            )}

            {/* Footfall */}
            <div className="px-5 pt-4 pb-4 border-b" style={{ borderColor: P.border }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Footfall Index
              </p>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold tabular-nums" style={{ color: P.primary }}>{curFootfall}%</span>
                <span className="text-[11px] text-muted-foreground mb-0.5">of daily peak</span>
              </div>
              <div className="flex items-end gap-0.5 h-12">
                {HOURS.map((h, i) => (
                  <div key={h} className="flex-1">
                    <div className="w-full rounded-sm" style={{ height: `${(FOOTFALL[i] / 100) * 44}px`, background: i === hourIndex ? P.primary : P.border, opacity: i === hourIndex ? 1 : 0.8 }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground">10:00</span>
                <span className="text-[9px] text-muted-foreground">21:00</span>
              </div>
            </div>

            {/* Peaks */}
            <div className="px-5 pt-4 pb-4 border-b" style={{ borderColor: P.border }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Today's Peaks
              </p>
              {[{ label: 'Lunch rush', time: '13:00 – 14:00', pct: 88 }, { label: 'Evening peak', time: '19:00 – 20:00', pct: 92 }].map((peak) => (
                <div key={peak.label} className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-3 w-3 shrink-0" style={{ color: P.primary }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground">{peak.label}</p>
                    <p className="text-[10px] text-muted-foreground">{peak.time}</p>
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: P.primary }}>{peak.pct}%</span>
                </div>
              ))}
            </div>

            {/* Generators */}
            <div className="px-5 pt-4 pb-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <Navigation className="h-3 w-3" /> Nearby Generators
              </p>
              {GENERATORS.map((g) => (
                <div key={g.name} className="flex items-center gap-2 mb-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{g.dist} · {g.walk} walk</p>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: g.flow === 'High' ? '#FFF7ED' : '#FAFAF9', color: g.flow === 'High' ? P.primary : P.muted, border: `1px solid ${P.border}` }}>
                    {g.flow}
                  </span>
                </div>
              ))}
            </div>
              </>
            )}
          </div>}{/* end scrollable stats */}

          {/* ── AI Intelligence Chat — pinned at bottom OR full sidebar ───── */}
          <div
            className={`flex flex-col border-t ${chatExpanded ? 'flex-1 overflow-hidden' : 'shrink-0'}`}
            style={{ borderColor: P.border, ...(chatExpanded ? {} : { height: '320px', overflow: 'hidden' }) }}
          >

            {/* Chat header */}
            <div className="flex items-center gap-1.5 px-3 py-2 shrink-0" style={{ background: P.bg, borderBottom: `1px solid ${P.border}` }}>
              <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: P.primary }} />
              <span className="text-[10px] font-bold uppercase tracking-widest flex-1" style={{ color: P.primary }}>Map Intelligence AI</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full mr-1" style={{ background:'#DCFCE7', color:'#15803D' }}>● LIVE</span>
              {/* Stats toggle — only shown when chat is expanded */}
              {chatExpanded && (
                <button
                  onClick={() => setChatExpanded(false)}
                  className="flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-md border transition-colors hover:bg-black/5"
                  style={{ borderColor: P.border, color: P.muted }}
                  title="Show Statistics"
                >
                  <PanelRight className="h-3 w-3" />Stats
                </button>
              )}
              {/* Expand / collapse toggle */}
              <button
                onClick={() => setChatExpanded(e => !e)}
                className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-black/5 transition-colors"
                style={{ color: P.muted }}
                title={chatExpanded ? 'Collapse chat' : 'Expand chat to full panel'}
              >
                {chatExpanded
                  ? <Minimize2 className="h-3.5 w-3.5" />
                  : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Messages / example chips */}
            <div
              className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2 min-h-0"
              style={{ overscrollBehavior: 'contain' }}
              onWheel={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              {chatMessages.length === 0 && !chatLoading ? (
                <div>
                  <p className="text-[9.5px] text-muted-foreground mb-2 font-medium">Ask about your competitive landscape:</p>
                  {EXAMPLE_QUESTIONS.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      onClick={() => handleChatSend(text)}
                      className="flex items-center gap-2 w-full text-left text-[10px] px-2.5 py-1.5 rounded-lg border mb-1.5 transition-all hover:shadow-sm"
                      style={{ borderColor: P.border, background: '#fff', color:'#374151' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = P.primary; (e.currentTarget as HTMLElement).style.color = P.primary; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = P.border; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
                    >
                      <Icon className="h-3 w-3 shrink-0" style={{ color: P.primary }} />
                      {text}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'ai' ? (
                        <div className="flex items-start gap-1.5 max-w-full">
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" style={{ color: P.primary }} />
                          <div
                            className="text-[10px] leading-relaxed rounded-lg px-2.5 py-2 border whitespace-pre-wrap"
                            style={{ background:'#fff', borderColor: P.border, color:'#374151', maxWidth:'94%' }}
                          >
                            {msg.text.split('\n').map((line, li) => {
                              if (!line.trim()) return <div key={li} className="h-1" />;
                              const isBold = /^[A-Z\s\-—×·•]+$/.test(line) && line.length > 6 && line.length < 60;
                              return <p key={li} className={isBold ? 'font-bold text-foreground mt-1' : ''}>{line}</p>;
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] px-2.5 py-1.5 rounded-lg max-w-[85%]"
                          style={{ background: P.primary, color:'#fff' }}>
                          {msg.text}
                        </div>
                      )}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3 w-3 shrink-0" style={{ color: P.primary }} />
                      <div className="flex gap-1 px-2.5 py-2 rounded-lg border" style={{ background:'#fff', borderColor: P.border }}>
                        {[0,1,2].map(d => (
                          <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: P.primary, animationDelay:`${d*0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="px-3 pb-2.5 pt-1.5 shrink-0" style={{ borderTop: `1px solid ${P.border}` }}>
              {chatMessages.length > 0 && (
                <button
                  onClick={() => { setChatMessages([]); setHighlightedVenueIds([]); }}
                  className="text-[9px] text-muted-foreground hover:text-foreground mb-1.5 transition-colors"
                >
                  ← back to suggestions
                </button>
              )}
              <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5"
                style={{ borderColor: P.border, background:'#fff' }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !chatLoading && handleChatSend(chatInput)}
                  placeholder="Ask about traffic, competitors…"
                  className="flex-1 text-[10.5px] bg-transparent outline-none placeholder:text-muted-foreground"
                  disabled={chatLoading}
                />
                <button
                  onClick={() => handleChatSend(chatInput)}
                  disabled={!chatInput.trim() || chatLoading}
                  className="p-0.5 rounded transition-opacity disabled:opacity-30"
                  style={{ color: P.primary }}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>{/* end chat panel */}

          </div>{/* end stats sidebar */}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-5 py-2.5 border-t text-[10px] text-muted-foreground shrink-0" style={{ borderColor: P.border, background: '#F5F3EF' }}>
          <span className="font-semibold uppercase tracking-widest mr-1">Roads</span>
          {(['heavy', 'moderate', 'light'] as TrafficLevel[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5 capitalize">
              <span className="w-5 h-1.5 rounded-full inline-block" style={{ background: TRAFFIC_COLORS[l] }} />{l}
            </span>
          ))}
          <span className="ml-3 font-semibold uppercase tracking-widest mr-1">Vehicles</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-2 rounded-sm border border-white/60" style={{ background: '#7F1D1D' }} />Heavy zone</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-2 rounded-sm border border-white/60" style={{ background: '#78350F' }} />Moderate</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-2 rounded-sm border border-white/60" style={{ background: '#14532D' }} />Light</span>
          <span className="ml-auto">OpenStreetMap roads · CartoDB tiles · updates every 30 s</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
